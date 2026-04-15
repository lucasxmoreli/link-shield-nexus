import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Eye, EyeOff } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

type StrengthLevel = 0 | 1 | 2 | 3;

/**
 * Calcula força da senha baseado em regras de Validação Média (decisão CEO):
 * - 0 = vazio
 * - 1 = fraca (menor que o mínimo)
 * - 2 = média (tem o mínimo mas falta upper ou lower)
 * - 3 = forte (tem mínimo + upper + lower)
 */
function calculateStrength(password: string): StrengthLevel {
  if (password.length === 0) return 0;
  if (password.length < MIN_PASSWORD_LENGTH) return 1;

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);

  if (hasUpper && hasLower) return 3;
  if (hasUpper || hasLower) return 2;
  return 1;
}

export function PasswordSection() {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const strength = calculateStrength(newPassword);
  const strengthPct = (strength / 3) * 100;

  // Mapeamento de força → label e cor
  const strengthConfig: Record<StrengthLevel, { label: string; color: string; textColor: string }> = {
    0: { label: "", color: "", textColor: "" },
    1: { label: t("profile.passwordStrengthWeak"), color: "bg-destructive", textColor: "text-destructive" },
    2: { label: t("profile.passwordStrengthMedium"), color: "bg-yellow-500", textColor: "text-yellow-500" },
    3: { label: t("profile.passwordStrengthStrong"), color: "bg-success", textColor: "text-success" },
  };

  // Validação completa antes de submeter
  const validate = (): string | null => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return t("profile.passwordTooShort");
    }
    if (!/[A-Z]/.test(newPassword)) {
      return t("profile.passwordNeedsUppercase");
    }
    if (!/[a-z]/.test(newPassword)) {
      return t("profile.passwordNeedsLowercase");
    }
    if (newPassword !== confirmPassword) {
      return t("profile.passwordsDoNotMatch");
    }
    return null;
  };

  // Mutation para atualizar senha via Supabase Auth nativo
  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: t("profile.passwordUpdatedTitle"),
        description: t("profile.passwordUpdatedDesc"),
      });
      // Limpa os campos após sucesso
      setNewPassword("");
      setConfirmPassword("");
      setValidationError(null);
    },
    onError: (err: any) => {
      console.error("[password] Update failed:", err);
      toast({
        title: t("profile.passwordUpdateFailed"),
        description: err.message || t("profile.passwordUpdateFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const handleUpdate = () => {
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    updateMutation.mutate();
  };

  // Botão habilita apenas com ambos preenchidos e sem mutation rodando
  const canUpdate =
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !updateMutation.isPending;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            {t("profile.securitySectionTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("profile.securitySectionDesc")}
          </p>
        </div>

        <div className="space-y-5">
          {/* Nova senha */}
          <div className="space-y-2">
            <Label htmlFor="new_password" className="text-sm">
              {t("profile.newPasswordLabel")}
            </Label>
            <div className="relative">
              <Input
                id="new_password"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder={t("profile.newPasswordPlaceholder")}
                className="pr-10"
                disabled={updateMutation.isPending}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showNew ? t("profile.hidePassword") : t("profile.showPassword")}
                tabIndex={-1}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Barra de força — aparece só quando tem algo digitado */}
            {newPassword.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t("profile.passwordStrengthLabel")}
                  </span>
                  <span className={`font-medium ${strengthConfig[strength].textColor}`}>
                    {strengthConfig[strength].label}
                  </span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strengthConfig[strength].color}`}
                    style={{ width: `${strengthPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Confirmar nova senha */}
          <div className="space-y-2">
            <Label htmlFor="confirm_password" className="text-sm">
              {t("profile.confirmPasswordLabel")}
            </Label>
            <div className="relative">
              <Input
                id="confirm_password"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder={t("profile.confirmPasswordPlaceholder")}
                className="pr-10"
                disabled={updateMutation.isPending}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showConfirm ? t("profile.hidePassword") : t("profile.showPassword")}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error message */}
          {validationError && (
            <p className="text-xs text-destructive">{validationError}</p>
          )}

          {/* Update button */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleUpdate}
              disabled={!canUpdate}
              className="min-w-[160px]"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  {t("profile.updatingPassword")}
                </>
              ) : (
                t("profile.updatePassword")
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}