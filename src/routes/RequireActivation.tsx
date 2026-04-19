// =============================================================================
// <RequireActivation>
// -----------------------------------------------------------------------------
// Route guard that blocks gated pages (domains, campaigns, etc) unless the
// user's workspace is ACTIVE. All other states (INVITED, PAST_DUE, CANCELED)
// are redirected to /billing with a `reason` query param so the billing page
// can show the appropriate context banner.
//
// Usage (in App.tsx):
//   <Route element={<RequireActivation><Domains /></RequireActivation>} />
//
// Note: this is the FRONTEND gate. It's a UX layer — the hard gate lives in
// the database (RLS on `domains`, `campaigns`) and must never be skipped.
// =============================================================================

import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  BILLING_ROUTE,
  shouldRedirectToBilling,
} from "@/lib/activation";

interface RequireActivationProps {
  children: ReactNode;
}

export function RequireActivation({ children }: RequireActivationProps) {
  const { loading, activationStatus } = useAuth();
  const location = useLocation();

  // Still hydrating the session → render nothing to avoid a redirect flash.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (shouldRedirectToBilling(activationStatus)) {
    const search = new URLSearchParams({
      reason: activationStatus.toLowerCase(),
      from: location.pathname,
    }).toString();
    return <Navigate to={`${BILLING_ROUTE}?${search}`} replace />;
  }

  return <>{children}</>;
}
