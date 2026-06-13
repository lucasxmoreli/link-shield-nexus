import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock } from "lucide-react";

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;

interface ProfileData {
  email: string | null;
  display_name: string | null;
}

export function ProfileSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Busca o profile (email + display_name)
  const { data: profile, isLoading } = useQuery<ProfileData | null>({
    queryKey: ["profile-settings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("email, display_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as ProfileData | null;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  // Estado local do input
  const [displayName, setDisplayName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sincroniza o input quando o profile carrega
  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    }
  }, [profile?.display_name]);

  // Validação client-side
  const validate = (name: string): string | null => {
    const trimmed = name.trim();
    if (trimmed.length < MIN_NAME_LENGTH) return t("profile.displayNameTooShort");
    if (trimmed.length > MAX_NAME_LENGTH) return t("profile.displayNameTooLong");
    return null;
  };

  // Mutation para atualizar display_name
  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: newName.trim() })
        .eq("user_id", user!.id);
      if (error) throw error;
      return newName.trim();
    },
    onSuccess: () => {
      // Invalida tanto a query local quanto a do useProfile global
      queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({
        title: t("profile.profileUpdatedTitle"),
        description: t("profile.profileUpdatedDesc"),
      });
    },
    onError: (err: any) => {
      console.error("[profile] Update failed:", err);
      toast({
        title: t("profile.profileUpdateFailed"),
        description: err.message || t("profile.profileUpdateFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const error = validate(displayName);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    updateMutation.mutate(displayName);
  };

  const handleNameChange = (value: string) => {
    setDisplayName(value);
    if (validationError) setValidationError(null);
  };

  // Habilita o botão Save apenas se:
  // 1. Houve mudança real
  // 2. Não tem mutation rodando
  // 3. Não tem erro de validação ativo
  const hasChanged = profile?.display_name !== displayName.trim();
  const canSave = hasChanged && !updateMutation.isPending && !validationError && displayName.trim().length >= MIN_NAME_LENGTH;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {t("profile.profileSectionTitle")}
          </h2>
        </div>

        <div className="space-y-5">
          {/* Email — readonly com ícone de cadeado */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2 text-sm">
              {t("profile.emailLabel")}
              <Lock size={12} className="text-muted-foreground" />
            </Label>
            <Input
              id="email"
              type="email"
              value={profile?.email ?? ""}
              disabled
              readOnly
              className="font-mono text-sm bg-muted/30 cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              {t("profile.emailReadOnlyHint")}
            </p>
          </div>

          {/* Display Name — editável */}
          <div className="space-y-2">
            <Label htmlFor="display_name" className="text-sm">
              {t("profile.displayNameLabel")}
            </Label>
            <Input
              id="display_name"
              type="text"
              value={displayName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t("profile.displayNamePlaceholder")}
              maxLength={MAX_NAME_LENGTH}
              disabled={isLoading || updateMutation.isPending}
            />
            {validationError ? (
              <p className="text-xs text-destructive">{validationError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("profile.displayNameHint")}
              </p>
            )}
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={!canSave}
              className="min-w-[140px]"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  {t("profile.saving")}
                </>
              ) : (
                t("profile.saveChanges")
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}