"use client";

import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AuthScreen } from "@/components/AuthScreen";
import { DiaryApp } from "@/components/DiaryApp";

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
