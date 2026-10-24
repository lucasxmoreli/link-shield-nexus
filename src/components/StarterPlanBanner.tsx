import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";

const UNCHARGED_TEST_PRICES = new Set([
  "price_1UG23HLZEOji6sEJoaUpX4t1",
  "price_1UG23OLZEOji6sEJw9z873KX",
  "price_1UG23QLZEOji6sEJQQ1Evq5U",
  "price_1UG23PLZEOji6sEJ1kjc8qCg",
]);

export function StarterPlanBanner() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const priceId = profile?.stripe_price_id ?? null;
  const planName = (profile?.plan_name || "").trim().toUpperCase();
  const show =
    (priceId != null && UNCHARGED_TEST_PRICES.has(priceId)) ||
    (planName === "FREE" && !!priceId && priceId.startsWith("price_"));

  if (!show) return null;

  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-3">
      <p className="text-sm text-foreground/90 leading-relaxed flex-1 min-w-[16rem]">
        {t("billing.starterAnnounce")}
      </p>
      <Button asChild size="sm" className="shrink-0">
        <Link to="/billing?tab=plans">{t("billing.starterAnnounceCta")}</Link>
      </Button>
    </div>
  );
}
