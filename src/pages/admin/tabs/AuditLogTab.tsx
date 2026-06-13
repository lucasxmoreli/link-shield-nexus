import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/integrations/supabase/untyped";
import { useTranslation } from "react-i18next";
import { Loader2, Search, Filter, X, Eye, RefreshCw, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, formatDistanceToNow, subDays, subHours } from "date-fns";

// =============================================================================
// Types
// =============================================================================

interface AuditLogRow {
  id: string;
  admin_email: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  source_ip: string | null;
  user_agent: string | null;
  created_at: string;
  has_more: boolean;
}

interface FacetRow {
  facet_type: "action" | "admin";
  facet_value: string;
}

type DateRangeKey = "all" | "24h" | "7d" | "30d";
type ActionCategory = "create" | "delete" | "toggle" | "update" | "other";

// =============================================================================
// Helpers
// =============================================================================

function getActionCategory(action: string): ActionCategory {
  if (action.includes("create")) return "create";
  if (action.includes("delete")) return "delete";
  if (action.includes("toggle") || action.includes("activate") || action.includes("deactivate") || action.includes("suspend") || action.includes("unsuspend")) return "toggle";
  if (action.includes("change") || action.includes("update")) return "update";
  return "other";
}

function getCategoryColor(category: ActionCategory): string {
  switch (category) {
    case "create": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "delete": return "bg-destructive/15 text-destructive border-destructive/30";
    case "toggle": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "update": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default: return "bg-secondary text-muted-foreground border-border";
  }
}

function dateRangeToFromTo(key: DateRangeKey): { from: string | null; to: string | null } {
  const now = new Date();
  switch (key) {
    case "24h": return { from: subHours(now, 24).toISOString(), to: null };
    case "7d":  return { from: subDays(now, 7).toISOString(), to: null };
    case "30d": return { from: subDays(now, 30).toISOString(), to: null };
    default:    return { from: null, to: null };
  }
}

const PAGE_SIZE = 50;

// =============================================================================
// Component
// =============================================================================

export default function AuditLogTab() {
  const { t } = useTranslation();

  // Filter state
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [adminFilter, setAdminFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchActive, setSearchActive] = useState<string>("");

  // Pagination state
  const [offset, setOffset] = useState<number>(0);

  // Drilldown state
  const [drilldownRow, setDrilldownRow] = useState<AuditLogRow | null>(null);

  // Reset offset when filters change
  const filterKey = `${actionFilter}|${adminFilter}|${dateRange}|${searchActive}`;
  useMemo(() => { setOffset(0); }, [filterKey]);

  // ──────────────────────────────────────────────────────────────────────────
  // Query: facets (dropdowns)
  // ──────────────────────────────────────────────────────────────────────────
  const { data: facets = [] } = useQuery({
    queryKey: ["audit_log_facets"],
    queryFn: async (): Promise<FacetRow[]> => {
      const { data, error } = await supabaseUntyped.rpc("admin_list_audit_log_facets");
      if (error) throw error;
      return ((data as unknown) as FacetRow[]) || [];
    },
    staleTime: 60_000,
  });

  const actionOptions = useMemo(
    () => facets.filter((f) => f.facet_type === "action").map((f) => f.facet_value),
    [facets]
  );
  const adminOptions = useMemo(
    () => facets.filter((f) => f.facet_type === "admin").map((f) => f.facet_value),
    [facets]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Query: filtered audit log
  // ──────────────────────────────────────────────────────────────────────────
  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit_log", actionFilter, adminFilter, dateRange, searchActive, offset],
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { from, to } = dateRangeToFromTo(dateRange);
      const { data, error } = await supabaseUntyped.rpc("admin_list_audit_log_filtered", {
        p_action: actionFilter === "all" ? null : actionFilter,
        p_admin_email: adminFilter === "all" ? null : adminFilter,
        p_search: searchActive || null,
        p_from: from,
        p_to: to,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      if (error) throw error;
      return ((data as unknown) as AuditLogRow[]) || [];
    },
  });

  const hasMore = rows.length > 0 && rows[rows.length - 1].has_more;

  // ──────────────────────────────────────────────────────────────────────────
  // Handlers
  // ──────────────────────────────────────────────────────────────────────────
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchActive(searchInput.trim());
    setOffset(0);
  };

  const handleClearFilters = () => {
    setActionFilter("all");
    setAdminFilter("all");
    setDateRange("all");
    setSearchInput("");
    setSearchActive("");
    setOffset(0);
  };

  const hasActiveFilters = actionFilter !== "all" || adminFilter !== "all" || dateRange !== "all" || searchActive !== "";

  return (
    <div className="space-y-6">
      {/* ─────────── Header ─────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{t("admin.auditLogTitle")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("admin.auditLogSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </Button>
      </div>

      {/* ─────────── Filters ─────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" /> {t("admin.filters")}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="ml-auto h-7 text-xs">
              <X className="h-3 w-3 mr-1" /> {t("admin.clearFilters")}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Action filter */}
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setOffset(0); }}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder={t("admin.filterByAction")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.allActions")}</SelectItem>
              {actionOptions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Admin filter */}
          <Select value={adminFilter} onValueChange={(v) => { setAdminFilter(v); setOffset(0); }}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder={t("admin.filterByAdmin")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.allAdmins")}</SelectItem>
              {adminOptions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range filter */}
          <Select value={dateRange} onValueChange={(v) => { setDateRange(v as DateRangeKey); setOffset(0); }}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder={t("admin.dateRange")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.allTime")}</SelectItem>
              <SelectItem value="24h">{t("admin.last24h")}</SelectItem>
              <SelectItem value="7d">{t("admin.last7d")}</SelectItem>
              <SelectItem value="30d">{t("admin.last30d")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("admin.searchAuditPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="bg-secondary/50 pl-8"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              {t("common.search", "Buscar")}
            </Button>
          </form>
        </div>
      </div>

      {/* ─────────── Table ─────────── */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {hasActiveFilters ? t("admin.noAuditLogsFiltered") : t("admin.noAuditLogs")}
          </div>
        ) : (
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.when")}</TableHead>
                <TableHead>{t("admin.adminCol")}</TableHead>
                <TableHead>{t("admin.actionCol")}</TableHead>
                <TableHead>{t("admin.targetCol")}</TableHead>
                <TableHead>{t("admin.ipCol")}</TableHead>
                <TableHead className="w-20 text-right">{t("admin.detailsCol")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const category = getActionCategory(row.action);
                return (
                  <TableRow key={row.id} className="hover:bg-accent/30">
                    <TableCell className="text-sm text-muted-foreground" title={format(new Date(row.created_at), "yyyy-MM-dd HH:mm:ss")}>
                      {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-sm">{row.admin_email || "—"}</TableCell>
                    <TableCell>
                      <Badge className={`gap-1 ${getCategoryColor(category)}`}>
                        {row.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {row.target_table ? (
                        <span>
                          {row.target_table}
                          {row.target_id && <span className="opacity-60">/{row.target_id.slice(0, 8)}…</span>}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {row.source_ip || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => setDrilldownRow(row)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={t("admin.viewDetails")}
                      >
                        <Eye className="h-4 w-4 inline" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ─────────── Load More ─────────── */}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t("admin.loadMore")}
          </Button>
        </div>
      )}

      {/* ─────────── Drilldown Dialog ─────────── */}
      <Dialog open={!!drilldownRow} onOpenChange={(open) => !open && setDrilldownRow(null)}>
        <DialogContent className="sm:max-w-2xl border-primary/20 bg-card max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" />
              {t("admin.auditDetailsTitle")}
            </DialogTitle>
            <DialogDescription>
              {drilldownRow && (
                <span className="block mt-1">
                  <span className="font-mono text-xs">{drilldownRow.action}</span>
                  {" · "}
                  <span>{format(new Date(drilldownRow.created_at), "yyyy-MM-dd HH:mm:ss")}</span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {drilldownRow && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">{t("admin.adminCol")}</div>
                  <div className="font-medium">{drilldownRow.admin_email || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("admin.ipCol")}</div>
                  <div className="font-mono text-xs">{drilldownRow.source_ip || "—"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground">{t("admin.targetCol")}</div>
                  <div className="font-mono text-xs">{drilldownRow.target_table || "—"}{drilldownRow.target_id ? `/${drilldownRow.target_id}` : ""}</div>
                </div>
                {drilldownRow.user_agent && (
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground">{t("admin.userAgent")}</div>
                    <div className="font-mono text-xs break-all">{drilldownRow.user_agent}</div>
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("admin.payload")}</div>
                <pre className="rounded-md bg-secondary/50 border border-border p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  {drilldownRow.payload ? JSON.stringify(drilldownRow.payload, null, 2) : "null"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}