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

export default function DomainGuide() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-2xl">
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
