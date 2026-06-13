import { Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { getStatusBadgeConfig } from "@/lib/status-utils";
import { getThreatDisplay } from "@/lib/threat-display";

interface LiveFeedLog {
  created_at: string;
  ip_address: string | null;
  country_code: string | null;
  device_type: string | null;
  status_final: string;
  motivo_limpo: string | null;
  risk_score: number | null;
}

interface LiveFeedProps {
  logs: LiveFeedLog[];
  isLoading: boolean;
}

export function LiveFeed({ logs, isLoading }: LiveFeedProps) {
  const feedData = logs.slice(0, 15);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Tráfego ao Vivo
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
              Tempo Real
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table className="min-w-[650px]">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground text-[10px] uppercase tracking-wider">Quando</TableHead>
              <TableHead className="text-muted-foreground text-[10px] uppercase tracking-wider">IP</TableHead>
              <TableHead className="text-muted-foreground text-[10px] uppercase tracking-wider">País</TableHead>
              <TableHead className="text-muted-foreground text-[10px] uppercase tracking-wider">Device</TableHead>
              <TableHead className="text-muted-foreground text-[10px] uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-muted-foreground text-[10px] uppercase tracking-wider text-right">Ameaça</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : feedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  Nenhuma requisição no período
                </TableCell>
              </TableRow>
            ) : (
              feedData.map((row, i) => {
                const badgeConfig = getStatusBadgeConfig(row.status_final);
                const isApproved = row.status_final === "Aprovado";
                const threat = isApproved ? null : getThreatDisplay(row.motivo_limpo);

                return (
                  <TableRow key={i} className="border-border">
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {formatDistanceToNow(new Date(row.created_at), { addSuffix: false })}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-foreground/80">
                      {row.ip_address?.slice(0, 18) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-xs">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {row.country_code ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">
                      {row.device_type ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`${badgeConfig.className} text-[10px] font-mono`}>
                        {badgeConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {threat ? (
                        <Badge variant="outline" className={`${threat.badgeClass} text-[10px]`}>
                          {threat.label}
                        </Badge>
                      ) : (
                        <span className="text-xs text-emerald-400/60">✓ Limpo</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
