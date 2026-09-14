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
  /** Logged-in but no profiles row (orphan / post-signup race). */
  profileMissing: boolean;
  /** Gate RPC/network failed; session kept, write gate stays closed. */
  gateError: boolean;
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
  profileMissing: false,
  gateError: false,
});

type GateState = "ok" | "deleted" | "missing" | "error";

interface ProfileGate {
  state: GateState;
  activationStatus: ActivationStatus;
}

interface GateRow {
  profile_exists: boolean;
  is_deleted: boolean;
  is_suspended: boolean;
  activation_status: string | null;
}

// Retries only for "missing": covers the window between auth.users insert and
// handle_new_user commit / client session receive.
const MISSING_RETRY_DELAYS_MS = [400, 1200, 2500];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads the gate via SECURITY DEFINER RPC. Soft-deleted rows are hidden by
 * profiles SELECT RLS, so a direct select cannot tell deleted vs missing.
 */
async function fetchProfileGateOnce(): Promise<ProfileGate> {
  const { data, error } = await supabase
    .rpc("get_my_profile_gate")
    .maybeSingle();

  if (error) {
    console.error("[useAuth] get_my_profile_gate failed:", error.message);
    return { state: "error", activationStatus: DEFAULT_ACTIVATION_STATUS };
  }

  const row = data as GateRow | null;
  if (!row || row.profile_exists !== true) {
    return { state: "missing", activationStatus: DEFAULT_ACTIVATION_STATUS };
  }
  if (row.is_deleted === true) {
    return { state: "deleted", activationStatus: DEFAULT_ACTIVATION_STATUS };
  }
  return {
    state: "ok",
    activationStatus: normalizeActivationStatus(row.activation_status),
  };
}

async function fetchProfileGate(): Promise<ProfileGate> {
  let gate = await fetchProfileGateOnce();
  for (const delay of MISSING_RETRY_DELAYS_MS) {
    if (gate.state !== "missing") break;
    await sleep(delay);
    gate = await fetchProfileGateOnce();
  }
  return gate;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminViewAsId, setAdminViewAsId] = useState<string | null>(null);
  const [adminViewAsEmail, setAdminViewAsEmail] = useState<string | null>(null);
  const [activationStatus, setActivationStatus] = useState<ActivationStatus>(
    DEFAULT_ACTIVATION_STATUS,
  );
  const [profileMissing, setProfileMissing] = useState(false);
  const [gateError, setGateError] = useState(false);

  useEffect(() => {
    let mounted = true;
    let lastIdentifiedUserId: string | null = null;

    const applySession = async (newSession: Session | null) => {
      if (!mounted) return;

      if (!newSession?.user) {
        if (lastIdentifiedUserId) {
          analyticsReset();
          lastIdentifiedUserId = null;
        }
        setActivationStatus(DEFAULT_ACTIVATION_STATUS);
        setProfileMissing(false);
        setGateError(false);
        setSession(newSession);
        setLoading(false);
        return;
      }

      const gate = await fetchProfileGate();
      if (!mounted) return;

      if (gate.state === "deleted") {
        console.warn("[useAuth] Soft-deleted account, forcing logout");
        await supabase.auth.signOut();
        if (window.location.pathname !== "/account-deleted") {
          window.location.replace("/account-deleted");
        }
        return;
      }

      // missing / error: keep session. INVITED-ish gate + banner; RLS still
      // denies writes. Orphan ≠ deleted account.
      setProfileMissing(gate.state === "missing");
      setGateError(gate.state === "error");
      if (gate.state !== "ok") {
        console.warn(`[useAuth] Profile gate state=${gate.state} for user ${newSession.user.id}`);
      }

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        applySession(newSession);
      }
    );

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
    setProfileMissing(false);
    setGateError(false);
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

  const refreshActivationStatus = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const gate = await fetchProfileGate();
    if (gate.state === "deleted") return;
    setProfileMissing(gate.state === "missing");
    setGateError(gate.state === "error");
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
      profileMissing, gateError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
