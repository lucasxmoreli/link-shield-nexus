import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

type DatePreset = "all" | "today" | "7d" | "30d";

export default function Requests() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const actionStyles: Record<string, string> = {
    offer_page: "bg-success/20 text-success border-0",
    safe_page: "bg-primary/20 text-primary border-0",
    bot_blocked: "bg-destructive/20 text-destructive border-0",
  };

  const actionLabel: Record<string, string> = {
    offer_page: t("dashboard.passed"),
    safe_page: t("requests.safePage"),
    bot_blocked: t("dashboard.blocked"),
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["requests_log_full", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("requests_log").select("*, campaigns(name, hash)").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const campaignOptions = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((r) => { if (r.campaigns?.name && r.campaign_id) map.set(r.campaign_id, r.campaigns.name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  const filtered = useMemo(() => {
    const now = new Date();
    return logs.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        const matchIP = r.ip_address?.toLowerCase().includes(q);
        const matchHash = r.campaigns?.hash?.toLowerCase().includes(q);
        if (!matchIP && !matchHash) return false;
      }
      if (statusFilter === "passed" && r.action_taken !== "offer_page") return false;
      if (statusFilter === "blocked" && r.action_taken !== "bot_blocked" && r.action_taken !== "safe_page") return false;
      if (campaignFilter !== "all" && r.campaign_id !== campaignFilter) return false;
      if (deviceFilter !== "all" && r.device_type !== deviceFilter) return false;
      if (datePreset !== "all") {
        const created = new Date(r.created_at);
        if (datePreset === "today") { if (created.toDateString() !== now.toDateString()) return false; }
        else if (datePreset === "7d") { if (now.getTime() - created.getTime() > 7 * 86400000) return false; }
        else if (datePreset === "30d") { if (now.getTime() - created.getTime() > 30 * 86400000) return false; }
      }
      return true;
    });
  }, [logs, search, statusFilter, campaignFilter, deviceFilter, datePreset]);

  const hasActiveFilters = search || statusFilter !== "all" || campaignFilter !== "all" || deviceFilter !== "all" || datePreset !== "all";
  const clearFilters = () => { setSearch(""); setStatusFilter("all"); setCampaignFilter("all"); setDeviceFilter("all"); setDatePreset("all"); };

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">{t("requests.title")}</h1>

      <Card className="border-border bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
              <Input placeholder={t("requests.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background/50 border-border h-9 text-sm" />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] bg-background/50 border-border h-9 text-sm"><SelectValue placeholder={t("requests.allActions")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("requests.allActions")}</SelectItem>
                <SelectItem value="passed">{t("requests.passedOffer")}</SelectItem>
                <SelectItem value="blocked">{t("dashboard.blocked")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="w-[170px] bg-background/50 border-border h-9 text-sm"><SelectValue placeholder={t("requests.allCampaigns")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("requests.allCampaigns")}</SelectItem>
                {campaignOptions.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>

            <Select value={deviceFilter} onValueChange={setDeviceFilter}>
              <SelectTrigger className="w-[140px] bg-background/50 border-border h-9 text-sm"><SelectValue placeholder={t("requests.allDevices")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("requests.allDevices")}</SelectItem>
                <SelectItem value="mobile">{t("dashboard.mobile")}</SelectItem>
                <SelectItem value="desktop">{t("dashboard.desktop")}</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              {([["all", t("requests.allTime")], ["today", t("dashboard.today")], ["7d", t("requests.days7")], ["30d", t("requests.days30")]] as [DatePreset, string][]).map(([key, label]) => (
                <Button key={key} variant={datePreset === key ? "default" : "outline"} size="sm" className={`h-9 text-xs px-3 ${datePreset === key ? "" : "bg-background/50 border-border text-muted-foreground hover:text-foreground"}`} onClick={() => setDatePreset(key)}>
                  {label}
                </Button>
              ))}
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground hover:text-foreground gap-1" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> {t("common.clear")}
              </Button>
            )}
          </div>
          {!isLoading && <p className="text-xs text-muted-foreground mt-3">{t("requests.showing", { count: filtered.length, total: logs.length })}</p>}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">{t("requests.createdAt")}</TableHead>
                <TableHead className="text-muted-foreground">{t("requests.campaign")}</TableHead>
                <TableHead className="text-muted-foreground">Hash</TableHead>
                <TableHead className="text-muted-foreground">{t("dashboard.country")}</TableHead>
                <TableHead className="text-muted-foreground">{t("requests.score")}</TableHead>
                <TableHead className="text-muted-foreground">{t("requests.ip")}</TableHead>
                <TableHead className="text-muted-foreground">{t("dashboard.device")}</TableHead>
                <TableHead className="text-muted-foreground">{t("dashboard.action")}</TableHead>
                <TableHead className="text-muted-foreground">{t("requests.reason")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>)}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <p className="text-muted-foreground font-medium">{t("requests.noRequests")}</p>
                    {hasActiveFilters && <Button variant="link" size="sm" className="mt-2 text-primary text-xs" onClick={clearFilters}>{t("requests.clearAllFilters")}</Button>}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="border-border">
                    <TableCell className="text-sm text-muted-foreground font-mono">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell>{r.campaigns?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm text-primary">{r.campaigns?.hash ?? "—"}</TableCell>
                    <TableCell>{r.country_code ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{r.ip_address ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="border-border text-muted-foreground">{r.device_type ?? "—"}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={actionStyles[r.action_taken] ?? ""}>{actionLabel[r.action_taken] ?? r.action_taken.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{(r as any).block_reason ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
