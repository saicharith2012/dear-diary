/**
 * Crypto parity check for the monorepo extraction.
 *
 * Pulls the pre-extraction `src/lib/crypto.ts` out of a git ref and proves the
 * shared core is byte-compatible with it: keys wrapped by one side unwrap on
 * the other, and chunks encrypted by one decrypt on the other. If any PBKDF2 or
 * AES-GCM parameter drifted during the move, every existing vault would stop
 * opening — this catches that before a user does.
 *
 * Usage: node scripts/verify-crypto-parity.mjs [git-ref]   (default: HEAD)
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ref = process.argv[2] ?? "HEAD";
const LEGACY_PATH = "src/lib/crypto.ts";

/**
 * The core is written for bundlers (Metro, Turbopack), which resolve
 * extensionless relative imports. Node does not, so add the extension back on
 * the way through rather than littering the source with `.ts` suffixes.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ext of [".ts", ".tsx"]) {
        try {
          return nextResolve(specifier + ext, context);
        } catch {
          /* fall through */
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const scratch = mkdtempSync(join(tmpdir(), "dd-crypto-parity-"));
const checks = [];

function check(name, fn) {
  checks.push([name, fn]);
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function readAt(rev) {
  try {
    return git(["show", `${rev}:${LEGACY_PATH}`]);
  } catch {
    return null;
  }
}

/**
 * Once the monorepo move is committed, `HEAD:src/lib/crypto.ts` no longer
 * exists — so fall back to the newest commit that still had it. The rename
 * commit itself doesn't, hence the `^` probe on each candidate.
 */
function resolveLegacySource() {
  const candidates = [ref];
  try {
    candidates.push(
      ...git(["log", "--format=%H", "--follow", "--", LEGACY_PATH])
        .split("\n")
        .filter(Boolean),
    );
  } catch {
    /* no history for the path */
  }

  for (const candidate of candidates) {
    for (const rev of [candidate, `${candidate}^`]) {
      const source = readAt(rev);
      if (source) {
        if (rev !== ref) console.log(`  (legacy crypto read from ${rev})`);
        return source;
      }
    }
  }

  throw new Error(
    `Could not find ${LEGACY_PATH} at ${ref} or in its history. ` +
      `Pass a ref from before the monorepo move.`,
  );
}

const bytes = (...values) => new Uint8Array(values);
const filled = (length, seed) =>
  Uint8Array.from({ length }, (_, i) => (i * 31 + seed) & 0xff);

const PASSCODE = "correct horse battery staple";
const SALT = filled(32, 7);
const MASTER_RAW = filled(32, 101);

async function exportRaw(key) {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

async function main() {
  const legacyFile = join(scratch, "legacy-crypto.ts");
  writeFileSync(legacyFile, resolveLegacySource());

  const legacy = await import(pathToFileURL(legacyFile).href);
  const core = await import(
    pathToFileURL(join(repoRoot, "packages/core/src/crypto.ts")).href
  );
  const vault = await import(
    pathToFileURL(join(repoRoot, "packages/core/src/vault.ts")).href
  );
  const storage = await import(
    pathToFileURL(join(repoRoot, "packages/core/src/storage.ts")).href
  );

  check("constants are unchanged", () => {
    assert.equal(core.CHUNK_PLAIN_SIZE, legacy.CHUNK_PLAIN_SIZE);
    assert.equal(core.GCM_IV_BYTES, legacy.GCM_IV_BYTES);
    assert.equal(core.GCM_TAG_BYTES, legacy.GCM_TAG_BYTES);
    assert.equal(
      core.PASSCODE_PBKDF2_ITERATIONS,
      legacy.PASSCODE_PBKDF2_ITERATIONS,
    );
    assert.equal(core.MIN_PASSCODE_LENGTH, legacy.MIN_PASSCODE_LENGTH);
    assert.equal(
      core.CHUNK_STORED_SIZE,
      legacy.CHUNK_PLAIN_SIZE + legacy.GCM_IV_BYTES + legacy.GCM_TAG_BYTES,
    );
  });

  check("base64 round-trips identically", () => {
    const sample = bytes(0, 1, 2, 127, 128, 200, 255, 65, 66);
    assert.equal(core.toBase64(sample), legacy.toBase64(sample));
    assert.deepEqual(
      core.fromBase64(legacy.toBase64(sample)),
      legacy.fromBase64(core.toBase64(sample)),
    );
  });

  check("legacy-wrapped master key unwraps in core", async () => {
    const legacyWrapping = await legacy.deriveKeyFromPasscode(PASSCODE, SALT);
    const coreWrapping = await core.deriveKeyFromPasscode(PASSCODE, SALT);
    const master = await legacy.importAesKey(MASTER_RAW, true);

    const { wrapped, iv } = await legacy.wrapMasterKey(legacyWrapping, master);
    const unwrapped = await core.unwrapMasterKey(coreWrapping, wrapped, iv, {
      extractable: true,
    });
    assert.deepEqual(await exportRaw(unwrapped), MASTER_RAW);
  });

  check("core-wrapped master key unwraps in legacy", async () => {
    const legacyWrapping = await legacy.deriveKeyFromPasscode(PASSCODE, SALT);
    const coreWrapping = await core.deriveKeyFromPasscode(PASSCODE, SALT);
    const master = await core.importAesKey(MASTER_RAW, true);

    const { wrapped, iv } = await core.wrapMasterKey(coreWrapping, master);
    const unwrapped = await legacy.unwrapMasterKey(legacyWrapping, wrapped, iv, {
      extractable: true,
    });
    assert.deepEqual(await exportRaw(unwrapped), MASTER_RAW);
  });

  check("a wrong passcode still derives a key that cannot unwrap", async () => {
    const wrapping = await legacy.deriveKeyFromPasscode(PASSCODE, SALT);
    const wrong = await core.deriveKeyFromPasscode(PASSCODE + "!", SALT);
    const master = await legacy.importAesKey(MASTER_RAW, true);
    const { wrapped, iv } = await legacy.wrapMasterKey(wrapping, master);
    await assert.rejects(() => core.unwrapMasterKey(wrong, wrapped, iv));
  });

  check("legacy chunk ciphertext decrypts in core", async () => {
    const master = await legacy.importAesKey(MASTER_RAW, true);
    // Two full chunks plus a partial one, to exercise the boundary.
    const plaintext = filled(legacy.CHUNK_PLAIN_SIZE * 2 + 1234, 3);
    const chunks = await legacy.encryptInChunks(master, plaintext);
    assert.equal(chunks.length, 3);
    for (const chunk of chunks) {
      assert.ok(chunk.byteLength <= core.CHUNK_STORED_SIZE);
    }

    const decrypted = [];
    for (const chunk of chunks) decrypted.push(await core.decryptChunk(master, chunk));
    assert.deepEqual(core.concatUint8(decrypted), plaintext);
  });

  check("core chunk ciphertext decrypts in legacy", async () => {
    const master = await core.importAesKey(MASTER_RAW, true);
    const plaintext = filled(core.CHUNK_PLAIN_SIZE + 17, 9);
    const chunks = await core.encryptInChunks(master, plaintext);
    const decrypted = [];
    for (const chunk of chunks) decrypted.push(await legacy.decryptChunk(master, chunk));
    assert.deepEqual(legacy.concatUint8(decrypted), plaintext);
  });

  check("full vault lifecycle over an in-memory adapter", async () => {
    let profile = null;
    const chunks = new Map();
    storage.setStorageAdapter({
      getProfile: async () => profile,
      saveProfile: async (next) => void (profile = next),
      clearProfile: async () => void (profile = null),
      listEntries: async () => [],
      getEntry: async () => null,
      saveEntry: async () => {},
      deleteEntryRecord: async () => {},
      saveChunk: async (id, i, data) => void chunks.set(`${id}:${i}`, data.slice()),
      loadChunk: async (id, i) => chunks.get(`${id}:${i}`),
      deleteChunks: async () => {},
      wipeAllData: async () => {
        profile = null;
        chunks.clear();
      },
    });

    const { profile: created, masterKey } = await vault.registerVault(
      "parity-check",
      PASSCODE,
    );
    assert.equal(created.passcodeIterations, core.PASSCODE_PBKDF2_ITERATIONS);
    assert.equal(created.displayName, "parity-check");

    // Encrypt under the registered key, then prove the key survives a re-unlock.
    const secret = "the quick brown fox — ünïcodé ✓";
    const sealed = await core.encryptText(masterKey, secret);

    const reopened = await vault.unlockWithPasscode(PASSCODE);
    assert.equal(await core.decryptText(reopened.masterKey, sealed), secret);

    await assert.rejects(
      () => vault.unlockWithPasscode("wrong passcode"),
      /Incorrect passcode/,
    );

    await vault.changePasscode(PASSCODE, "a different passcode");
    await assert.rejects(
      () => vault.unlockWithPasscode(PASSCODE),
      /Incorrect passcode/,
    );

    // Re-wrapping must not re-encrypt entries: old ciphertext still opens.
    const rotated = await vault.unlockWithPasscode("a different passcode");
    assert.equal(await core.decryptText(rotated.masterKey, sealed), secret);

    await vault.resetVault();
    await assert.rejects(
      () => vault.unlockWithPasscode("a different passcode"),
      /No diary vault found/,
    );
  });

  let failed = 0;
  for (const [name, fn] of checks) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL ${name}`);
      console.log(`       ${err.message.split("\n")[0]}`);
    }
  }

  console.log(
    failed === 0
      ? `\ncrypto parity vs ${ref}: ${checks.length} checks passed`
      : `\ncrypto parity vs ${ref}: ${failed}/${checks.length} checks FAILED`,
  );
  return failed === 0 ? 0 : 1;
}

let code = 1;
try {
  code = await main();
} catch (err) {
  console.error(err);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(code);
