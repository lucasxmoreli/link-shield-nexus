import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";

interface PaymentMethodData {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

interface PaymentMethodResponse {
  payment_method: PaymentMethodData | null;
}

export function PaymentMethodCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [portalLoading, setPortalLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["payment_method", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<PaymentMethodResponse>(
        "get-payment-method"
      );
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const pm = data?.payment_method;

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ url: string }>(
        "create-portal-session",
        {
          body: {
            return_url: `${window.location.origin}/billing?tab=faturas`,
          },
        }
      );

      if (error) throw error;
      if (!data?.url) throw new Error("Portal URL not returned");

      window.location.href = data.url;
    } catch (err: any) {
      console.error("[portal] Failed:", err);
      toast({
        title: t("billing.portalFailed"),
        description: err.message || t("billing.portalFailedDesc"),
        variant: "destructive",
      });
      setPortalLoading(false);
    }
  };

  // Formata bandeira do cartão de forma amigável
  const formatBrand = (brand: string) => {
    const map: Record<string, string> = {
      visa: "Visa",
      mastercard: "Mastercard",
      amex: "American Express",
      discover: "Discover",
      diners: "Diners Club",
      jcb: "JCB",
      unionpay: "UnionPay",
    };
    return map[brand.toLowerCase()] || brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  const formatExpiry = (month: number, year: number) => {
    const mm = month.toString().padStart(2, "0");
    const yy = year.toString().slice(-2);
    return `${mm}/${yy}`;
  };

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-6">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">
          {t("billing.paymentMethodTitle")}
        </p>

        {isLoading ? (
          <div className="flex items-center gap-3 py-2">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
          </div>
        ) : pm ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <CreditCard size={20} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground truncate">
                  {formatBrand(pm.brand)} •••• {pm.last4}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("billing.cardExpires", { date: formatExpiry(pm.exp_month, pm.exp_year) })}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="shrink-0"
            >
              {portalLoading ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  {t("billing.redirecting")}
                </>
              ) : (
                <>
                  <ExternalLink size={14} className="mr-2" />
                  {t("billing.manageSubscription")}
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <div className="h-12 w-12 rounded-lg bg-muted/50 flex items-center justify-center">
              <CreditCard size={20} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("billing.noCardLinked")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("billing.noCardLinkedDesc")}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}