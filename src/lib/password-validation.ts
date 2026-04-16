/**
 * Validação compartilhada de senha — usada no Cadastro (Auth.tsx)
 * e na Troca de Senha (PasswordSection.tsx).
 */

export interface PasswordCriterion {
  id: string;
  labelKey: string; // chave i18n (ex: "password.criteriaMinLength")
  test: (password: string) => boolean;
}

export const PASSWORD_CRITERIA: PasswordCriterion[] = [
  {
    id: "min_length",
    labelKey: "password.criteriaMinLength",
    test: (pwd) => pwd.length >= 6,
  },
  {
    id: "has_letter",
    labelKey: "password.criteriaHasLetter",
    test: (pwd) => /[a-zA-Z]/.test(pwd),
  },
  {
    id: "has_number",
    labelKey: "password.criteriaHasNumber",
    test: (pwd) => /\d/.test(pwd),
  },
];

export type PasswordStrength = "empty" | "weak" | "medium" | "strong";

/**
 * Calcula força baseado em quantos critérios passaram.
 * - 0 critérios = empty
 * - 1 critério = weak
 * - 2 critérios = medium  ← BOTÃO HABILITA AQUI
 * - 3 critérios = strong
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) return "empty";
  const passed = PASSWORD_CRITERIA.filter((c) => c.test(password)).length;
  if (passed === 3) return "strong";
  if (passed === 2) return "medium";
  return "weak";
}

/**
 * Retorna se a senha atinge o threshold mínimo aceitável (medium).
 * Usado pra habilitar o botão de submit.
 */
export function isPasswordAcceptable(password: string): boolean {
  const strength = calculatePasswordStrength(password);
  return strength === "strong";
}

/**
 * Retorna porcentagem de progresso (0-100) pra renderizar a barra.
 */
export function getPasswordStrengthPct(password: string): number {
  const strength = calculatePasswordStrength(password);
  switch (strength) {
    case "empty": return 0;
    case "weak": return 33;
    case "medium": return 66;
    case "strong": return 100;
  }
}

/**
 * Mapeamento de força → cores Tailwind (consistente com tokens shadcn).
 */
export function getPasswordStrengthColor(strength: PasswordStrength): {
  bg: string;
  text: string;
} {
  switch (strength) {
    case "empty":
      return { bg: "", text: "" };
    case "weak":
      return { bg: "bg-destructive", text: "text-destructive" };
    case "medium":
      return { bg: "bg-yellow-500", text: "text-yellow-500" };
    case "strong":
      return { bg: "bg-success", text: "text-success" };
  }
};