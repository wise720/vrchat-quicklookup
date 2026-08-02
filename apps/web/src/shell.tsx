import type { ReactNode } from "react";
import { Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { ThemeToggle } from "./theme";

export function AppShell() {
  const { user, loading, logout, isAdmin, isOwner } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="center-msg">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }

  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (!user.mustChangePassword && location.pathname === "/change-password") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          VRChat Quick Lookup
        </Link>
        <nav>
          {!user.mustChangePassword && (
            <>
              <Link to="/">Lookup</Link>
              {isAdmin && <Link to="/admin">Admin</Link>}
            </>
          )}
          <span className="muted">{user.email}</span>
          {isOwner && <span className="pill">owner</span>}
          {!isOwner && isAdmin && <span className="pill">admin</span>}
          <ThemeToggle />
          <button type="button" className="linkish" onClick={logout}>
            Sign out
          </button>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-msg">Loading…</div>;
  if (user) {
    if (user.mustChangePassword) {
      return <Navigate to="/change-password" replace />;
    }
    return <Navigate to="/" replace />;
  }
  return children;
}
