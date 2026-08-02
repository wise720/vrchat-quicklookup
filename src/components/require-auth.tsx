"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && pathname !== "/signin") {
      router.replace("/signin");
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-[var(--muted)]">
        Checking VRChat session…
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}
