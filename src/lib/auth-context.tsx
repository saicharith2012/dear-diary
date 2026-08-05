"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  changePasscode as changePasscodeVault,
  getCryptoSupportInfo,
  registerVault,
  resetVault,
  unlockWithPasscode,
  type CryptoSupportInfo,
} from "@/lib/vault";
import { getProfile } from "@/lib/storage";
import type { AuthStatus, VaultProfile } from "@/lib/types";

interface AuthContextValue {
  status: AuthStatus;
  profile: VaultProfile | null;
  masterKey: CryptoKey | null;
  error: string | null;
  cryptoSupport: CryptoSupportInfo | null;
  register: (displayName: string, passcode: string) => Promise<void>;
  unlock: (passcode: string) => Promise<void>;
  changePasscode: (
    currentPasscode: string,
    newPasscode: string,
  ) => Promise<void>;
  lock: () => void;
  reset: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<VaultProfile | null>(null);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cryptoSupport, setCryptoSupport] = useState<CryptoSupportInfo | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = getCryptoSupportInfo();
      if (!cancelled) setCryptoSupport(support);
      if (!support.supported) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      try {
        const existing = await getProfile();
        if (cancelled) return;
        if (existing) {
          setProfile(existing);
          setStatus("locked");
        } else {
          setStatus("unregistered");
        }
      } catch {
        if (!cancelled) setStatus("unregistered");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async (displayName: string, passcode: string) => {
    setError(null);
    try {
      const { profile: p, masterKey: key } = await registerVault(
        displayName,
        passcode,
      );
      setProfile(p);
      setMasterKey(key);
      setStatus("unlocked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create vault");
      throw e;
    }
  }, []);

  const unlock = useCallback(async (passcode: string) => {
    setError(null);
    try {
      const { profile: p, masterKey: key } = await unlockWithPasscode(passcode);
      setProfile(p);
      setMasterKey(key);
      setStatus("unlocked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock diary");
      throw e;
    }
  }, []);

  const changePasscode = useCallback(
    async (currentPasscode: string, newPasscode: string) => {
      setError(null);
      try {
        const next = await changePasscodeVault(currentPasscode, newPasscode);
        setProfile(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change passcode");
        throw e;
      }
    },
    [],
  );

  const lock = useCallback(() => {
    setMasterKey(null);
    setStatus("locked");
  }, []);

  const reset = useCallback(async () => {
    setError(null);
    await resetVault();
    setMasterKey(null);
    setProfile(null);
    setStatus("unregistered");
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      status,
      profile,
      masterKey,
      error,
      cryptoSupport,
      register,
      unlock,
      changePasscode,
      lock,
      reset,
      clearError,
    }),
    [
      status,
      profile,
      masterKey,
      error,
      cryptoSupport,
      register,
      unlock,
      changePasscode,
      lock,
      reset,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
