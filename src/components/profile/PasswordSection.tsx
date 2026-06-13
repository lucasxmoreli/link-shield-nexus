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
import {
  calculatePasswordStrength,
  isPasswordAcceptable,
  getPasswordStrengthPct,
  getPasswordStrengthColor,
} from "@/lib/password-validation";
import { PasswordCriteriaList } from "@/components/profile/PasswordCriteriaList";

export function PasswordSection() {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const strength = calculatePasswordStrength(newPassword);
  const strengthPct = getPasswordStrengthPct(newPassword);
  const strengthColors = getPasswordStrengthColor(strength);
  const passwordAcceptable = isPasswordAcceptable(newPassword);

  // Label da força (mapeamento i18n)
  const strengthLabel =
    strength === "empty" ? "" :
    strength === "weak" ? t("password.strengthWeak") :
    strength === "medium" ? t("password.strengthMedium") :
    t("password.strengthStrong");

  // Validação completa antes de submeter
  const validate = (): string | null => {
    if (!isPasswordAcceptable(newPassword)) {
      return t("password.notAcceptable");
    }
    if (newPassword !== confirmPassword) {
      return t("password.doNotMatch");
    }
    return null;
  };

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
      setNewPassword("");
      setConfirmPassword("");
      setSubmitError(null);
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
      setSubmitError(error);
      return;
    }
    setSubmitError(null);
    updateMutation.mutate();
  };

  // Botão habilita SE: senha aceitável + senhas iguais + sem mutation rodando
  const canUpdate =
    passwordAcceptable &&
    newPassword === confirmPassword &&
    confirmPassword.length > 0 &&
    !updateMutation.isPending;

  // Detecta mismatch em tempo real (só mostra quando user já digitou na confirmação)
  const showMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

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
                  if (submitError) setSubmitError(null);
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

            {/* Barra de força — aparece quando user começa a digitar */}
            {newPassword.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t("password.strengthLabel")}
                  </span>
                  <span className={`font-medium ${strengthColors.text}`}>
                    {strengthLabel}
                  </span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strengthColors.bg}`}
                    style={{ width: `${strengthPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* ★ Checklist dinâmico (a grande sacada) */}
            <PasswordCriteriaList password={newPassword} />
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
                  if (submitError) setSubmitError(null);
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
            {/* Erro de mismatch em tempo real */}
            {showMismatch && (
              <p className="text-xs text-destructive">
                {t("password.doNotMatch")}
              </p>
            )}
          </div>

          {/* Submit error (raro, só se a validação client passar mas server reclamar) */}
          {submitError && !showMismatch && (
            <p className="text-xs text-destructive">{submitError}</p>
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