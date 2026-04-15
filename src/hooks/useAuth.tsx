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
 * Se sim, força logout e redireciona pra tela explicativa.
 * Returns true se user OK, false se deletado (e já fez logout).
 */
async function checkSoftDeleteAndRedirect(userId: string): Promise<boolean> {
  try {
    // Usa RPC ou query direta com .maybeSingle()
    // RLS já bloqueia leitura de soft-deleted profiles, então usamos service-side check
    // via uma query que ignora o filtro NOT is_deleted (precisa rpc ou função especial)
    
    // ALTERNATIVA SIMPLES: tenta ler o profile. Se RLS bloqueia (returns null),
    // significa que pode estar deletado OU não existe. Vamos diferenciar.
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("user_id, is_deleted")
      .eq("user_id", userId)
      .maybeSingle();

    // Se profile retornou e is_deleted = true, força logout
    if (profile?.is_deleted === true) {
      console.warn("[useAuth] User is soft-deleted, forcing logout");
      await supabase.auth.signOut();
      window.location.href = "/account-deleted";
      return false;
    }

    // Se profile retornou null E não é erro de schema, pode ser que RLS bloqueou
    // (ou seja, profile existe mas is_deleted=true). Nesse caso, também força logout.
    if (!profile && !error) {
      console.warn("[useAuth] Profile not visible (likely soft-deleted), forcing logout");
      await supabase.auth.signOut();
      window.location.href = "/account-deleted";
      return false;
    }

    return true;
  } catch (err) {
    console.error("[useAuth] Soft-delete check failed:", err);
    // Falha aberta: deixa logar pra não trancar user por bug
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminViewAsId, setAdminViewAsId] = useState<string | null>(null);
  const [adminViewAsEmail, setAdminViewAsEmail] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Check soft-delete em SIGNED_IN ou TOKEN_REFRESHED
        if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
          const isOk = await checkSoftDeleteAndRedirect(session.user.id);
          if (!isOk) return; // já redirecionou, não atualiza state
        }
        
        setSession(session);
        setLoading(false);
      }
    );

    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const isOk = await checkSoftDeleteAndRedirect(session.user.id);
        if (!isOk) return;
      }
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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