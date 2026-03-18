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

const actionStyles: Record<string, string> = {
  offer_page: "bg-success/20 text-success border-0",
  safe_page: "bg-primary/20 text-primary border-0",
  bot_blocked: "bg-destructive/20 text-destructive border-0",
};

const actionLabel: Record<string, string> = {
  offer_page: "Passed",
  safe_page: "Safe Page",
  bot_blocked: "Blocked",
};

type DatePreset = "all" | "today" | "7d" | "30d";

export default function Requests() {
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["requests_log_full", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests_log")
        .select("*, campaigns(name, hash)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Derive unique campaign names for the dropdown
  const campaignOptions = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((r) => {
      if (r.campaigns?.name && r.campaign_id) {
        map.set(r.campaign_id, r.campaigns.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  // Client-side filtering
  const filtered = useMemo(() => {
    const now = new Date();
    return logs.filter((r) => {
      // Search filter (IP or hash)
      if (search) {
        const q = search.toLowerCase();
        const matchIP = r.ip_address?.toLowerCase().includes(q);
        const matchHash = r.campaigns?.hash?.toLowerCase().includes(q);
        if (!matchIP && !matchHash) return false;
      }
      // Status filter
      if (statusFilter === "passed" && r.action_taken !== "offer_page") return false;
      if (statusFilter === "blocked" && r.action_taken !== "bot_blocked" && r.action_taken !== "safe_page") return false;
      // Campaign filter
      if (campaignFilter !== "all" && r.campaign_id !== campaignFilter) return false;
      // Device filter
      if (deviceFilter !== "all" && r.device_type !== deviceFilter) return false;
      // Date filter
      if (datePreset !== "all") {
        const created = new Date(r.created_at);
        if (datePreset === "today") {
          if (created.toDateString() !== now.toDateString()) return false;
        } else if (datePreset === "7d") {
          if (now.getTime() - created.getTime() > 7 * 86400000) return false;
        } else if (datePreset === "30d") {
          if (now.getTime() - created.getTime() > 30 * 86400000) return false;
        }
      }
      return true;
    });
  }, [logs, search, statusFilter, campaignFilter, deviceFilter, datePreset]);

  const hasActiveFilters = search || statusFilter !== "all" || campaignFilter !== "all" || deviceFilter !== "all" || datePreset !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCampaignFilter("all");
    setDeviceFilter("all");
    setDatePreset("all");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">Requests Log</h1>

      {/* ── Filter Toolbar ── */}
      <Card className="border-border bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search IP or Hash..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50 border-border h-9 text-sm"
              />
            </div>

            {/* Status */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] bg-background/50 border-border h-9 text-sm">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="passed">Passed (Offer)</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>

            {/* Campaign */}
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="w-[170px] bg-background/50 border-border h-9 text-sm">
                <SelectValue placeholder="All Campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                {campaignOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Device */}
            <Select value={deviceFilter} onValueChange={setDeviceFilter}>
              <SelectTrigger className="w-[140px] bg-background/50 border-border h-9 text-sm">
                <SelectValue placeholder="All Devices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Devices</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="desktop">Desktop</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Presets */}
            <div className="flex items-center gap-1.5">
              {([
                ["all", "All Time"],
                ["today", "Today"],
                ["7d", "7 Days"],
                ["30d", "30 Days"],
              ] as [DatePreset, string][]).map(([key, label]) => (
                <Button
                  key={key}
                  variant={datePreset === key ? "default" : "outline"}
                  size="sm"
                  className={`h-9 text-xs px-3 ${datePreset === key ? "" : "bg-background/50 border-border text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setDatePreset(key)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {/* Clear */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground hover:text-foreground gap-1" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>

          {/* Results count */}
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-3">
              Showing {filtered.length} of {logs.length} requests
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card className="border-border bg-card">
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Created At</TableHead>
                <TableHead className="text-muted-foreground">Campaign</TableHead>
                <TableHead className="text-muted-foreground">Hash</TableHead>
                <TableHead className="text-muted-foreground">Country</TableHead>
                <TableHead className="text-muted-foreground">IP</TableHead>
                <TableHead className="text-muted-foreground">Device</TableHead>
                <TableHead className="text-muted-foreground">Action</TableHead>
                <TableHead className="text-muted-foreground">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>)}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <p className="text-muted-foreground font-medium">No requests found matching these filters.</p>
                    {hasActiveFilters && (
                      <Button variant="link" size="sm" className="mt-2 text-primary text-xs" onClick={clearFilters}>
                        Clear all filters
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="border-border">
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {new Date(r.created_at).toLocaleString("en-US")}
                    </TableCell>
                    <TableCell>{r.campaigns?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm text-primary">{r.campaigns?.hash ?? "—"}</TableCell>
                    <TableCell>{r.country_code ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{r.ip_address ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {r.device_type ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={actionStyles[r.action_taken] ?? ""}>
                        {actionLabel[r.action_taken] ?? r.action_taken.replace("_", " ")}
                      </Badge>
                    </TableCell>
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
