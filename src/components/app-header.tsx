"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

function avatarUrl(user: {
  currentAvatarThumbnailImageUrl?: string;
  userIcon?: string;
  profilePicOverride?: string;
}) {
  return (
    user.profilePicOverride ||
    user.userIcon ||
    user.currentAvatarThumbnailImageUrl ||
    ""
  );
}

export function AppHeader() {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/signin") return null;

  async function handleSignOut() {
    await signOut();
    router.replace("/signin");
  }

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--ink)]">
            VRChat Quick Lookup
          </Link>
          {user && (
            <nav className="flex gap-3 text-sm">
              <NavLink href="/" active={pathname === "/" || pathname.startsWith("/user")}>
                Lookup
              </NavLink>
              <NavLink href="/admin" active={pathname.startsWith("/admin")}>
                Admin
              </NavLink>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm">
          {loading ? (
            <span className="text-[var(--muted)]">…</span>
          ) : user ? (
            <>
              <div className="flex items-center gap-2">
                {avatarUrl(user) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl(user)}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-[var(--border)]" />
                )}
                <span className="hidden sm:inline text-[var(--ink)]">
                  {user.displayName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/signin"
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[var(--accent-ink)]"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "text-[var(--accent)] underline underline-offset-4"
          : "text-[var(--muted)] hover:text-[var(--ink)]"
      }
    >
      {children}
    </Link>
  );
}
