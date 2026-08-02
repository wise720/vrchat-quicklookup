import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { ThemeProvider } from "./theme";
import { AppShell, PublicOnly } from "./shell";
import { SignInPage } from "./pages/SignIn";
import { ChangePasswordPage } from "./pages/ChangePassword";
import { LookupPage } from "./pages/Lookup";
import { UserDetailPage } from "./pages/UserDetail";
import { AdminPage } from "./pages/Admin";

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/signin"
              element={
                <PublicOnly>
                  <SignInPage />
                </PublicOnly>
              }
            />
            <Route element={<AppShell />}>
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/" element={<LookupPage />} />
              <Route path="/user/:userId" element={<UserDetailPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
