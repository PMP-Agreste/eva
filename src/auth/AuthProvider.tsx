import React, { createContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserProfile } from '../types/models';

type AuthState = {
  user: User | null;
  profile: UserProfile | null;

  authLoading: boolean;
  profileLoading: boolean;

  error: string | null;

  signIn: (email: string, senha: string) => Promise<void>;
  signOutNow: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      setError(null);

      if (!u) {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
  if (!user) return;

  setProfileLoading(true);
  setError(null);

  const ref = doc(db, 'users', user.uid);

  const unsub = onSnapshot(
    ref,
    (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setProfileLoading(false);
    },
    (err) => {
      setError(err.message);
      setProfile(null);
      setProfileLoading(false);
    },
  );

  return () => unsub();
}, [user]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      authLoading,
      profileLoading,
      error,
      signIn: async (email: string, senha: string) => {
        setError(null);
        await signInWithEmailAndPassword(auth, email, senha);
      },
      signOutNow: async () => {
        await signOut(auth);
      },
    }),
    [user, profile, authLoading, profileLoading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
