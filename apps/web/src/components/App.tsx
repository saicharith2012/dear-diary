"use client";

import { AuthProvider, useAuth } from "@dear-diary/core";
import { AuthScreen } from "@/components/AuthScreen";
import { DiaryApp } from "@/components/DiaryApp";
import { installWebAdapters } from "@/lib/adapters";

// Runs at module evaluation, before AuthProvider mounts and reads the vault.
installWebAdapters();

function Gate() {
  const { status } = useAuth();
  if (status === "unlocked") return <DiaryApp />;
  return <AuthScreen />;
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
