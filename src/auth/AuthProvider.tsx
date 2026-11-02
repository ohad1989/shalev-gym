import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

export type AuthUser = {
  id: string;
  email: string | null;
};

type AuthState = {
  loading: boolean;
  user: AuthUser | null;
  // False in local-only mode, where there is no account to sign in to or out of.
  accountsEnabled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  // Resolves to true when the user must confirm their email before they can sign in.
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const LOCAL_USER: AuthUser = { id: 'local', email: null };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabase !== null);
  const [user, setUser] = useState<AuthUser | null>(supabase ? null : LOCAL_USER);

  useEffect(() => {
    if (!supabase) return;
    // Fires once immediately with the saved session, then on every sign-in and sign-out.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session ? { id: session.user.id, email: session.user.email ?? null } : null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      accountsEnabled: supabase !== null,
      signIn: async (email, password) => {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async (email, password) => {
        if (!supabase) return false;
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data.session === null;
      },
      signOut: async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [loading, user],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const auth = use(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
}
