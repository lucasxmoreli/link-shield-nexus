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
import { FlaskConical, Play, Shield, ShieldAlert, ShieldCheck, Loader2, Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type FilterResult = { action: string; url?: string; reason?: string };
type TestLog = { id: number; timestamp: Date; ip: string; userAgent: string; result: FilterResult; duration: number };

const PRESET_USER_AGENTS: { label: string; value: string; type: "bot" | "real" | "suspicious" }[] = [
  { label: "Chrome Desktop (Real)", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", type: "real" },
  { label: "Safari iPhone (Real)", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", type: "real" },
  { label: "Chrome Android (Real)", value: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36", type: "real" },
  { label: "Googlebot", value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", type: "bot" },
  { label: "Bingbot", value: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", type: "bot" },
  { label: "Facebook Crawler", value: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatype.html)", type: "bot" },
  { label: "TikTok Bot", value: "Mozilla/5.0 (compatible; TikTok/26.2; +https://www.tiktok.com)", type: "bot" },
  { label: "SemrushBot", value: "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)", type: "bot" },
  { label: "AhrefsBot", value: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", type: "bot" },
  { label: "ByteSpider (TikTok)", value: "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider)", type: "bot" },
];

const PRESET_IPS: { label: string; value: string; type: "real" | "datacenter" | "vpn" }[] = [
  { label: "Google DNS (Datacenter)", value: "8.8.8.8", type: "datacenter" },
  { label: "Cloudflare DNS (Datacenter)", value: "1.1.1.1", type: "datacenter" },
  { label: "AWS EC2 (Datacenter)", value: "54.239.28.85", type: "datacenter" },
  { label: "Random Residential BR", value: "189.29.108.45", type: "real" },
  { label: "Random Residential US", value: "73.162.214.101", type: "real" },
  { label: "Random Residential DE", value: "91.64.42.180", type: "real" },
  { label: "Custom...", value: "custom", type: "real" },
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
  const [testing, setTesting] = useState(false);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [logCounter, setLogCounter] = useState(0);

  const { data: campaigns, isLoading: loadingCampaigns } = useQuery({
    queryKey: ["campaigns-for-test"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("id, name, hash, is_active, offer_url, safe_url").eq("user_id", session?.user?.id ?? "").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  const getIP = () => selectedIPPreset === "custom" ? customIP : selectedIPPreset;
  const getUA = () => { if (customUA) return customUA; return PRESET_USER_AGENTS.find(p => p.value === selectedUAPreset)?.value ?? ""; };
  const getCampaignHash = () => campaigns?.find(c => c.id === selectedCampaign)?.hash ?? "";

  const runTest = async () => {
    const ip = getIP();
    const userAgent = getUA();
    const campaignHash = getCampaignHash();
    if (!campaignHash || !ip || !userAgent) { toast.error(t("cloakTest.fillRequired")); return; }
    setTesting(true);
    const start = performance.now();
    try {
      const vpsUrl = import.meta.env.VITE_VPS_FILTER_URL || "http://187.124.233.229";
      const res = await fetch(`${vpsUrl}/filter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_hash: campaignHash, ip, user_agent: userAgent, referer: referer || null }),
      });
      const duration = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`VPS returned ${res.status}`);
      const data = await res.json();
      const newLog: TestLog = { id: logCounter + 1, timestamp: new Date(), ip, userAgent: userAgent.substring(0, 60) + (userAgent.length > 60 ? "..." : ""), result: data as FilterResult, duration };
      setLogs(prev => [newLog, ...prev]);
      setLogCounter(prev => prev + 1);
    } catch (err: any) {
      toast.error(t("cloakTest.testError", { message: err.message || "Unknown error" }));
    } finally {
      setTesting(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "redirect": return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1"><ShieldCheck className="h-3 w-3" /> {t("dashboard.offerPage")}</Badge>;
      case "safe_page": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1"><Shield className="h-3 w-3" /> {t("requests.safePage")}</Badge>;
      case "bot_blocked": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1"><ShieldAlert className="h-3 w-3" /> {t("dashboard.botsBlocked")}</Badge>;
      default: return <Badge variant="outline">{action}</Badge>;
    }
  };

  const getUATypeColor = (type: string) => { switch (type) { case "bot": return "text-red-400"; case "real": return "text-green-400"; default: return "text-muted-foreground"; } };
  const getIPTypeColor = (type: string) => { switch (type) { case "datacenter": return "text-red-400"; case "vpn": return "text-yellow-400"; case "real": return "text-green-400"; default: return "text-muted-foreground"; } };

  const copyLog = (log: TestLog) => {
    const text = `IP: ${log.ip}\nUA: ${log.userAgent}\nAction: ${log.result.action}\nURL: ${log.result.url || "N/A"}\nReason: ${log.result.reason || "N/A"}\nDuration: ${log.duration}ms`;
    navigator.clipboard.writeText(text);
    toast.success(t("cloakTest.logCopied"));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" />
          {t("cloakTest.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("cloakTest.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">{t("cloakTest.testConfig")}</CardTitle>
            <CardDescription>{t("cloakTest.testConfigDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>{t("cloakTest.campaignRequired")}</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger><SelectValue placeholder={loadingCampaigns ? t("common.loading") : t("cloakTest.selectCampaign")} /></SelectTrigger>
                <SelectContent>
                  {campaigns?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">{c.name}{!c.is_active && <Badge variant="outline" className="text-xs">{t("common.inactive")}</Badge>}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>{t("cloakTest.userAgentRequired")}</Label>
              <Select value={selectedUAPreset} onValueChange={(v) => { setSelectedUAPreset(v); setCustomUA(""); }}>
                <SelectTrigger><SelectValue placeholder={t("cloakTest.choosePreset")} /></SelectTrigger>
                <SelectContent>
                  {PRESET_USER_AGENTS.map(ua => (
                    <SelectItem key={ua.value} value={ua.value}>
                      <span className={`flex items-center gap-2 ${getUATypeColor(ua.type)}`}>{ua.type === "bot" ? "🤖" : "👤"} {ua.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder={t("cloakTest.customUA")} value={customUA} onChange={(e) => { setCustomUA(e.target.value); setSelectedUAPreset(""); }} className="font-mono text-xs" />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>{t("cloakTest.ipRequired")}</Label>
              <Select value={selectedIPPreset} onValueChange={setSelectedIPPreset}>
                <SelectTrigger><SelectValue placeholder={t("cloakTest.choosePreset")} /></SelectTrigger>
                <SelectContent>
                  {PRESET_IPS.map(ip => (
                    <SelectItem key={ip.value} value={ip.value}>
                      <span className={`flex items-center gap-2 ${getIPTypeColor(ip.type)}`}>{ip.type === "datacenter" ? "🏢" : ip.type === "vpn" ? "🔒" : "🏠"} {ip.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedIPPreset === "custom" && <Input placeholder={t("cloakTest.enterIp")} value={customIP} onChange={(e) => setCustomIP(e.target.value)} className="font-mono" />}
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>{t("cloakTest.refererOptional")}</Label>
              <Input placeholder="https://www.tiktok.com/@user/video/123" value={referer} onChange={(e) => setReferer(e.target.value)} />
            </div>
            <Button className="w-full gap-2 mt-2" size="lg" onClick={runTest} disabled={testing || !selectedCampaign || (!selectedUAPreset && !customUA) || !selectedIPPreset || (selectedIPPreset === "custom" && !customIP)}>
              {testing ? (<><Loader2 className="h-4 w-4 animate-spin" /> {t("common.testing")}</>) : (<><Play className="h-4 w-4" /> {t("cloakTest.runTest")}</>)}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">{t("cloakTest.results")}</CardTitle>
              <CardDescription>{t("cloakTest.testsExecuted", { count: logs.length })}</CardDescription>
            </div>
            {logs.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setLogs([])} className="gap-1 text-muted-foreground">
                <RotateCcw className="h-3 w-3" /> {t("common.clear")}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FlaskConical className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">{t("cloakTest.noTests")}</p>
                <p className="text-xs mt-1">{t("cloakTest.noTestsHelper")}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {logs.map(log => (
                  <div key={log.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">#{log.id}</span>
                        {getActionBadge(log.result.action)}
                        <span className="text-xs text-muted-foreground">{log.duration}ms</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyLog(log)}><Copy className="h-3 w-3" /></Button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div><span className="text-muted-foreground">IP: </span><span className="font-mono text-foreground">{log.ip}</span></div>
                      <div><span className="text-muted-foreground">Time: </span><span className="text-foreground">{log.timestamp.toLocaleTimeString()}</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">UA: </span><span className="font-mono text-foreground">{log.userAgent}</span></div>
                      {log.result.url && <div className="col-span-2"><span className="text-muted-foreground">URL: </span><span className="font-mono text-primary break-all">{log.result.url}</span></div>}
                      {log.result.reason && <div className="col-span-2"><span className="text-muted-foreground">{t("requests.reason")}: </span><span className="text-yellow-400">{log.result.reason}</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
