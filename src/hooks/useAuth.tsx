import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { identify as analyticsIdentify, reset as analyticsReset } from "@/lib/analytics";
import {
  ActivationStatus,
  DEFAULT_ACTIVATION_STATUS,
  normalizeActivationStatus,
} from "@/lib/activation";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  adminViewAsId: string | null;
  adminViewAsEmail: string | null;
  startClientView: (userId: string, email: string) => void;
  stopClientView: () => void;
  isImpersonating: boolean;
  effectiveUserId: string | null;
  activationStatus: ActivationStatus;
  refreshActivationStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  adminViewAsId: null,
  adminViewAsEmail: null,
  startClientView: () => {},
  stopClientView: () => {},
  isImpersonating: false,
  effectiveUserId: null,
  activationStatus: DEFAULT_ACTIVATION_STATUS,
  refreshActivationStatus: async () => {},
});

interface ProfileGate {
  isDeleted: boolean;
  activationStatus: ActivationStatus;
}

/**
 * Single read of the gate fields from `profiles`. Returns soft-delete state
 * and activation status in one round-trip. Fail-open on errors (do not lock
 * the user out due to a transient network blip).
 */
async function fetchProfileGate(userId: string): Promise<ProfileGate> {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("user_id, is_deleted, activation_status")
      .eq("user_id", userId)
      .maybeSingle();

    // Profile explicitly returned with is_deleted=true → deleted.
    if (profile?.is_deleted === true) {
      return { isDeleted: true, activationStatus: DEFAULT_ACTIVATION_STATUS };
    }

    // Profile returned null without error → RLS blocked (likely soft-deleted).
    if (!profile && !error) {
      return { isDeleted: true, activationStatus: DEFAULT_ACTIVATION_STATUS };
    }

    return {
      isDeleted: false,
      activationStatus: normalizeActivationStatus(profile?.activation_status),
    };
  } catch (err) {
    console.error("[useAuth] Profile gate fetch failed:", err);
    // Fail-open on isDeleted, fail-safe on activationStatus.
    return { isDeleted: false, activationStatus: DEFAULT_ACTIVATION_STATUS };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminViewAsId, setAdminViewAsId] = useState<string | null>(null);
  const [adminViewAsEmail, setAdminViewAsEmail] = useState<string | null>(null);
  const [activationStatus, setActivationStatus] = useState<ActivationStatus>(
    DEFAULT_ACTIVATION_STATUS,
  );

  useEffect(() => {
    let mounted = true;
    let lastIdentifiedUserId: string | null = null;

    // Helper: apply session with gate check (soft-delete + activation status).
    const applySession = async (newSession: Session | null) => {
      if (!mounted) return;

      // No authenticated user → apply directly (landing, /auth, etc).
      if (!newSession?.user) {
        if (lastIdentifiedUserId) {
          analyticsReset();
          lastIdentifiedUserId = null;
        }
        setActivationStatus(DEFAULT_ACTIVATION_STATUS);
        setSession(newSession);
        setLoading(false);
        return;
      }

      // User present → fetch gate (soft-delete + activation_status).
      const gate = await fetchProfileGate(newSession.user.id);

      if (!mounted) return;

      if (gate.isDeleted) {
        console.warn("[useAuth] User is soft-deleted, forcing logout");
        await supabase.auth.signOut();
        if (window.location.pathname !== "/account-deleted") {
          window.location.replace("/account-deleted");
        }
        return;
      }

      // Identify the user in analytics (once per distinct id).
      if (newSession.user.id !== lastIdentifiedUserId) {
        analyticsIdentify(newSession.user.id, {
          email: newSession.user.email ?? undefined,
          created_at: newSession.user.created_at,
          activation_status: gate.activationStatus,
        });
        lastIdentifiedUserId = newSession.user.id;
      }

      setActivationStatus(gate.activationStatus);
      setSession(newSession);
      setLoading(false);
    };

    // Auth state listener (login, logout, refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        applySession(newSession);
      }
    );

    // Initial session check on first page load.
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      applySession(initialSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setAdminViewAsId(null);
    setAdminViewAsEmail(null);
    setActivationStatus(DEFAULT_ACTIVATION_STATUS);
    analyticsReset();
    await supabase.auth.signOut();
  };

  const startClientView = useCallback((userId: string, email: string) => {
    setAdminViewAsId(userId);
    setAdminViewAsEmail(email);
  }, []);

  const stopClientView = useCallback(() => {
    setAdminViewAsId(null);
    setAdminViewAsEmail(null);
  }, []);

  /**
   * Re-read the activation status from the DB. Call this after the user
   * returns from Stripe Checkout so the gate flips immediately without
   * requiring a logout/login cycle.
   */
  const refreshActivationStatus = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const gate = await fetchProfileGate(userId);
    if (gate.isDeleted) return;
    setActivationStatus(gate.activationStatus);
  }, [session?.user?.id]);

  const user = session?.user ?? null;
  const isImpersonating = !!adminViewAsId;
  const effectiveUserId = isImpersonating ? adminViewAsId : (user?.id ?? null);

  return (
    <AuthContext.Provider value={{
      session, user, loading, signOut,
      adminViewAsId, adminViewAsEmail,
      startClientView, stopClientView,
      isImpersonating, effectiveUserId,
      activationStatus, refreshActivationStatus,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
