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
  apiFetch,
  clearClientSession,
  loadClientSession,
  saveClientSession,
  type ClientSession,
} from "@/lib/client/session";

export type AuthUser = {
  id: string;
  displayName: string;
  currentAvatarThumbnailImageUrl?: string;
  userIcon?: string;
  profilePicOverride?: string;
};

type AuthState = {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (session: ClientSession, user: AuthUser, isAdmin?: boolean) => void;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchMe(): Promise<{ user: AuthUser; isAdmin: boolean } | null> {
  if (!loadClientSession()) return null;
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) {
    if (res.status === 401) clearClientSession();
    return null;
  }
  const data = (await res.json()) as { user: AuthUser; isAdmin?: boolean };
  return { user: data.user, isAdmin: !!data.isAdmin };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await fetchMe();
    setUser(next?.user ?? null);
    setIsAdmin(next?.isAdmin ?? false);
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    clearClientSession();
    setUser(null);
    setIsAdmin(false);
  }, []);

  const setSession = useCallback(
    (session: ClientSession, nextUser: AuthUser, admin = false) => {
      saveClientSession(session);
      setUser(nextUser);
      setIsAdmin(admin);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((next) => {
      if (cancelled) return;
      setUser(next?.user ?? null);
      setIsAdmin(next?.isAdmin ?? false);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ user, isAdmin, loading, refresh, signOut, setSession }),
    [user, isAdmin, loading, refresh, signOut, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
