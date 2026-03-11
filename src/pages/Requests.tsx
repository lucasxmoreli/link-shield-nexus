import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mockRequestsLog } from "@/lib/mock-data";

const actionStyles: Record<string, string> = {
  offer_page: "bg-success/20 text-success border-0",
  safe_page: "bg-primary/20 text-primary border-0",
  bot_blocked: "bg-destructive/20 text-destructive border-0",
};

export default function Requests() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Requests Log</h1>
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Created At</TableHead>
                <TableHead className="text-muted-foreground">Campaign</TableHead>
                <TableHead className="text-muted-foreground">Hash</TableHead>
                <TableHead className="text-muted-foreground">Country</TableHead>
                <TableHead className="text-muted-foreground">IP</TableHead>
                <TableHead className="text-muted-foreground">Device</TableHead>
                <TableHead className="text-muted-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockRequestsLog.map((r) => (
                <TableRow key={r.id} className="border-border">
                  <TableCell className="text-sm text-muted-foreground font-mono">
                    {new Date(r.created_at).toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell>{r.campaign_name}</TableCell>
                  <TableCell className="font-mono text-sm text-primary">{r.hash}</TableCell>
                  <TableCell>{r.country_code}</TableCell>
                  <TableCell className="font-mono text-sm">{r.ip_address}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      {r.device_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={actionStyles[r.action_taken]}>
                      {r.action_taken.replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
