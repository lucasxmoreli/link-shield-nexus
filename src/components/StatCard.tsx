import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "primary" | "success" | "destructive";
  trend?: { value: string; positive: boolean };
}

const variantStyles = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  destructive: "text-destructive",
};

const iconBgStyles = {
  default: "bg-muted",
  primary: "bg-primary/15",
  success: "bg-success/15",
  destructive: "bg-destructive/15",
};

const cardAccent: Record<string, string> = {
  default: "",
  primary: "border-l-2 border-l-primary/50",
  success: "border-l-2 border-l-[hsl(var(--success))]/50",
  destructive: "border-l-2 border-l-destructive/50 shadow-[inset_0_0_30px_hsl(0_84%_60%/0.06)]",
};

export function StatCard({ title, value, icon: Icon, variant = "default", trend }: StatCardProps) {
  return (
    <Card className={`border-border bg-card hover:bg-accent/30 transition-colors duration-300 ${cardAccent[variant]}`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-xl p-3 ${iconBgStyles[variant]}`}>
          <Icon className={`h-6 w-6 ${variantStyles[variant]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{title}</p>
          <div className="flex items-end gap-2">
            <p className={`text-2xl font-bold font-mono ${variantStyles[variant]}`}>
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
            {trend && (
              <span className={`flex items-center gap-0.5 text-[11px] font-medium pb-0.5 ${trend.positive ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend.value}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
