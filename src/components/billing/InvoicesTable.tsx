import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { supabaseUntyped } from "@/integrations/supabase/untyped";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { Receipt, ExternalLink, Loader2 } from "lucide-react";
import { formatUSD, formatShortDate } from "@/lib/billing-format";

interface InvoiceRow {
  id: string;
  stripe_invoice_id: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  plan_name: string;
  base_amount_cents: number;
  total_amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  created_at: string;
}

/**
 * Constrói descrição limpa a partir de plan_name cru do Stripe.
 * Remove prefixos tipo "1 × ", sufixos "(at $X / month)", "- Traffic Analytics".
 * Se a fatura tem overage, adiciona sufixo "· base + uso extra".
 */
function buildInvoiceDescription(inv: InvoiceRow, t: (key: string, opts?: any) => string): string {
  const base = (inv.base_amount_cents || 0) / 100;
  const total = (inv.total_amount_cents || 0) / 100;
  const hasOverage = total > base + 0.01; // tolerância pra float

  let cleanName = inv.plan_name || "Plan";
  cleanName = cleanName.replace(/^\d+\s*×\s*/, "");               // remove "1 × "
  cleanName = cleanName.replace(/\s*\(at.*\).*$/, "");             // remove "(at $X / month)"
  cleanName = cleanName.replace(/\s*-\s*Traffic Analytics/i, "");  // remove "- Traffic Analytics"
  cleanName = cleanName.trim();

  if (hasOverage) {
    return t("billing.invoiceDescWithOverage", { plan: cleanName });
  }
  return cleanName;
}

export function InvoicesTable() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-US" : i18n.language === "es" ? "es-ES" : "pt-BR";

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices", user?.id],
    queryFn: async () => {
      // `invoices` ainda não consta no types.ts gerado — usa escape hatch.
      const { data, error } = await supabaseUntyped
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as unknown) as InvoiceRow[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      paid: {
        label: t("billing.invoiceStatusPaid"),
        className: "bg-success/15 text-success border-success/30",
      },
      failed: {
        label: t("billing.invoiceStatusFailed"),
        className: "bg-destructive/15 text-destructive border-destructive/30",
      },
      pending: {
        label: t("billing.invoiceStatusPending"),
        className: "bg-muted text-muted-foreground border-muted-foreground/30",
      },
    };
    const variant = variants[status] || variants.pending;
    return (
      <Badge variant="outline" className={variant.className}>
        {variant.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-3 py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">
            {t("billing.invoicesTitle")}
          </p>
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center">
              <Receipt size={24} className="text-muted-foreground" />
            </div>
            <p className="text-base font-semibold text-foreground">
              {t("billing.invoicesEmptyTitle")}
            </p>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t("billing.invoicesEmptyDesc")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {t("billing.invoicesTitle")}
          </p>
          <span className="text-xs text-muted-foreground">
            {invoices.length === 1
              ? t("billing.invoicesCount", { count: 1 })
              : t("billing.invoicesCountPlural", { count: invoices.length })}
          </span>
        </div>

        <div className="overflow-x-auto -mx-6 px-6">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("billing.invoiceColDate")}
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("billing.invoiceColDescription")}
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">
                  {t("billing.invoiceColAmount")}
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("billing.invoiceColStatus")}
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">
                  {t("billing.invoiceColActions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const dateToShow = inv.paid_at || inv.created_at;
                const totalDollars = (inv.total_amount_cents || 0) / 100;
                const description = buildInvoiceDescription(inv, t);

                return (
                  <TableRow key={inv.id} className="border-border hover:bg-muted/30">
                    <TableCell className="font-mono text-sm whitespace-nowrap">
                      {formatShortDate(dateToShow, locale)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium text-foreground">{description}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {formatUSD(totalDollars)}
                    </TableCell>
                    <TableCell>{getStatusBadge(inv.status)}</TableCell>
                    <TableCell className="text-right">
                      {inv.hosted_invoice_url ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(inv.hosted_invoice_url!, "_blank", "noopener,noreferrer")}
                          className="h-8 px-2"
                          title={t("billing.invoiceViewTooltip")}
                        >
                          <ExternalLink size={14} />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}