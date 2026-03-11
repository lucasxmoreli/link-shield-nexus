import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { mockProfile } from "@/lib/mock-data";

export default function AccountSettings() {
  const usagePercent = Math.round((mockProfile.current_clicks / mockProfile.max_clicks) * 100);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Account Settings</h1>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-mono text-sm">{mockProfile.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Plano</span>
            <Badge className="bg-primary/20 text-primary border-0">{mockProfile.plan_name}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge className="bg-success/20 text-success border-0">{mockProfile.subscription_status}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Uso do Plano</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Clicks utilizados</span>
            <span className="font-mono">
              {mockProfile.current_clicks.toLocaleString()} / {mockProfile.max_clicks.toLocaleString()}
            </span>
          </div>
          <Progress value={usagePercent} className="h-3 bg-secondary" />
          <p className="text-sm text-muted-foreground">{usagePercent}% do limite utilizado</p>
        </CardContent>
      </Card>
    </div>
  );
}
