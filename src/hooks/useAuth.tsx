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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminViewAsId, setAdminViewAsId] = useState<string | null>(null);
  const [adminViewAsEmail, setAdminViewAsEmail] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
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
