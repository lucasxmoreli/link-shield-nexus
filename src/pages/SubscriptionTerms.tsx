import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const CLAUSES = [
  "renewal",
  "currency",
  "cancel",
  "packs",
  "use",
  "suspension",
  "liability",
  "deletion",
  "changes",
  "contact",
] as const;

export default function SubscriptionTerms() {
  const { t } = useTranslation();

  return (
    <div className="max-w-2xl space-y-8">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link to="/billing?tab=plans">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("billing.terms.back")}
          </Link>
        </Button>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("billing.terms.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("billing.terms.updated")}</p>
        </div>
      </div>

      <article className="border-l-2 border-primary pl-5 sm:pl-6">
        <p className="max-w-prose text-[15px] leading-7 text-foreground">{t("billing.terms.intro")}</p>
        <div className="mt-2 divide-y divide-border">
          {CLAUSES.map((id) => (
            <section key={id} className="max-w-prose py-5">
              <h2 className="text-base font-semibold">{t(`billing.terms.${id}Title`)}</h2>
              <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{t(`billing.terms.${id}Body`)}</p>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
