import { useAuth } from "@/hooks/useAuth";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminViewBanner() {
  const { isImpersonating, adminViewAsEmail, stopClientView } = useAuth();

  if (!isImpersonating) return null;

  return (
    <div className="bg-amber-500 text-black px-4 py-2 flex items-center justify-between text-sm font-medium">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span>Client View ativo — visualizando como <strong>{adminViewAsEmail}</strong></span>
        <span className="text-amber-800 text-xs">(somente leitura)</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={stopClientView}
        className="text-black hover:bg-amber-600 gap-1 h-7 px-2"
      >
        <X className="h-3.5 w-3.5" />
        Sair
      </Button>
    </div>
  );
}
