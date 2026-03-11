import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "primary" | "success" | "destructive";
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

export function StatCard({ title, value, icon: Icon, variant = "default" }: StatCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-lg p-3 ${iconBgStyles[variant]}`}>
          <Icon className={`h-6 w-6 ${variantStyles[variant]}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className={`text-2xl font-bold font-mono ${variantStyles[variant]}`}>
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
