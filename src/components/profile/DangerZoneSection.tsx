import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

// IMPORTANTE: a string aqui é literal porque a edge function compara
// contra um valor fixo. O texto que o user digita é traduzido (i18n)
// e o frontend valida que bate com a tradução LOCAL antes de enviar.
const BACKEND_CONFIRMATION = "DELETE_MY_ACCOUNT";

export function DangerZoneSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { signOut } = useAuth();

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Texto que o user precisa digitar (traduzido por idioma)
  const expectedTextI18n = t("dangerZone.confirmText");
  const isConfirmTextValid = confirmText.trim() === expectedTextI18n;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("delete-my-account", {
        body: { confirmation: BACKEND_CONFIRMATION },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async () => {
      // Mostra toast (vai persistir alguns segundos mesmo após navigate)
      toast({
        title: t("dangerZone.deleteSuccessTitle"),
        description: t("dangerZone.deleteSuccessDesc"),
      });
      setOpen(false);

        // Backend já fez auth.admin.signOut("global") — frontend pode receber o evento
        // SIGNED_OUT a qualquer momento via onAuthStateChange. Pra evitar race condition
        // com guards de auth redirecionando pra /auth, navegamos IMEDIATAMENTE com replace.
        // O toast continua visível no destino porque é renderizado no <Toaster /> global.
        
        // signOut local (defesa em profundidade)
    try {
       await signOut();
     } catch (err) {
       console.warn("[danger-zone] Local signOut failed (non-critical):", err);
     }

     // Replace em vez de href: não polui histórico e é mais rápido
     window.location.replace("/account-deleted");
},
    onError: (err: any) => {
      console.error("[danger-zone] Delete failed:", err);
      toast({
        title: t("dangerZone.deleteFailedTitle"),
        description: err.message || t("dangerZone.deleteFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const handleConfirm = () => {
    if (!isConfirmTextValid) return;
    deleteMutation.mutate();
  };

  return (
    <Card className="border-destructive/30 bg-card">
      <CardContent className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-destructive" />
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-widest uppercase text-destructive mb-1">
              {t("dangerZone.sectionTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("dangerZone.sectionDesc")}
            </p>
          </div>
        </div>

        {/* Lista de consequências */}
        <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4 mb-6 space-y-2">
          <p className="text-sm font-medium text-foreground mb-2">
            {t("dangerZone.consequencesTitle")}
          </p>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>{t("dangerZone.consequence1")}</li>
            <li>{t("dangerZone.consequence2")}</li>
            <li>{t("dangerZone.consequence3")}</li>
            <li>{t("dangerZone.consequence4")}</li>
          </ul>
        </div>

        {/* Botão que abre o dialog */}
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
            >
              <Trash2 size={16} className="mr-2" />
              {t("dangerZone.deleteButton")}
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle size={20} className="text-destructive" />
                {t("dangerZone.dialogTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3 pt-2">
                <span className="block text-foreground">
                  {t("dangerZone.dialogWarning")}
                </span>
                <span className="block text-muted-foreground text-sm">
                  {t("dangerZone.dialogGracePeriod")}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>

            {/* Input de confirmação */}
            <div className="space-y-2 py-2">
              <Label htmlFor="confirm_text" className="text-sm">
                {t("dangerZone.typeToConfirm", { text: expectedTextI18n })}
              </Label>
              <Input
                id="confirm_text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expectedTextI18n}
                disabled={deleteMutation.isPending}
                className={`font-mono ${
                  confirmText.length > 0 && !isConfirmTextValid 
                    ? "border-destructive" 
                    : ""
                }`}
                autoComplete="off"
              />
              {confirmText.length > 0 && !isConfirmTextValid && (
                <p className="text-xs text-destructive">
                  {t("dangerZone.confirmTextMismatch")}
                </p>
              )}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setConfirmText("");
                  setOpen(false);
                }}
                disabled={deleteMutation.isPending}
              >
                {t("dangerZone.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirm}
                disabled={!isConfirmTextValid || deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    {t("dangerZone.deleting")}
                  </>
                ) : (
                  t("dangerZone.confirmDelete")
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}