import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PASSWORD_CRITERIA } from "@/lib/password-validation";

interface PasswordCriteriaListProps {
  password: string;
  /** Esconde a lista quando vazio (default true). */
  hideWhenEmpty?: boolean;
}

/**
 * Renderiza checklist dinâmico de critérios de senha.
 * Cada item muda de cinza pra verde conforme o user digita.
 */
export function PasswordCriteriaList({
  password,
  hideWhenEmpty = true,
}: PasswordCriteriaListProps) {
  const { t } = useTranslation();

  if (hideWhenEmpty && password.length === 0) return null;

  return (
    <ul className="space-y-1.5 pt-2" aria-label="Password requirements">
      {PASSWORD_CRITERIA.map((criterion) => {
        const passed = criterion.test(password);
        return (
          <li
            key={criterion.id}
            className={`flex items-center gap-2 text-xs transition-colors duration-200 ${
              passed ? "text-success" : "text-muted-foreground"
            }`}
          >
            <span
              className={`flex items-center justify-center h-3.5 w-3.5 rounded-full transition-colors ${
                passed ? "bg-success/15" : "bg-muted/40"
              }`}
            >
              {passed ? (
                <Check size={10} className="text-success" strokeWidth={3} />
              ) : (
                <X size={10} className="text-muted-foreground/60" strokeWidth={2} />
              )}
            </span>
            <span>{t(criterion.labelKey)}</span>
          </li>
        );
      })}
    </ul>
  );
}