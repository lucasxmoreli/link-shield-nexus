import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function AccountSettings() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const maxClicks = profile?.max_clicks ?? 100000;
  const currentClicks = profile?.current_clicks ?? 0;
  const usagePercent = Math.round((currentClicks / maxClicks) * 100);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Account Settings</h1>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-lg">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-mono text-sm">{profile?.email ?? user?.email ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Plan</span>
            <Badge className="bg-primary/20 text-primary border-0">{profile?.plan_name ?? "Free"}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge className="bg-success/20 text-success border-0">{profile?.subscription_status ?? "active"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-lg">Plan Usage</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Clicks used</span>
            <span className="font-mono">{currentClicks.toLocaleString()} / {maxClicks.toLocaleString()}</span>
          </div>
          <Progress value={usagePercent} className="h-3 bg-secondary" />
          <p className="text-sm text-muted-foreground">{usagePercent}% of limit used</p>
        </CardContent>
      </Card>
    </div>
  );
}
