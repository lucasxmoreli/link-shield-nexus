import { useAuth } from "@/hooks/useAuth";

const ADMIN_EMAILS = ["teste@gmail.com"];

export function useAdmin() {
  const { user } = useAuth();
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);
  return { isAdmin };
}
