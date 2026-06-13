import { useMemo } from "react";
import { Shield, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { aggregateThreats } from "@/lib/threat-display";

interface TravaBreakdownProps {
  logs: Array<{
    status_final: string;
    motivo_limpo: string | null;
  }>;
}

export function TravaBreakdown({ logs }: TravaBreakdownProps) {
  const { data, total } = useMemo(() => {
    const data = aggregateThreats(logs);
    const total = data.reduce((acc, d) => acc + d.value, 0);
    return { data, total };
  }, [logs]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Ameaças Neutralizadas
          </CardTitle>
          <span className="text-xs font-mono text-muted-foreground">
            {total.toLocaleString()} bloqueios
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum bloqueio no período</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {data.map((d, idx) => (
                      <Cell key={idx} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5', borderRadius: '8px' }}
                    itemStyle={{ color: '#f4f4f5' }}
                    formatter={(value: number) => {
                      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                      return [`${value} (${pct}%)`, ""];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-1.5 mt-1">
              {data.map((d) => {
                const Icon = d.icon;
                return (
                  <div key={d.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <Icon className="h-3 w-3 shrink-0" style={{ color: d.color }} />
                      <span className="text-muted-foreground truncate">{d.label}</span>
                    </div>
                    <span className="font-mono text-foreground shrink-0 ml-2">
                      {d.value} <span className="text-muted-foreground">({d.pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
