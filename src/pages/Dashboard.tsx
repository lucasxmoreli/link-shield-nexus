import { Activity, ShieldCheck, Target, Bug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { mockStats, mockChartData } from "@/lib/mock-data";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Requests" value={mockStats.total_requests} icon={Activity} />
        <StatCard title="Safe Page" value={mockStats.safe_page} icon={ShieldCheck} variant="primary" />
        <StatCard title="Offer Page" value={mockStats.offer_page} icon={Target} variant="success" />
        <StatCard title="Bots Blocked" value={mockStats.bot_blocked} icon={Bug} variant="destructive" />
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Tráfego nos últimos 7 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockChartData}>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
