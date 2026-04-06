import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FlaskConical, Play, Loader2, RotateCcw, CheckCircle2, XCircle, Shield, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getThreatDisplay } from "@/lib/threat-display";

type TestResult = {
  action: string;
  reason?: string;
  url?: string;
  travas_ativadas: string[];
  risk_score: number;
  device?: string;
  duration_ms: number;
  error?: string;
};

type TestLog = {
  id: number;
  timestamp: Date;
  ip: string;
  userAgent: string;
  result: TestResult;
};

const PRESET_USER_AGENTS = [
  { label: "iPhone Safari (TikTok)", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", expected: "offer" },
  { label: "Android Chrome (TikTok)", value: "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36", expected: "offer" },
  { label: "Chrome Desktop", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", expected: "offer" },
  { label: "Googlebot (bot)", value: "Googlebot/2.1 (+http://www.google.com/bot.html)", expected: "safe" },
  { label: "Facebook Crawler (bot)", value: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", expected: "safe" },
  { label: "Puppeteer Headless (bot)", value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36", expected: "safe" },
];

const PRESET_IPS = [
  { label: "IP Residencial BR", value: "189.29.108.45", type: "real" },
  { label: "IP Residencial US", value: "73.162.214.101", type: "real" },
  { label: "Google DNS (Datacenter)", value: "8.8.8.8", type: "datacenter" },
  { label: "AWS EC2 (Datacenter)", value: "54.239.28.85", type: "datacenter" },
  { label: "Cloudflare DNS", value: "1.1.1.1", type: "datacenter" },
  { label: "Personalizado...", value: "custom", type: "real" },
];

export default function CloakTest() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedUAPreset, setSelectedUAPreset] = useState("");
  const [customUA, setCustomUA] = useState("");
  const [selectedIPPreset, setSelectedIPPreset] = useState("");
  const [customIP, setCustomIP] = useState("");
  const [referer, setReferer] = useState("");
  const [country, setCountry] = useState("US");
  const [testing, setTesting] = useState(false);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [logCounter, setLogCounter] = useState(0);

  const { data: campaigns, isLoading: loadingCampaigns } = useQuery({
    queryKey: ["campaigns-for-test"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, hash, is_active, domain")
        .eq("user_id", session?.user?.id ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  const getIP = () => selectedIPPreset === "custom" ? customIP : selectedIPPreset;
  const getUA = () => customUA || (PRESET_USER_AGENTS.find(p => p.value === selectedUAPreset)?.value ?? "");
  const getCampaignHash = () => campaigns?.find(c => c.id === selectedCampaign)?.hash ?? "";
  const getCampaignDomain = () => campaigns?.find(c => c.id === selectedCampaign)?.domain ?? "";

  const runTest = async () => {
    const ip = getIP();
    const userAgent = getUA();
    const campaignHash = getCampaignHash();
    if (!campaignHash || !ip || !userAgent) { toast.error("Preencha campanha, IP e User-Agent"); return; }

    setTesting(true);
    const start = performance.now();

    try {
      const domain = getCampaignDomain();
      // Usar domínio da campanha como base URL para alcançar a VPS via Cloudflare
      const baseUrl = domain ? `https://${domain}` : (import.meta.env.VITE_VPS_FILTER_URL || "https://api.cloakerx.com");
      if (!baseUrl) { toast.error("Campanha sem domínio configurado. Configure o domínio primeiro."); setTesting(false); return; }

      const res = await fetch(`${baseUrl}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_hash: campaignHash, ip, user_agent: userAgent, referer: referer || null, country: country || null }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TestResult = await res.json();
      data.duration_ms = Math.round(performance.now() - start);

      const newLog: TestLog = {
        id: logCounter + 1,
        timestamp: new Date(),
        ip,
        userAgent: userAgent.substring(0, 80),
        result: data,
      };
      setLogs(prev => [newLog, ...prev].slice(0, 20));
      setLogCounter(prev => prev + 1);

    } catch (err: any) {
      toast.error(`Erro no teste: ${err.message || "Falha de conexão"}`);
    } finally {
      setTesting(false);
    }
  };

  const isApproved = (action: string) => action === "offer_page";

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" />
          CloakTest
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Teste suas campanhas contra o motor v19.3 em tempo real. Sem gravar logs, sem consumir tokens.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CONFIG */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configuração</CardTitle>
            <CardDescription>Simule diferentes cenários de tráfego</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Campaign */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campanha</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {campaigns?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${c.is_active ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* IP */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">IP Address</Label>
              <Select value={selectedIPPreset} onValueChange={setSelectedIPPreset}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {PRESET_IPS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={`${p.type === 'datacenter' ? 'text-destructive' : 'text-emerald-400'}`}>{p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedIPPreset === "custom" && (
                <Input placeholder="123.45.67.89" value={customIP} onChange={e => setCustomIP(e.target.value)} className="mt-1" />
              )}
            </div>

            {/* User-Agent */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">User-Agent</Label>
              <Select value={selectedUAPreset} onValueChange={(v) => { setSelectedUAPreset(v); setCustomUA(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {PRESET_USER_AGENTS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Ou cole um UA customizado..." value={customUA} onChange={e => setCustomUA(e.target.value)} className="text-xs font-mono" />
            </div>

            <Separator />

            {/* Referer + Country */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Referer</Label>
                <Input placeholder="https://tiktok.com" value={referer} onChange={e => setReferer(e.target.value)} className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">País (ISO)</Label>
                <Input placeholder="US" value={country} onChange={e => setCountry(e.target.value.toUpperCase())} className="text-xs font-mono" maxLength={2} />
              </div>
            </div>

            {/* RUN */}
            <Button onClick={runTest} disabled={testing || !selectedCampaign} className="w-full gap-2">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {testing ? "Testando..." : "Executar Teste"}
            </Button>
          </CardContent>
        </Card>

        {/* RESULTS */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Resultados ({logs.length})
              </CardTitle>
              {logs.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Limpar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FlaskConical className="h-12 w-12 text-muted-foreground/20 mb-3" />
                <p className="text-muted-foreground text-sm">Execute um teste para ver os resultados aqui</p>
                <p className="text-muted-foreground/60 text-xs mt-1">O motor v19.3 será consultado em tempo real</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map(log => {
                  const approved = isApproved(log.result.action);
                  const threat = !approved ? getThreatDisplay(log.result.reason || null) : null;

                  return (
                    <div key={log.id} className={`rounded-lg border p-4 ${approved ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-destructive/20 bg-destructive/[0.03]'}`}>
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {approved
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            : <XCircle className="h-4 w-4 text-destructive" />}
                          <Badge variant="outline" className={approved
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 text-xs"
                            : "bg-destructive/10 text-destructive border-destructive/25 text-xs"}>
                            {approved ? "APROVADO → Offer Page" : "BLOQUEADO → Safe Page"}
                          </Badge>
                          {threat && (
                            <Badge variant="outline" className={`${threat.badgeClass} text-xs`}>
                              {threat.label}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">{log.result.duration_ms}ms</span>
                      </div>

                      {/* Details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">IP:</span>
                          <span className="font-mono ml-1">{log.ip}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Device:</span>
                          <span className="ml-1 capitalize">{log.result.device || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Risk Score:</span>
                          <span className={`font-mono ml-1 font-semibold ${log.result.risk_score > 65 ? 'text-destructive' : log.result.risk_score > 25 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                            {log.result.risk_score}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Razão:</span>
                          <span className="font-mono ml-1">{log.result.reason || "clean"}</span>
                        </div>
                      </div>

                      {/* Travas ativadas */}
                      {log.result.travas_ativadas && log.result.travas_ativadas.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Shield className="h-3 w-3 text-muted-foreground mt-0.5" />
                          {log.result.travas_ativadas.map((trava, idx) => (
                            <Badge key={idx} variant="outline" className="text-[10px] bg-muted/50 border-border font-mono">
                              {trava}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* UA */}
                      <p className="text-[10px] text-muted-foreground/60 font-mono mt-2 truncate">{log.userAgent}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Help */}
      <Card className="border-border bg-muted/30">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>O teste consulta o motor v19.3 em tempo real via endpoint <code className="text-foreground">/test</code>. Nenhum log é gravado, nenhum token é consumido.</p>
              <p>A Trava 8 (JS Fingerprint) é ignorada no teste porque requer browser real. No tráfego real, ela funciona normalmente.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
