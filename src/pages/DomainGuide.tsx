import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = ["where", "bought", "fill", "atSign", "grey", "pending", "second", "hosting", "www", "time"] as const;
const STEPS = ["step1", "step2", "step3", "step4"] as const;
const SHOTS = [
  ["01-modal.png", "shot1Title", "shot1Text"],
  ["02-registro-1.png", "shot2Title", "shot2Text"],
  ["03-cloudflare-laranja.png", "shot3Title", "shot3Text"],
  ["05-registro-2.png", "shot5Title", "shot5Text"],
  ["06-linha-salva.png", "shot6Title", "shot6Text"],
] as const;

export default function DomainGuide() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link to="/domains">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("domains.guide.back")}
          </Link>
        </Button>
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold">{t("domains.guide.title")}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("domains.guide.intro")}</p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-semibold">{t("domains.guide.orderTitle")}</h2>
        <ol className="space-y-2">
          {STEPS.map((key, index) => (
            <li key={key} className="flex gap-3 text-sm leading-relaxed">
              <span className="font-semibold text-primary shrink-0">{index + 1}.</span>
              <span>{t(`domains.setup.${key}`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("domains.guide.shotsTitle")}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("domains.guide.shotsNote")}</p>
        </div>
        <ol className="space-y-5">
          {SHOTS.map(([file, titleKey, textKey], index) => (
            <li key={file} className="space-y-2">
              <h3 className="text-sm font-semibold leading-relaxed">
                <span className="text-primary mr-2">{index + 1}.</span>
                {t(`domains.guide.${titleKey}`)}
              </h3>
              <img
                src={`/domain-guide/${file}`}
                alt={t(`domains.guide.${titleKey}`)}
                className="w-full rounded-lg border border-border bg-card"
              />
              <p className="text-sm text-muted-foreground leading-relaxed">{t(`domains.guide.${textKey}`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <Accordion type="single" collapsible defaultValue="where" className="rounded-lg border border-border bg-card px-4">
        {FAQ.map((id) => (
          <AccordionItem key={id} value={id} className="border-border">
            <AccordionTrigger className="text-left text-sm hover:no-underline">
              {t(`domains.guide.${id}Q`)}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              {t(`domains.guide.${id}A`)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
