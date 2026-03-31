import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useAuth, AuthProvider } from "@/context/AuthContext";

import { Shell } from "@/components/layout/Shell";
import Dashboard from "@/pages/Dashboard";
import Categories from "@/pages/Categories";
import Login from "@/pages/Login";
import { T } from "@/lib/theme";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          background: T.bg,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: T.textMid, fontFamily: T.font }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/categories"
        element={
          <ProtectedRoute>
            <Shell>
              <Categories />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Shell>
              <Dashboard />
            </Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: T.surface,
              border: `1px solid ${T.border}`,
              color: T.text,
              fontFamily: T.fontMono,
              fontSize: 12,
            },
          }}
        />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
