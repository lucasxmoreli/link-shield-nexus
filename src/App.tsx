import AdminCommandCenter from "./pages/admin/AdminCommandCenter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Domains from "./pages/Domains";
import Campaigns from "./pages/Campaigns";
import CampaignEdit from "./pages/CampaignEdit";
import Requests from "./pages/Requests";
import AccountSettings from "./pages/AccountSettings";
import Billing from "./pages/Billing";
import Auth from "./pages/Auth";
import CampaignRedirect from "./pages/CampaignRedirect";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import AccountDeleted from "@/pages/AccountDeleted";
import UpdatePassword from "./pages/UpdatePassword";
import { RequireActivation } from "@/routes/RequireActivation";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/dashboard" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* ─── PUBLIC ROUTES (no auth required) ─── */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/account-deleted" element={<AccountDeleted />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/c/:hash" element={<CampaignRedirect />} />

            {/* ─── PROTECTED ROUTES (require auth) ─── */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />

              {/* ── Gated by activation_status === 'ACTIVE' ── */}
              <Route path="/domains" element={<RequireActivation><Domains /></RequireActivation>} />
              <Route path="/campaigns" element={<RequireActivation><Campaigns /></RequireActivation>} />
              <Route path="/campaigns/new" element={<RequireActivation><CampaignEdit /></RequireActivation>} />
              <Route path="/campaigns/:id/edit" element={<RequireActivation><CampaignEdit /></RequireActivation>} />
              <Route path="/campaigns/:id/clone" element={<RequireActivation><CampaignEdit /></RequireActivation>} />
              <Route path="/requests" element={<RequireActivation><Requests /></RequireActivation>} />
              <Route path="/analytics" element={<RequireActivation><Analytics /></RequireActivation>} />

              {/* ── Always reachable (billing must stay open for pre-activation users) ── */}
              <Route path="/billing" element={<Billing />} />
              <Route path="/settings" element={<AccountSettings />} />

              {/* === Admin Command Center (unified) === */}
              <Route path="/admin" element={<AdminCommandCenter />} />

              {/* === Legacy redirects === */}
              <Route path="/invite-codes" element={<Navigate to="/admin?tab=invites" replace />} />
              <Route path="/admin-old" element={<Navigate to="/admin" replace />} />
            </Route>

            {/* ─── 404 FALLBACK ─── */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;