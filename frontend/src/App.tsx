import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { useAuth } from "./auth/useAuth";
import { Layout } from "./components/Layout";
import { Companies } from "./pages/Companies";
import { CompanyDetail } from "./pages/CompanyDetail";
import { Login } from "./pages/Login";
import { Progress } from "./pages/Progress";
import { QuestionDetail } from "./pages/QuestionDetail";
import { RoleDetail } from "./pages/RoleDetail";
import { RoundDetail } from "./pages/RoundDetail";
import { Signup } from "./pages/Signup";
import "./App.css";

// Keeps a logged-in user off the login/signup pages, which would otherwise let
// them overwrite their own session.
function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="centered">Loading…</p>;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

// Every browse page needs the same guard and chrome, so they are composed once
// here rather than repeated per route.
function Private({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <main className="page">
              <Login />
            </main>
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <main className="page">
              <Signup />
            </main>
          </PublicOnly>
        }
      />

      <Route
        path="/"
        element={
          <Private>
            <Companies />
          </Private>
        }
      />
      <Route
        path="/companies/:id"
        element={
          <Private>
            <CompanyDetail />
          </Private>
        }
      />
      <Route
        path="/roles/:id"
        element={
          <Private>
            <RoleDetail />
          </Private>
        }
      />
      <Route
        path="/rounds/:id"
        element={
          <Private>
            <RoundDetail />
          </Private>
        }
      />

      <Route
        path="/questions/:id"
        element={
          <Private>
            <QuestionDetail />
          </Private>
        }
      />

      <Route
        path="/progress"
        element={
          <Private>
            <Progress />
          </Private>
        }
      />

      {/* Unknown paths go home; ProtectedRoute then decides login vs companies. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
