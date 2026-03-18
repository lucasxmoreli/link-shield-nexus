import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LANGUAGES = [
  { code: "en", label: "EN", flag: "🇺🇸" },
  { code: "pt", label: "PT", flag: "🇧🇷" },
  { code: "es", label: "ES", flag: "🇪🇸" },
] as const;

export function LanguageSelector({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();

  const changeLanguage = async (lng: string) => {
    i18n.changeLanguage(lng);
    if (user) {
      await supabase
        .from("profiles")
        .update({ language: lng } as any)
        .eq("user_id", user.id);
    }
  };

  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  if (variant === "full") {
    return (
      <div className="flex gap-1.5">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
              i18n.language === lang.code
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{lang.flag}</span>
            <span>{(t as any)(`languages.${lang.code}`)}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground h-8 px-2">
          <Globe className="h-4 w-4" />
          <span className="text-xs font-semibold">{current.flag} {current.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={`gap-2 cursor-pointer ${i18n.language === lang.code ? "text-primary font-semibold" : ""}`}
          >
            <span>{lang.flag}</span>
            <span>{(t as any)(`languages.${lang.code}`)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
