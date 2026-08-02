"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type AuthUser } from "@/components/auth-provider";
import type { SessionCookies, TwoFactorMethod } from "@/lib/vrchat/types";

const TWO_FACTOR_LABELS: Record<TwoFactorMethod, string> = {
  totp: "Authenticator app",
  otp: "Recovery code",
  emailotp: "Email",
};

export default function SignInPage() {
  const router = useRouter();
  const { setSession, refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [methods, setMethods] = useState<TwoFactorMethod[] | null>(null);
  const [method, setMethod] = useState<TwoFactorMethod>("totp");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finishSignIn(user: AuthUser, session: SessionCookies) {
    setSession(session, user);
    await refresh();
    router.replace("/");
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as {
        status?: string;
        methods?: TwoFactorMethod[];
        user?: AuthUser;
        session?: SessionCookies;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Sign in failed");

      if (data.status === "twoFactorRequired" && data.methods) {
        setMethods(data.methods);
        setMethod(data.methods[0] ?? "totp");
        return;
      }

      if (data.user && data.session) {
        await finishSignIn(data.user, data.session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Re-send username/password so login+2FA happen in one serverless call.
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          method,
          username,
          password,
        }),
      });
      const data = (await res.json()) as {
        user?: AuthUser;
        session?: SessionCookies;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Verification failed");
      if (data.user && data.session) {
        await finishSignIn(data.user, data.session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--glow)_0%,_transparent_55%)] opacity-80"
      />
      <div className="relative w-full max-w-md">
        <p className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)]">
          VRChat Quick Lookup
        </p>
        <p className="mt-2 text-[var(--muted)]">
          Sign in with your VRChat account. Your session stays in this browser
          only.
        </p>

        {!methods ? (
          <form onSubmit={onLogin} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Username or email</span>
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Password</span>
              <input
                type="password"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className="text-sm text-[var(--problem)]">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--accent)] px-4 py-2.5 font-medium text-[var(--accent-ink)] disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in with VRChat"}
            </button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="mt-8 flex flex-col gap-4">
            <p className="text-sm text-[var(--muted)]">
              Enter your two-factor code to finish signing in.
              {methods.length === 1 && (
                <>
                  {" "}
                  Using{" "}
                  {TWO_FACTOR_LABELS[methods[0]]?.toLowerCase() ?? methods[0]}.
                </>
              )}
            </p>
            {methods.length > 1 && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Verification method</span>
                <select
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as TwoFactorMethod)}
                >
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {TWO_FACTOR_LABELS[m] ?? m}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">
                {method === "emailotp"
                  ? "Email code"
                  : method === "otp"
                    ? "Recovery code"
                    : "Authenticator code"}
              </span>
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 tracking-widest text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </label>
            {error && <p className="text-sm text-[var(--problem)]">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--accent)] px-4 py-2.5 font-medium text-[var(--accent-ink)] disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify and continue"}
            </button>
            <button
              type="button"
              className="text-sm text-[var(--muted)] underline"
              onClick={() => {
                setMethods(null);
                setCode("");
              }}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
