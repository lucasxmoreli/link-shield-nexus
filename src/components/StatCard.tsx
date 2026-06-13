import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "primary" | "success" | "destructive";
  trend?: { value: string; positive: boolean };
}

const variantAccent = {
  default: "border-border/50",
  primary: "border-primary/30",
  success: "border-[hsl(var(--success))]/30",
  destructive: "border-destructive/30",
};

const variantGlow = {
  default: "",
  primary: "hover:shadow-[0_0_20px_hsl(222,100%,50%,0.08)]",
  success: "hover:shadow-[0_0_20px_hsl(142,71%,45%,0.08)]",
  destructive: "hover:shadow-[0_0_20px_hsl(0,84%,60%,0.08)]",
};

const variantText = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-[hsl(var(--success))]",
  destructive: "text-destructive",
};

const variantIconBg = {
  default: "bg-muted/50",
  primary: "bg-primary/10",
  success: "bg-[hsl(var(--success))]/10",
  destructive: "bg-destructive/10",
};

export function StatCard({ title, value, icon: Icon, variant = "default", trend }: StatCardProps) {
  return (
    <div className={`group relative rounded-lg border bg-card/50 backdrop-blur-sm p-4 transition-all duration-300 ${variantAccent[variant]} ${variantGlow[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2">{title}</p>
          <div className="flex items-end gap-2">
            <p className={`text-2xl font-bold font-mono leading-none ${variantText[variant]}`}>
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
            {trend && (
              <span className={`flex items-center gap-0.5 text-[10px] font-medium pb-0.5 ${trend.positive ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend.value}
              </span>
            )}
          </div>
        </div>
        <div className={`rounded-lg p-2 ${variantIconBg[variant]} transition-colors duration-300`}>
          <Icon className={`h-4 w-4 ${variantText[variant]} opacity-70`} />
        </div>
      </div>
      {/* Bottom accent line */}
      <div className={`absolute bottom-0 left-3 right-3 h-px bg-gradient-to-r from-transparent ${variant === "primary" ? "via-primary/30" : variant === "success" ? "via-[hsl(var(--success))]/30" : variant === "destructive" ? "via-destructive/30" : "via-border/30"} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
    </div>
  );
}
