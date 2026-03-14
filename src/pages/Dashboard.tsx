import { useQuery } from "@tanstack/react-query";
import { Activity, ShieldCheck, Target, Bug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, subDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["requests_log", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests_log")
        .select("action_taken, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const stats = {
    total_requests: logs.length,
    safe_page: logs.filter((l) => l.action_taken === "safe_page").length,
    offer_page: logs.filter((l) => l.action_taken === "offer_page").length,
    bot_blocked: logs.filter((l) => l.action_taken === "bot_blocked").length,
  };

  const chartData = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dayStr = format(date, "yyyy-MM-dd");
    const dayLabel = format(date, "EEE");
    const dayLogs = logs.filter((l) => l.created_at.startsWith(dayStr));
    return {
      day: dayLabel,
      offer_page: dayLogs.filter((l) => l.action_taken === "offer_page").length,
      bot_blocked: dayLogs.filter((l) => l.action_taken === "bot_blocked").length,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <StatCard title="Total Requests" value={stats.total_requests} icon={Activity} />
            <StatCard title="Safe Page" value={stats.safe_page} icon={ShieldCheck} variant="primary" />
            <StatCard title="Offer Page" value={stats.offer_page} icon={Target} variant="success" />
            <StatCard title="Bots Blocked" value={stats.bot_blocked} icon={Bug} variant="destructive" />
          </>
        )}
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Traffic — Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 18%)" />
                  <XAxis dataKey="day" stroke="hsl(0 0% 55%)" fontSize={12} />
                  <YAxis stroke="hsl(0 0% 55%)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(0 0% 11.8%)",
                      border: "1px solid hsl(0 0% 18%)",
                      borderRadius: "8px",
                      color: "hsl(0 0% 95%)",
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="offer_page" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={{ r: 4 }} name="Offer Page" />
                  <Line type="monotone" dataKey="bot_blocked" stroke="hsl(0 84% 60%)" strokeWidth={2} dot={{ r: 4 }} name="Bots Blocked" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
