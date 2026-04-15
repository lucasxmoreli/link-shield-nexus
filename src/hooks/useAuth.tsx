import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
});

/**
 * Verifica se o user está soft-deleted.
 * Returns true se deletado, false se OK ou erro (fail-open).
 */
async function isUserSoftDeleted(userId: string): Promise<boolean> {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("user_id, is_deleted")
      .eq("user_id", userId)
      .maybeSingle();

    // Profile retornou explicitamente com is_deleted=true → deletado
    if (profile?.is_deleted === true) return true;

    // Profile retornou null sem erro → RLS bloqueou (provavelmente soft-deleted)
    if (!profile && !error) return true;

    // Qualquer outro caso (profile válido OU erro de query) → NÃO bloqueia
    return false;
  } catch (err) {
    console.error("[useAuth] Soft-delete check failed:", err);
    return false; // fail-open
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminViewAsId, setAdminViewAsId] = useState<string | null>(null);
  const [adminViewAsEmail, setAdminViewAsEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Helper: aplica session com check de soft-delete (se houver user)
    const applySession = async (newSession: Session | null) => {
      if (!mounted) return;

      // Se não tem user logado, só aplica direto (página /auth, landing, etc)
      if (!newSession?.user) {
        setSession(newSession);
        setLoading(false);
        return;
      }

      // Tem user → checa soft-delete
      const isDeleted = await isUserSoftDeleted(newSession.user.id);

      if (!mounted) return;

      if (isDeleted) {
        console.warn("[useAuth] User is soft-deleted, forcing logout");
        await supabase.auth.signOut();
        // Só NÃO redireciona se já estiver em /account-deleted (evita loop).
        // Em qualquer outra rota (/, /auth, /dashboard, etc), redireciona.
        if (window.location.pathname !== "/account-deleted") {
          window.location.replace("/account-deleted");
        }
        return;
      }

      // User OK → aplica session normalmente
      setSession(newSession);
      setLoading(false);
    };

    // Listener de mudanças de auth (login, logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        applySession(newSession);
      }
    );

    // Check de session inicial (na primeira carga da página)
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

  const user = session?.user ?? null;
  const isImpersonating = !!adminViewAsId;
  const effectiveUserId = isImpersonating ? adminViewAsId : (user?.id ?? null);

  return (
    <AuthContext.Provider value={{
      session, user, loading, signOut,
      adminViewAsId, adminViewAsEmail,
      startClientView, stopClientView,
      isImpersonating, effectiveUserId,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);