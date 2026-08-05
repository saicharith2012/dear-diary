import {
  deriveKeyFromPasscode,
  fromBase64,
  generateMasterKey,
  MIN_PASSCODE_LENGTH,
  PASSCODE_PBKDF2_ITERATIONS,
  randomSalt,
  toBase64,
  unwrapMasterKey,
  wrapMasterKey,
} from "./crypto";
import { getProfile, saveProfile, wipeAllData } from "./storage";
import type { VaultProfile } from "./types";

export function isCryptoSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof crypto !== "undefined" &&
    !!crypto.subtle
  );
}

export function validatePasscode(passcode: string): string | null {
  if (passcode.length < MIN_PASSCODE_LENGTH) {
    return `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`;
  }
  return null;
}

export async function registerVault(
  displayName: string,
  passcode: string,
): Promise<{ profile: VaultProfile; masterKey: CryptoKey }> {
  if (!isCryptoSupported()) {
    throw new Error("Web Crypto is not available in this browser.");
  }

  const passcodeError = validatePasscode(passcode);
  if (passcodeError) throw new Error(passcodeError);

  const name = displayName.trim() || "diary-keeper";
  const salt = randomSalt(32);
  const iterations = PASSCODE_PBKDF2_ITERATIONS;
  const masterKey = await generateMasterKey();
  const wrappingKey = await deriveKeyFromPasscode(passcode, salt, iterations);
  const { wrapped, iv } = await wrapMasterKey(wrappingKey, masterKey);

  const profile: VaultProfile = {
    displayName: name,
    createdAt: Date.now(),
    passcodeSalt: toBase64(salt),
    passcodeIterations: iterations,
    wrappedMasterKey: toBase64(wrapped),
    wrapIv: toBase64(iv),
  };

  await saveProfile(profile);
  return { profile, masterKey };
}

export async function unlockWithPasscode(
  passcode: string,
): Promise<{ profile: VaultProfile; masterKey: CryptoKey }> {
  const profile = await getProfile();
  if (!profile) {
    throw new Error("No diary vault found. Create a passcode first.");
  }

  if (!profile.wrappedMasterKey || !profile.wrapIv || !profile.passcodeSalt) {
    throw new Error(
      "This vault uses an older lock method. Reset the diary to create a new vault.",
    );
  }

  const wrappingKey = await deriveKeyFromPasscode(
    passcode,
    fromBase64(profile.passcodeSalt),
    profile.passcodeIterations || PASSCODE_PBKDF2_ITERATIONS,
  );

  try {
    const masterKey = await unwrapMasterKey(
      wrappingKey,
      fromBase64(profile.wrappedMasterKey),
      fromBase64(profile.wrapIv),
    );
    return { profile, masterKey };
  } catch {
    throw new Error("Incorrect passcode.");
  }
}

/**
 * Re-wrap the existing master key under a new passcode.
 * Entry ciphertext is unchanged—only the IndexedDB wrap blob is replaced.
 */
export async function changePasscode(
  currentPasscode: string,
  newPasscode: string,
): Promise<VaultProfile> {
  if (!isCryptoSupported()) {
    throw new Error("Web Crypto is not available in this browser.");
  }

  const newError = validatePasscode(newPasscode);
  if (newError) throw new Error(newError);

  if (currentPasscode === newPasscode) {
    throw new Error("New passcode must be different from the current one.");
  }

  const profile = await getProfile();
  if (!profile?.wrappedMasterKey || !profile.wrapIv || !profile.passcodeSalt) {
    throw new Error("No diary vault found.");
  }

  const currentWrappingKey = await deriveKeyFromPasscode(
    currentPasscode,
    fromBase64(profile.passcodeSalt),
    profile.passcodeIterations || PASSCODE_PBKDF2_ITERATIONS,
  );

  let masterKey: CryptoKey;
  try {
    masterKey = await unwrapMasterKey(
      currentWrappingKey,
      fromBase64(profile.wrappedMasterKey),
      fromBase64(profile.wrapIv),
      { extractable: true },
    );
  } catch {
    throw new Error("Incorrect current passcode.");
  }

  const salt = randomSalt(32);
  const iterations = PASSCODE_PBKDF2_ITERATIONS;
  const nextWrappingKey = await deriveKeyFromPasscode(
    newPasscode,
    salt,
    iterations,
  );
  const { wrapped, iv } = await wrapMasterKey(nextWrappingKey, masterKey);

  const nextProfile: VaultProfile = {
    ...profile,
    passcodeSalt: toBase64(salt),
    passcodeIterations: iterations,
    wrappedMasterKey: toBase64(wrapped),
    wrapIv: toBase64(iv),
  };

  await saveProfile(nextProfile);
  return nextProfile;
}

export async function resetVault(): Promise<void> {
  await wipeAllData();
}
