import { Copy, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const CNAME_TARGET = "cname.cloakerx.com";

export function DnsConfigTable() {
  const { t } = useTranslation();

  const handleCopy = () => {
    navigator.clipboard.writeText(CNAME_TARGET);
    toast.success(t("domains.valueCopied"));
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base">{t("domains.dnsSetupTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table className="min-w-[500px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">{t("domains.dnsType")}</TableHead>
                <TableHead className="text-muted-foreground">{t("domains.dnsName")}</TableHead>
                <TableHead className="text-muted-foreground">{t("domains.dnsContent")}</TableHead>
                <TableHead className="text-muted-foreground">{t("domains.dnsProxy")}</TableHead>
                <TableHead className="text-muted-foreground">TTL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="border-border">
                <TableCell className="font-mono text-sm font-semibold">CNAME</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  track <span className="text-xs">({t("domains.dnsNameHint")})</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{CNAME_TARGET}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Cloud className="h-4 w-4 text-orange-500 fill-orange-500" />
                    <span className="text-sm text-orange-500 font-medium">{t("domains.dnsProxyActive")}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">Auto</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-3">
          <Cloud className="h-4 w-4 mt-0.5 text-orange-500 fill-orange-500 shrink-0" />
          <p className="text-sm text-orange-500">
            {t("domains.dnsProxyWarning")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
