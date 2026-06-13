// =============================================================================
// CLOAKGUARD MOTOR — server.js v20.6 (PR-3c: HARDENING — race conditions, backoff, cleanup)
// =============================================================================
//
// PATCHES APLICADOS SOBRE v20:
//   S-01 SSRF: validação de destino em firePostback + fetchAndServe + checkUrls externas
//              (bloqueio de IPs privados, loopback, link-local, metadata; redirect: 'manual'
//              com revalidação a cada hop; allowlist de scheme; resolução DNS pré-fetch)
//   S-02 DoS:  cap de 2MB no body de fetchAndServe (streaming com abort)
//   S-03 Open Redirect: catch de fetchAndServe redireciona para SAFE_FALLBACK_URL,
//                       nunca para targetUrl controlado pelo usuário
//   S-04 CF-IP enforcement: agora é hard block em produção (NODE_ENV=production)
//   S-05 Filter injection: .or() refatorado para duas queries combinadas em JS
//   S-07 Timing attack: cache-clear secret usa timingSafeEqual
//   S-16 Error leak: /test não retorna err.message
//
// HISTORICO DE ALTERACOES (resumo)
// v1->v18.2: (ver versoes anteriores)
// v19:    TRAVA 8 — JS FINGERPRINT (Camada 8)
// v19.1:  Strict Mode inteligente (scoring em vez de bloqueio binario)
// v19.2:  Shadow Metrics (dedup_clicks, prefetch_clicks, ghost_clicks)
// v19.3:  ESCALABILIDADE — 100k cliques/dia
// v20:    ESCALABILIDADE 500k/dia + 3 NOVAS TRAVAS (T6/T7/T9)
// v20.1:  SECURITY PATCH (SSRF/DoS/Open Redirect)
// v20.2:  Motor /c/:hash por hash + host validation (anti-takeover)
// v20.3:  Border Quarantine — Cloudflare IP Access Rules sync (bearer token)
// v20.4:  TRAVA 10 — Macro & Bot Signature Filter (modulo lib/bot-signatures.js)
// v20.5:  PR-3b.1 — is_unique consulta requests_log (rolling 24h) como source
//         of truth (LRU vira hot cache).
//         PR-3b.4 — Fix do card "Cliques Únicos" + varredura de zeros:
//           - User-Agent passa a compor a chave de unicidade (LRU + DB).
//             Antes: NAT/CGNAT/escritório colapsavam todos os usuários
//             atrás de um IP em "1 único".
//           - checkIsUnique movido para ANTES de sendToSafe. TODA rota de
//             bloqueio agora persiste o is_unique real (antes era hardcoded
//             false → card mostrava 0 em campanha 100% suja).
//           - logEvent + /fp: troca `||` por `??` em cost/risk_score (preserva
//             cost=0 e risk_score=0 legítimos) e `Boolean()` em is_unique.
//           - /health duplicado: o segundo virou /stats (Express usava só o
//             primeiro registrado, deixando observabilidade invisível).
// v20.6:  PR-3c — Hardening de produção (5 fixes pós-auditoria):
//           - Bug #1: WriteBuffer requeue (unshift) com backoff em
//             consecutiveFailures. Antes: erro de batch disparava insert por
//             linha individual — amplificava outage do Supabase em N requests
//             serializadas. Agora: re-enfileira o batch pra próxima janela e
//             alerta CRITICAL após 5 falhas consecutivas.
//           - Bug #2: consumeSessionToken / consumeFingerprintToken agora
//             usam UPDATE atômico (UPDATE...WHERE used=false ... RETURNING).
//             Antes: SELECT-then-UPDATE permitia race entre 2 requests
//             pegarem o mesmo token milissegundos antes do flag virar true.
//           - Bug #3: uniqueCheckCache NÃO cacheia em caminho de erro do DB.
//             Antes: erro Supabase setava cache=true por 24h, impedindo
//             retry quando DB voltava ao normal. Agora: pior caso é
//             over-count temporário até o DB responder.
//           - Bug #4: updateCampaignStats usa cost ?? 0 (consistente com
//             PR-3b.4). Antes: || 0 convertia cost=0 legítimo em null no
//             payload, somando errado em ROI.
//           - Bug #5: setInterval refs salvas (monitor + cf-sync) +
//             gracefulShutdown unificado com clearInterval ANTES do flush
//             dos buffers. Antes: timers continuavam batendo no Supabase
//             durante o flush final do shutdown. Agora: cleanup ordenado
//             (timers → buffers → exit), com flag isShuttingDown para
//             idempotência entre SIGTERM/SIGINT concomitantes.
//
// Variaveis de ambiente (.env):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   IPINFO_TOKEN, PROXYCHECK_KEY
//   PORT=3000, IP_CACHE_TTL_MS=86400000, SESSION_TOKEN_TTL_MS=600000
//   FP_TOKEN_TTL_MS=30000, FP_SCORE_THRESHOLD=70
//   CACHE_CLEAR_SECRET=(qualquer string secreta)
//   NODE_ENV=production (ativa CF-IP hard enforcement)
//   SAFE_FALLBACK_URL=https://google.com (fallback global para erros)
// =============================================================================

require('dotenv').config();
const express    = require('express');
const rateLimit  = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID, timingSafeEqual } = require('crypto');
const { LRUCache } = require('lru-cache');
const dns = require('dns').promises;
const net = require('net');
const { runBotSignatureFilter } = require('./lib/bot-signatures'); // Trava 10

const app  = express();

// =============================================================================
// HEALTHCHECK ENDPOINT — Sprint Observabilidade (pós-incidente 14/04/2026)
// =============================================================================
// Retorna 200 + {status: "ok"} quando motor está saudável.
// Retorna 503 + {status: "degraded"} quando Supabase timeout ou erro.
// UptimeRobot monitora esse endpoint a cada 5 minutos via Cloudflare.
// Keyword match: "status":"ok" — falha imediata se body não contém.
// =============================================================================
const HEALTH_TIMEOUT_MS = 3000; // 3s max pra check do Supabase

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

app.get('/health', async (req, res) => {
  const startTime = Date.now();
  try {
    // Timeout manual pra não travar a response indefinidamente
    const supabaseCheck = Promise.race([
      supabase.from('profiles').select('id').limit(1),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Supabase timeout after 3000ms')), HEALTH_TIMEOUT_MS)
      )
    ]);
    const { error } = await supabaseCheck;
    if (error) throw error;
    const responseTime = Date.now() - startTime;
    const memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const uptimeSec = Math.floor(process.uptime());
    res.status(200).json({
      status: 'ok',
      uptime_seconds: uptimeSec,
      uptime_human: formatUptime(uptimeSec),
      memory_mb: memoryMB,
      supabase_latency_ms: responseTime,
      timestamp: new Date().toISOString(),
      version: 'v20.6', // [PR-3c FIX] bump version
    });
  } catch (err) {
    const responseTime = Date.now() - startTime;
    console.error(`[HEALTH] Degraded: ${err.message} (${responseTime}ms)`);
    res.status(503).json({
      status: 'degraded',
      error: err.message || 'Unknown error',
      supabase_latency_ms: responseTime,
      timestamp: new Date().toISOString(),
    });
  }
});
// =============================================================================
// FIM HEALTHCHECK
// =============================================================================

const port = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SAFE_FALLBACK_URL = process.env.SAFE_FALLBACK_URL || 'https://google.com';

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '4kb' }));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const IP_CACHE_TTL_MS      = parseInt(process.env.IP_CACHE_TTL_MS)      || 24 * 60 * 60 * 1000;
const SESSION_TOKEN_TTL_MS = parseInt(process.env.SESSION_TOKEN_TTL_MS) || 10 * 60 * 1000;
const FP_TOKEN_TTL_MS      = parseInt(process.env.FP_TOKEN_TTL_MS)      || 30 * 1000;
const FP_SCORE_THRESHOLD   = parseInt(process.env.FP_SCORE_THRESHOLD)   || 70;

// ============================================================================
// S-01 / S-02 / S-03: SSRF DEFENSE LAYER
// ============================================================================
// Bloqueia ranges de IP privados, loopback, link-local, metadata, multicast,
// reservados, e qualquer hostname suspeito. Usado por TODA chamada fetch que
// recebe URL controlada por usuário.
// ============================================================================

const PRIVATE_IPV4_RANGES = [
    ['0.0.0.0',         '0.255.255.255'],     // RFC 1122 "this network"
    ['10.0.0.0',        '10.255.255.255'],    // RFC 1918
    ['100.64.0.0',      '100.127.255.255'],   // RFC 6598 CGNAT
    ['127.0.0.0',       '127.255.255.255'],   // loopback
    ['169.254.0.0',     '169.254.255.255'],   // link-local + cloud metadata (169.254.169.254)
    ['172.16.0.0',      '172.31.255.255'],    // RFC 1918
    ['192.0.0.0',       '192.0.0.255'],       // RFC 6890
    ['192.0.2.0',       '192.0.2.255'],       // TEST-NET-1
    ['192.168.0.0',     '192.168.255.255'],   // RFC 1918
    ['198.18.0.0',      '198.19.255.255'],    // benchmarking
    ['198.51.100.0',    '198.51.100.255'],    // TEST-NET-2
    ['203.0.113.0',     '203.0.113.255'],     // TEST-NET-3
    ['224.0.0.0',       '239.255.255.255'],   // multicast
    ['240.0.0.0',       '255.255.255.255'],   // reserved + broadcast
].map(([start, end]) => [ipv4ToInt(start), ipv4ToInt(end)]);

function ipv4ToInt(ip) {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip) {
    if (!net.isIPv4(ip)) return false;
    const ipInt = ipv4ToInt(ip);
    return PRIVATE_IPV4_RANGES.some(([start, end]) => ipInt >= start && ipInt <= end);
}

function isPrivateIPv6(ip) {
    if (!net.isIPv6(ip)) return false;
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;                 // loopback / unspecified
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;  // ULA fc00::/7
    if (lower.startsWith('fe80:') || lower.startsWith('fe9') ||
        lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
    if (lower.startsWith('ff')) return true;                             // multicast ff00::/8
    if (lower.startsWith('::ffff:')) {
        // IPv4-mapped — extrai e revalida como IPv4
        const v4 = lower.replace(/^::ffff:/, '');
        return isPrivateIPv4(v4);
    }
    return false;
}

function isPrivateIp(ip) {
    return isPrivateIPv4(ip) || isPrivateIPv6(ip);
}

const BLOCKED_HOSTNAMES = new Set([
    'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback',
    'broadcasthost', 'metadata.google.internal', 'metadata',
]);

const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localdomain', '.lan', '.home', '.intranet', '.private'];

async function assertSafeUrl(rawUrl) {
    let parsed;
    try { parsed = new URL(rawUrl); }
    catch { throw new Error('invalid_url'); }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`blocked_scheme:${parsed.protocol}`);
    }

    // Bloqueia credenciais embutidas (http://user:pass@host)
    if (parsed.username || parsed.password) {
        throw new Error('blocked_credentials_in_url');
    }

    // Bloqueia portas suspeitas (SSH, SMTP, Redis, Postgres, etc)
    const port = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
    const BLOCKED_PORTS = new Set([22, 23, 25, 110, 143, 465, 587, 993, 995, 3306, 5432, 6379, 9200, 11211, 27017]);
    if (BLOCKED_PORTS.has(port)) {
        throw new Error(`blocked_port:${port}`);
    }

    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname)) {
        throw new Error(`blocked_hostname:${hostname}`);
    }
    if (BLOCKED_HOSTNAME_SUFFIXES.some(suf => hostname.endsWith(suf))) {
        throw new Error(`blocked_hostname_suffix:${hostname}`);
    }

    // Se hostname já é um IP literal, valida direto
    if (net.isIP(hostname)) {
        if (isPrivateIp(hostname)) throw new Error(`blocked_private_ip:${hostname}`);
        return parsed;
    }

    // Resolve DNS e valida CADA endereço retornado (A e AAAA)
    let addresses;
    try {
        addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch (err) {
        throw new Error(`dns_lookup_failed:${err.code || err.message}`);
    }
    if (!addresses || addresses.length === 0) {
        throw new Error('dns_no_address');
    }
    for (const { address } of addresses) {
        if (isPrivateIp(address)) {
            throw new Error(`blocked_resolved_private_ip:${hostname}->${address}`);
        }
    }
    return parsed;
}

// Fetch seguro: faz redirects manualmente, revalida cada hop com assertSafeUrl,
// limita tamanho de body e timeout. Para uso com URLs controladas por cliente.
async function safeFetch(rawUrl, { method = 'GET', headers = {}, body = null, maxBytes = 2 * 1024 * 1024, timeoutMs = 8000, maxRedirects = 3 } = {}) {
    let currentUrl = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        await assertSafeUrl(currentUrl);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(currentUrl, {
                method, headers, body, signal: controller.signal, redirect: 'manual',
            });
        } finally {
            clearTimeout(timer);
        }
        // Redirect manual: 3xx + Location header
        if (response.status >= 300 && response.status < 400) {
            const loc = response.headers.get('location');
            if (!loc) return response;
            if (hop === maxRedirects) throw new Error('too_many_redirects');
            currentUrl = new URL(loc, currentUrl).toString();
            continue;
        }
        // Lê body com cap de tamanho
        const reader = response.body?.getReader();
        if (!reader) return { response, body: '' };
        let received = 0;
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.length;
            if (received > maxBytes) {
                try { await reader.cancel(); } catch {}
                throw new Error(`body_too_large:${received}`);
            }
            chunks.push(value);
        }
        const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));
        return { response, body: buf, bodyText: () => buf.toString('utf-8') };
    }
    throw new Error('too_many_redirects');
}
// ============================================================================
// FIM SSRF DEFENSE LAYER
// ============================================================================

const FETCH_HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
    'Sec-Fetch-Dest':  'document',
    'Sec-Fetch-Mode':  'navigate',
    'Sec-Fetch-Site':  'none',
    'Upgrade-Insecure-Requests': '1',
};

const BLOCKED_AGENTS = [
    'bot', 'spider', 'crawler', 'scraper',
    'facebookexternalhit', 'facebookcatalog',
    'tiktok', 'bingbot', 'googlebot', 'yandex',
    'curl', 'wget', 'python-requests', 'axios',
    'headlesschrome', 'phantomjs', 'selenium', 'puppeteer',
    'go-http-client', 'java/', 'libwww',
];

const ACTION = {
    OFFER_PAGE:  'offer_page',
    SAFE_PAGE:   'safe_page',
    BOT_BLOCKED: 'bot_blocked',
    GHOST:       'safe_page',
};

const FP_WEIGHTS = {
    webdriver: 40, plugins_zero: 15, canvas_generic: 20,
    webgl_headless: 30, chrome_missing: 10, screen_zero: 5, notification_na: 10,
};

const HEADLESS_RENDERERS = ['swiftshader', 'llvmpipe', 'mesa', 'virtualbox', 'vmware', 'microsoft basic render'];

// ==========================================
// v20: TRAVA 6 — REFERRER x SOURCE MAP
// ==========================================
const SOURCE_REFERERS = {
    tiktok:    ['tiktok.com', 'vm.tiktok.com', 'bytedance.com'],
    meta:      ['facebook.com', 'fb.com', 'l.facebook.com', 'lm.facebook.com', 'fbcdn.net', 'instagram.com', 'l.instagram.com', 'cdninstagram.com'],
    facebook:  ['facebook.com', 'fb.com', 'l.facebook.com', 'lm.facebook.com', 'fbcdn.net'],
    instagram: ['instagram.com', 'l.instagram.com', 'cdninstagram.com'],
    google:    ['google.com', 'google.com.br', 'google.co.uk', 'google.de', 'googleads.g.doubleclick.net', 'googlesyndication.com'],
    youtube:   ['youtube.com', 'youtu.be', 'googlevideo.com'],
    kwai:      ['kwai.com', 'kaimanapp.com'],
    snapchat:  ['snapchat.com', 't.snapchat.com'],
    twitter:   ['twitter.com', 'x.com', 't.co'],
    pinterest: ['pinterest.com', 'pin.it'],
    linkedin:  ['linkedin.com', 'lnkd.in'],
    taboola:   ['taboola.com', 'trc.taboola.com'],
    mgid:      ['mgid.com'],
    outbrain:  ['outbrain.com', 'paid.outbrain.com'],
    bing:      ['bing.com'],
};

// ==========================================
// v20: WRITE BUFFER (Batching) — recalibrado
// ==========================================
// [PR-3c FIX] Bug #1: requeue (unshift) em vez de re-insert por linha + backoff.
// Antes (v20.5): em erro de batch, o código fazia N inserts individuais
// serializados — em outage de Supabase, isso amplificava de 1 falha para N
// falhas + N round-trips. Agora: re-enfileira o batch inteiro pra próxima
// janela e mantém um contador de falhas consecutivas. >5 falhas dispara
// alerta CRITICAL no log (gancho pro PagerDuty/cgwatch).
// ==========================================
class WriteBuffer {
    constructor(tableName, { maxSize = 200, flushIntervalMs = 3000 } = {}) {
        this.tableName = tableName;
        this.buffer = [];
        this.maxSize = maxSize;
        this.flushIntervalMs = flushIntervalMs;
        this.flushing = false;
        this.consecutiveFailures = 0; // [PR-3c FIX] Bug #1: tracker de outage
        this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
    }
    push(record) {
        this.buffer.push(record);
        if (this.buffer.length >= this.maxSize) this.flush();
    }
    async flush() {
        if (this.flushing || this.buffer.length === 0) return;
        this.flushing = true;
        const batch = this.buffer.splice(0, this.buffer.length);
        try {
            const { error } = await supabase.from(this.tableName).insert(batch);
            if (error) {
                // [PR-3c FIX] Bug #1: requeue do batch inteiro (FIFO preservado
                // via unshift) + bump no contador de falhas consecutivas. Em vez
                // de N inserts serializados (v20.5), aguardamos a próxima janela
                // — limita o blast radius de outage do Supabase.
                console.error(`[BUFFER ${this.tableName}] Batch ERRO (${batch.length} rows) — requeue: ${sanitizeLog(error.message)}`);
                this.buffer.unshift(...batch);
                this.consecutiveFailures++;
                if (this.consecutiveFailures > 5) {
                    console.error(`[BUFFER ${this.tableName}] CRITICAL: ${this.consecutiveFailures} falhas consecutivas — possível outage Supabase`);
                }
                return;
            }
            // [PR-3c FIX] Bug #1: batch passou — reseta o contador.
            this.consecutiveFailures = 0;
            console.log(`[BUFFER ${this.tableName}] Flushed ${batch.length} rows`);
        } catch (err) {
            // [PR-3c FIX] Bug #1: mesma estratégia em catch (network/timeout).
            console.error(`[BUFFER ${this.tableName}] Flush FALHOU (${batch.length} rows) — requeue: ${sanitizeLog(err.message)}`);
            this.buffer.unshift(...batch);
            this.consecutiveFailures++;
            if (this.consecutiveFailures > 5) {
                console.error(`[BUFFER ${this.tableName}] CRITICAL: ${this.consecutiveFailures} falhas consecutivas — possível outage Supabase`);
            }
        }
        finally { this.flushing = false; }
    }
    get pending() { return this.buffer.length; }
    async shutdown() { clearInterval(this.timer); await this.flush(); }
}

const requestsLogBuffer    = new WriteBuffer('requests_log',    { maxSize: 200, flushIntervalMs: 3000 });
const fingerprintLogBuffer = new WriteBuffer('fingerprint_log', { maxSize: 100, flushIntervalMs: 5000 });

// [PR-3c FIX] Bug #5: handlers SIGTERM/SIGINT antigos REMOVIDOS daqui.
// O shutdown unificado (gracefulShutdown) está registrado no final do arquivo,
// depois das declarações de monitorInterval e cfSyncInterval, pra que o
// clearInterval consiga referenciar os timers corretos antes do flush.

// ==========================================
// v20: CACHES EM MEMORIA — recalibrados para 8GB VPS / 500k dia
// ==========================================
const ipMemoryCache = new LRUCache({ max: 200000, ttl: IP_CACHE_TTL_MS, updateAgeOnGet: false, allowStale: false });
const clickDeduplicationCache = new LRUCache({ max: 100000, ttl: 10 * 60 * 1000, updateAgeOnGet: false, updateAgeOnHas: false, allowStale: false });
const campaignCache = new LRUCache({ max: 5000, ttl: 5 * 60 * 1000, updateAgeOnGet: true, allowStale: false });
const uniqueCheckCache = new LRUCache({ max: 500000, ttl: 24 * 60 * 60 * 1000, updateAgeOnGet: false, allowStale: false });

const getFromMemoryCache = (ip) => ipMemoryCache.get(ip) || null;
const setInMemoryCache = (ip, isThreat, reason, riskScore = 0) => { ipMemoryCache.set(ip, { isThreat, reason, riskScore }); };

// ==========================================
// CF-IP VALIDATION (v18.2)
// ==========================================
const cidrToRange = (cidr) => {
    const [ip, bits] = cidr.split('/');
    const parts = ip.split('.').map(Number);
    const base = (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
    const prefixLen = parseInt(bits);
    const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
    return [(base & mask) >>> 0, ((base & mask) | (~mask >>> 0)) >>> 0];
};

const CF_IPV4_CIDRS = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22',
    '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
    '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22',
    '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
].map(cidrToRange);

const CF_IPV6_PREFIXES = ['2400:cb00:', '2606:4700:', '2803:f800:', '2405:b500:', '2405:8100:', '2a06:98c0:', '2c0f:f248:'];

const isCloudflareIP = (remoteAddr) => {
    if (!remoteAddr) return false;
    const addr = remoteAddr.replace(/^::ffff:/, '').toLowerCase();
    if (addr === '127.0.0.1' || addr === '::1' || addr === 'localhost') return true;
    if (addr.includes(':')) return CF_IPV6_PREFIXES.some(prefix => addr.startsWith(prefix));
    const parts = addr.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
    const ipInt = (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
    return CF_IPV4_CIDRS.some(([start, end]) => ipInt >= start && ipInt <= end);
};

// S-04: validação de formato do cf-connecting-ip antes de qualquer uso
const isValidPublicIp = (ip) => {
    if (!ip || typeof ip !== 'string') return false;
    if (!net.isIP(ip)) return false;
    if (isPrivateIp(ip)) return false;
    return true;
};

// ==========================================
// DEDUPLICACAO v17.1 — LRU Cache + Lock Pattern
// ==========================================
const buildDedupKey = (ip, clickId) => `${ip}@${clickId}`;

const tryAcquireDedupLock = (ip, clickId) => {
    const key = buildDedupKey(ip, clickId);
    if (clickDeduplicationCache.has(key)) {
        const entry = clickDeduplicationCache.get(key);
        if (entry?.processing === true) return { acquired: false, isDuplicate: true };
    }
    clickDeduplicationCache.set(key, { ip, click_id: clickId, locked_at: Date.now(), processing: true, duplicate_count: 0 });
    return { acquired: true, isDuplicate: false };
};

const releaseDedupLock = (ip, clickId) => {
    const key = buildDedupKey(ip, clickId);
    const entry = clickDeduplicationCache.get(key);
    if (entry) { entry.processing = false; entry.processed_at = Date.now(); }
};

const incrementDuplicateCount = (ip, clickId) => {
    const key = buildDedupKey(ip, clickId);
    const entry = clickDeduplicationCache.get(key);
    if (entry) entry.duplicate_count++;
};

// ==========================================
// v19.2: SHADOW METRICS (contadores leves)
// ==========================================
const incrementShadowStat = (campaign_id, statName) => {
    if (!campaign_id) return;
    const today = new Date().toISOString().split('T')[0];
    const params = {
        p_campaign_id: campaign_id, p_date: today,
        p_clicks_total: 0, p_clicks_unique: 0, p_clicks_approved: 0, p_clicks_blocked: 0, p_cost_total: 0,
        p_dedup_clicks: statName === 'dedup' ? 1 : 0,
        p_prefetch_clicks: statName === 'prefetch' ? 1 : 0,
        p_ghost_clicks: statName === 'ghost' ? 1 : 0,
    };
    supabase.from('campaign_stats').upsert({ campaign_id, date: today }, { onConflict: 'campaign_id,date', ignoreDuplicates: true })
        .then(() => supabase.rpc('increment_campaign_stats', params))
        .then(({ error }) => { if (error) console.error(`[SHADOW ${statName.toUpperCase()}] ${sanitizeLog(error.message)}`); })
        .catch(() => {});
};

// ==========================================
// TRAVA 4 (v17.2): ONE-TIME-ID ABSOLUTO — 7 DIAS
// ==========================================
const checkOneTimeClick = async (clickId, userId) => {
    if (!clickId || !userId) return { isNewClick: true, fraudDetected: false };
    try {
        const now = new Date().toISOString();
        const { data: existing, error } = await withTimeout(
            supabase.from('one_time_clicks').select('id, fraud_attempts').eq('click_id', clickId).gt('expires_at', now).single(), 2000
        );
        if (error?.code === 'PGRST116') return { isNewClick: true, fraudDetected: false };
        if (error) { console.warn(`[TRAVA 4 ERRO] ${sanitizeLog(error.message)}`); return { isNewClick: true, fraudDetected: false }; }
        if (existing) {
            console.log(`[TRAVA 4] REUTILIZACAO DE CLICK_ID! ID: ${sanitizeLog(clickId)} | tentativa: ${existing.fraud_attempts + 1}`);
            return { isNewClick: false, fraudDetected: true };
        }
        return { isNewClick: true, fraudDetected: false };
    } catch (err) { console.error(`[TRAVA 4 FALHOU] ${sanitizeLog(err.message)}`); return { isNewClick: true, fraudDetected: false }; }
};

const recordOneTimeClick = async (clickId, userId, campaignId, ip, userAgent, device, country) => {
    try {
        await withTimeout(supabase.from('one_time_clicks').insert({
            click_id: clickId, user_id: userId, first_campaign_id: campaignId,
            first_ip: ip, first_user_agent: userAgent, first_device: device, first_country: country,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }), 2000);
        console.log(`[TRAVA 4] Click_ID registrado (7 dias) | ID: ${sanitizeLog(clickId)}`);
    } catch (err) { console.warn(`[TRAVA 4 RECORD ERRO] ${sanitizeLog(err.message)}`); }
};

// ==========================================
// TRAVA 5 (v17.2): SMART IP-BINDING — ATE 2 IPs
// ==========================================
const checkSmartIpBinding = async (clickId, userId, ip, userAgent, device) => {
    if (!clickId || !ip || !userAgent || !device) return { allowed: true, reason: null };
    try {
        const now = new Date().toISOString();
        const { data: binding, error } = await withTimeout(
            supabase.from('click_id_bindings').select('first_ip, first_user_agent, first_device, ip_history, blocked, block_reason')
                .eq('click_id', clickId).gt('expires_at', now).single(), 2000
        );
        if (error?.code === 'PGRST116') return { allowed: true, reason: null };
        if (error) { console.warn(`[TRAVA 5 ERRO] ${sanitizeLog(error.message)}`); return { allowed: true, reason: null }; }
        if (binding?.blocked) { console.log(`[TRAVA 5] BLOQUEADO | ID: ${sanitizeLog(clickId)} | motivo: ${sanitizeLog(binding.block_reason)}`); return { allowed: false, reason: binding.block_reason }; }
        const firstIp = binding.first_ip, firstUa = binding.first_user_agent, firstDevice = binding.first_device;
        let ipHistory = [];
        try { ipHistory = binding.ip_history ? JSON.parse(binding.ip_history) : []; } catch {}
        const isSameIp = ip === firstIp, isSameUa = userAgent === firstUa, isSameDevice = device === firstDevice;
        if (isSameIp && isSameUa && isSameDevice) return { allowed: true, reason: null };
        if (!isSameIp && isSameUa && isSameDevice) {
            const uniqueIps = new Set([firstIp, ...ipHistory.map(h => typeof h === 'string' ? h : h.ip)]).size;
            if (uniqueIps <= 2) return { allowed: true, reason: null };
            else { console.log(`[TRAVA 5] BLOQUEADO: 3+ IPs | ID: ${sanitizeLog(clickId)}`); return { allowed: false, reason: 'too_many_ips' }; }
        }
        if (!isSameUa || !isSameDevice) { console.log(`[TRAVA 5] BLOQUEADO: UA/Device mudou | ID: ${sanitizeLog(clickId)}`); return { allowed: false, reason: 'ua_or_device_changed' }; }
        return { allowed: true, reason: null };
    } catch (err) { console.error(`[TRAVA 5 FALHOU] ${sanitizeLog(err.message)}`); return { allowed: true, reason: null }; }
};

const recordSmartIpBinding = async (clickId, userId, campaignId, ip, userAgent, device) => {
    try {
        const now = new Date().toISOString();
        const { data: existing } = await withTimeout(
            supabase.from('click_id_bindings').select('access_count, ip_history').eq('click_id', clickId).gt('expires_at', now).single(), 2000
        ).catch(() => ({ data: null }));
        if (existing) {
            let ipHistory = [];
            try { ipHistory = JSON.parse(existing.ip_history || '[]'); } catch {}
            ipHistory.push({ ip, user_agent: userAgent, device, timestamp: new Date().toISOString() });
            await withTimeout(supabase.from('click_id_bindings').update({ access_count: existing.access_count + 1, ip_history: JSON.stringify(ipHistory), last_access: now }).eq('click_id', clickId), 2000);
        } else {
            await withTimeout(supabase.from('click_id_bindings').insert({
                click_id: clickId, user_id: userId, campaign_id: campaignId,
                first_ip: ip, first_user_agent: userAgent, first_device: device,
                ip_history: JSON.stringify([{ ip, user_agent: userAgent, device, timestamp: new Date().toISOString() }]),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            }), 2000);
        }
    } catch (err) { console.warn(`[TRAVA 5 RECORD ERRO] ${sanitizeLog(err.message)}`); }
};

// ==========================================
// HELPERS
// ==========================================
const sanitizeLog = (str) => String(str ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 200);
const detectDevice = (ua) => { if (/mobile|iphone|ipod|android|blackberry/i.test(ua)) return 'mobile'; if (/tablet|ipad/i.test(ua)) return 'tablet'; return 'desktop'; };
const withTimeout = (promise, ms = 3000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))]);
const isValidUrl = (urlString) => { if (!urlString) return false; try { const { protocol } = new URL(urlString); return protocol === 'http:' || protocol === 'https:'; } catch { return false; } };

// ==========================================
// v20: TRAVA 6 — REFERRER x SOURCE VALIDATION
// ==========================================
const checkRefererSource = (referer, sourcePlatform, device) => {
    if (!referer) {
        if (device === 'mobile' || device === 'tablet') return { score: 0, flag: null };
        return { score: 0, flag: null };
    }
    const expectedReferers = SOURCE_REFERERS[sourcePlatform];
    if (!expectedReferers) return { score: 0, flag: null };
    const refLower = referer.toLowerCase();
    const matches = expectedReferers.some(r => refLower.includes(r));
    if (!matches) {
        console.log(`[TRAVA 6] Referer mismatch | source: ${sanitizeLog(sourcePlatform)} | referer: ${sanitizeLog(refLower.slice(0, 60))}`);
        return { score: 25, flag: `referer_mismatch:${sourcePlatform}` };
    }
    return { score: 0, flag: null };
};

// ==========================================
// v20: TRAVA 7 — ACCEPT-LANGUAGE SCORING
// ==========================================
const checkAcceptLanguage = (acceptLang, country) => {
    if (!acceptLang || acceptLang.trim() === '') {
        return { score: 15, flag: 'accept_lang:empty' };
    }
    const langLower = acceptLang.toLowerCase();
    const countryLangMap = {
        BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt',
        US: 'en', GB: 'en', AU: 'en', CA: 'en', NZ: 'en', IE: 'en',
        ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es',
        FR: 'fr', BE: 'fr', CH: 'fr',
        DE: 'de', AT: 'de',
        IT: 'it', JP: 'ja', KR: 'ko',
        CN: 'zh', TW: 'zh', HK: 'zh',
        RU: 'ru', UA: 'ru', TR: 'tr',
        SA: 'ar', AE: 'ar', EG: 'ar',
        TH: 'th', VN: 'vi', ID: 'id', PL: 'pl', NL: 'nl',
        SE: 'sv', NO: 'no', DK: 'da', FI: 'fi', CZ: 'cs', RO: 'ro', HU: 'hu',
    };
    const expectedLang = countryLangMap[country];
    if (expectedLang && !langLower.includes(expectedLang)) {
        return { score: 10, flag: `accept_lang:mismatch:expected_${expectedLang}` };
    }
    return { score: 0, flag: null };
};

// ==========================================
// v20: TRAVA 9 — CLIENT HINTS (sec-ch-ua)
// ==========================================
const checkClientHints = (req, userAgent) => {
    const isChromiumUA = /chrome|chromium/i.test(userAgent) && !/edg/i.test(userAgent);
    if (!isChromiumUA) return { score: 0, flags: [] };
    const flags = [];
    let score = 0;
    const secChUa = req.get('sec-ch-ua');
    const secChUaMobile = req.get('sec-ch-ua-mobile');
    const secChUaPlatform = req.get('sec-ch-ua-platform');
    if (!secChUa) { score += 15; flags.push('client_hints:sec-ch-ua_missing'); }
    if (!secChUaMobile) { score += 5; flags.push('client_hints:sec-ch-ua-mobile_missing'); }
    if (!secChUaPlatform) { score += 5; flags.push('client_hints:sec-ch-ua-platform_missing'); }
    if (score > 0) console.log(`[TRAVA 9] Client Hints ausentes | score: +${score} | flags: ${flags.join(', ')}`);
    return { score, flags };
};

// ==========================================
// v18.1: DYNAMIC PARAMETER FORWARDING
// ==========================================
const buildEnrichedOfferUrl = (offerUrl, query) => {
    if (!query || Object.keys(query).length === 0) return offerUrl;
    try { const urlObj = new URL(offerUrl); for (const [key, value] of Object.entries(query)) { urlObj.searchParams.set(key, String(value)); } return urlObj.toString(); }
    catch (err) { console.warn(`[PARAM FORWARD] URL parse falhou: ${sanitizeLog(err.message)}`); return offerUrl; }
};

// ==========================================
// UNIQUETOKEN — geracao e consumo
// ==========================================
const createSessionToken = async ({ campaign_id, user_id, offer_url, offer_page_method, ip }) => {
    try {
        const token = randomUUID();
        const expiresAt = new Date(Date.now() + SESSION_TOKEN_TTL_MS);
        const { error } = await withTimeout(supabase.from('session_tokens').insert({
            token, campaign_id, user_id, offer_url, offer_page_method: offer_page_method || 'redirect',
            ip_address: ip, used: false, expires_at: expiresAt, created_at: new Date(),
        }), 2000);
        if (error) { console.error('[TOKEN CRIAR ERRO]', sanitizeLog(error.message)); return null; }
        return token;
    } catch (err) { console.error('[TOKEN CRIAR FALHOU]', sanitizeLog(err.message)); return null; }
};

// [PR-3c FIX] Bug #2: consumo atômico via UPDATE...WHERE used=false RETURNING.
// Antes (v20.5): SELECT-then-UPDATE deixava uma janela de race entre 2 requests
// concomitantes — ambos viam used=false no SELECT e ambos faziam UPDATE, com
// a oferta sendo entregue duas vezes pro mesmo session token. O UPDATE com
// .eq('used', false) no WHERE é a checagem atômica do Postgres: só uma das
// queries vai retornar rows (a outra retorna data=null, falhando silenciosamente
// pro consumidor B, que cai no SAFE_FALLBACK_URL — comportamento desejado).
const consumeSessionToken = async (token) => {
    try {
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(token)) return null;
        const { data, error } = await withTimeout(
            supabase.from('session_tokens')
                .update({ used: true })
                .eq('token', token)
                .eq('used', false)
                .gt('expires_at', new Date().toISOString())
                .select('offer_url, offer_page_method')
                .single(),
            2000
        );
        if (error || !data) return null;
        return { offer_url: data.offer_url, offer_page_method: data.offer_page_method || 'redirect' };
    } catch (err) { console.error('[TOKEN CONSUMIR FALHOU]', sanitizeLog(err.message)); return null; }
};

// ==========================================
// v19: FINGERPRINT TOKEN — geracao e consumo
// ==========================================
const createFingerprintToken = async ({ campaign_id, user_id, offer_url, offer_page_method, safe_url, ip, user_agent, device, country, click_id, risk_score, tracking, hostClean }) => {
    try {
        const token = randomUUID();
        const expiresAt = new Date(Date.now() + FP_TOKEN_TTL_MS);
        const { error } = await withTimeout(supabase.from('fingerprint_tokens').insert({
            token, campaign_id, user_id, offer_url, offer_page_method: offer_page_method || 'redirect',
            safe_url: safe_url || SAFE_FALLBACK_URL, ip_address: ip, user_agent, device, country, click_id,
            risk_score: risk_score || 0, tracking_data: tracking ? JSON.stringify(tracking) : null,
            consumed: false, expires_at: expiresAt,
        }), 2000);
        if (error) { console.error('[FP TOKEN CRIAR ERRO]', sanitizeLog(error.message)); return null; }
        console.log(`[TRAVA 8] FP token criado | TTL: ${FP_TOKEN_TTL_MS/1000}s | IP: ${sanitizeLog(ip)}`);
        return token;
    } catch (err) { console.error('[FP TOKEN CRIAR FALHOU]', sanitizeLog(err.message)); return null; }
};

// [PR-3c FIX] Bug #2: mesma correção do consumeSessionToken — UPDATE atômico
// em fingerprint_tokens. Race aqui era pior: token de FP tem TTL de 30s e é
// consumido pelo /fp imediatamente após o usuário renderizar a página JS.
// Em redes ruins, retry do XHR pode disparar 2 requests com o mesmo token —
// SELECT-then-UPDATE permitiria ambos passarem o gate. Agora só um vence.
const consumeFingerprintToken = async (token) => {
    try {
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(token)) return null;
        const { data, error } = await withTimeout(
            supabase.from('fingerprint_tokens')
                .update({ consumed: true, consumed_at: new Date().toISOString() })
                .eq('token', token)
                .eq('consumed', false)
                .gt('expires_at', new Date().toISOString())
                .select('*')
                .single(),
            2000
        );
        if (error || !data) return null;
        return data;
    } catch (err) { console.error('[FP TOKEN CONSUMIR FALHOU]', sanitizeLog(err.message)); return null; }
};

// ==========================================
// v19: FINGERPRINT ANALYSIS
// ==========================================
const analyzeFingerprintSignals = (signals, device) => {
    let score = 0;
    const flags = [];
    const isMobile = device === 'mobile' || device === 'tablet';
    if (signals.webdriver === true) { score += FP_WEIGHTS.webdriver; flags.push('webdriver:true'); }
    if (!isMobile && signals.plugins === 0) { score += FP_WEIGHTS.plugins_zero; flags.push('plugins:0'); }
    if (signals.canvas === '' || signals.canvas === '0' || signals.canvas === null) { score += FP_WEIGHTS.canvas_generic; flags.push('canvas:generic'); }
    if (signals.webgl) { const renderer = String(signals.webgl).toLowerCase(); if (HEADLESS_RENDERERS.some(h => renderer.includes(h))) { score += FP_WEIGHTS.webgl_headless; flags.push(`webgl:${renderer.slice(0, 40)}`); } }
    if (!isMobile && signals.chrome === false && signals.ua_chrome === true) { score += FP_WEIGHTS.chrome_missing; flags.push('chrome:missing'); }
    if (signals.screen_w === 0 || signals.screen_h === 0) { score += FP_WEIGHTS.screen_zero; flags.push('screen:zero'); }
    if (!isMobile && signals.notification === 'unsupported') { score += FP_WEIGHTS.notification_na; flags.push('notification:unsupported'); }
    const result = score >= FP_SCORE_THRESHOLD ? 'bot' : 'human';
    console.log(`[TRAVA 8 SCORE] ${score}/${FP_SCORE_THRESHOLD} -> ${result} | device: ${device} | flags: ${flags.join(', ') || 'none'}`);
    return { score, result, flags };
};

const logFingerprintResult = (campaignId, ip, device, score, result, signals) => {
    fingerprintLogBuffer.push({ campaign_id: campaignId, ip_address: ip, device, fp_score: score, fp_result: result, signals });
};

// ==========================================
// v19: PAGINA INTERMEDIARIA DE FINGERPRINT
// ==========================================
const buildFingerprintPage = (fpToken, fallbackUrl) => {
    const safeUrl = fallbackUrl.replace(/"/g, '\\"');
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0}body{background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui}
.ld{width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#6b7280;border-radius:50%;animation:s .6s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}</style></head>
<body><div class="ld"></div>
<script>
(function(){
var T="${fpToken}",F="${safeUrl}";
var d=document,n=navigator,w=window,s=screen;
try{
var cv="",ce=d.createElement("canvas"),cx=ce.getContext("2d");
if(cx){ce.width=64;ce.height=16;cx.font="12px Arial";cx.fillText("CG",2,12);
cx.fillStyle="rgba(100,200,50,.7)";cx.fillRect(10,0,40,16);
try{cv=ce.toDataURL().slice(-32)}catch(e){cv=""}}
var gl="",gc=d.createElement("canvas").getContext("webgl");
if(gc){var di=gc.getExtension("WEBGL_debug_renderer_info");
if(di)gl=gc.getParameter(di.UNMASKED_RENDERER_WEBGL)||""}
var sg={
webdriver:!!n.webdriver,
plugins:n.plugins?n.plugins.length:-1,
canvas:cv,
webgl:gl,
chrome:!!w.chrome,
ua_chrome:/chrome/i.test(n.userAgent)&&!/edg/i.test(n.userAgent),
screen_w:s.width||0,
screen_h:s.height||0,
notification:typeof Notification!=="undefined"?(Notification.permission||"default"):"unsupported",
touch:"ontouchstart"in w||n.maxTouchPoints>0,
lang:n.language||"",
hw:n.hardwareConcurrency||0,
mem:n.deviceMemory||0,
ts:Date.now()
};
var x=new XMLHttpRequest();
x.open("POST","/fp",true);
x.setRequestHeader("Content-Type","application/json");
x.timeout=4000;
x.onload=function(){
try{var r=JSON.parse(x.responseText);
if(r&&r.url)w.location.replace(r.url);
else w.location.replace(F)}catch(e){w.location.replace(F)}};
x.onerror=x.ontimeout=function(){w.location.replace(F)};
x.send(JSON.stringify({t:T,s:sg}));
}catch(e){w.location.replace(F)}
})();
</script></body></html>`;
};

// ==========================================
// WEBHOOK POSTBACK OUTBOUND (v15) — S-01 PATCHED
// ==========================================
const buildPostbackUrl = (template, values) => {
    return template.replace(/{click_id}/g, encodeURIComponent(values.click_id || ''))
        .replace(/{campaign_id}/g, encodeURIComponent(values.campaign_id || ''))
        .replace(/{ip}/g, encodeURIComponent(values.ip || ''))
        .replace(/{country}/g, encodeURIComponent(values.country || ''))
        .replace(/{device}/g, encodeURIComponent(values.device || ''))
        .replace(/{cost}/g, encodeURIComponent(values.cost || '0'))
        .replace(/{timestamp}/g, String(Math.floor(Date.now() / 1000)));
};

const firePostback = async (campaign, tracking, { ip, country, device }) => {
    const { postback_url, postback_method } = campaign;
    if (!postback_url || !isValidUrl(postback_url)) return;
    const method = (postback_method || 'GET').toUpperCase();
    const values = { click_id: tracking?.click_id || '', campaign_id: campaign.id || '', ip: ip || '', country: country || '', device: device || '', cost: String(tracking?.cost || '0') };
    const finalUrl = buildPostbackUrl(postback_url, values);

    // S-01: pré-validação SSRF antes de qualquer attempt
    try {
        await assertSafeUrl(finalUrl);
    } catch (err) {
        console.error(`[POSTBACK BLOCKED] SSRF guard rejected URL | campaign: ${sanitizeLog(campaign.id)} | reason: ${sanitizeLog(err.message)}`);
        return;
    }

    const attempt = async (isRetry = false) => {
        try {
            const headers = { 'User-Agent': 'CloakGuard-Postback/1.0', 'Content-Type': 'application/json' };
            const body = method === 'POST' ? JSON.stringify({ ...values, timestamp: Math.floor(Date.now() / 1000) }) : null;
            // safeFetch faz redirect manual com revalidação a cada hop, cap de 1MB e timeout 5s
            const result = await safeFetch(finalUrl, {
                method, headers, body, maxBytes: 1024 * 1024, timeoutMs: 5000, maxRedirects: 2,
            });
            const status = result.response?.status ?? 0;
            if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
            console.log(`[POSTBACK ${method}] ${isRetry ? 'RETRY ' : ''}OK -> ${sanitizeLog(finalUrl)}`);
        } catch (err) {
            if (!isRetry) { console.warn(`[POSTBACK FALHOU] retry em 2s -> ${sanitizeLog(err.message)}`); setTimeout(() => attempt(true), 2000); }
            else { console.error(`[POSTBACK ERRO FINAL] ${sanitizeLog(err.message)}`); }
        }
    };
    attempt();
};

// ==========================================
// CLICK TRACKER
// ==========================================
const extractTrackingParams = (query) => {
    let platform = 'organic';
    if (query.ttclid || query.click_id?.startsWith('tt')) platform = 'tiktok';
    else if (query.fbclid || query.click_id?.startsWith('fb')) platform = 'facebook';
    else if (query.gclid) platform = 'google';
    else if (query.utm_source) platform = query.utm_source.toLowerCase();
    const click_id = query.click_id || query.ttclid || query.fbclid || query.gclid || null;
    const rawCost = parseFloat(query.cost);
    const cost = (!isNaN(rawCost) && rawCost >= 0) ? rawCost : null;
    return { click_id, campaign_name_platform: query.campaign || query.utm_campaign || null, adset_name: query.adset || query.utm_medium || null, ad_id: query.ad_id || query.utm_content || null, placement: query.placement || query.src || null, cost, source_platform: platform };
};

// ──────────────────────────────────────────────────────────────────────────
// v20.5 — checkIsUnique DB-BACKED (rolling 24h) + PR-3b.4 (UA-in-key)
// ──────────────────────────────────────────────────────────────────────────
// Estratégia:
//   1) LRU (uniqueCheckCache) vira HOT CACHE — se já vimos (ip, ua, campaign)
//      neste processo, responde instantâneo sem bater no banco.
//   2) Se LRU miss, consulta requests_log pelos últimos 24h. A query usa
//      o índice composto idx_requests_log_campaign_ip_ua_created
//      (campaign_id, ip_address, user_agent, created_at DESC) — O(log n),
//      tipicamente < 10ms.
//      ⚠️ PR-3b.4: chave passou a incluir UA. Sem o índice composto novo,
//      a query degrada para Index Scan + Filter conforme requests_log cresce.
//      Migration obrigatória antes do deploy:
//        CREATE INDEX CONCURRENTLY IF NOT EXISTS
//          idx_requests_log_campaign_ip_ua_created
//          ON requests_log (campaign_id, ip_address, user_agent, created_at DESC);
//   3) Se DB confirma que não existe prior click → is_unique = true, cacheia.
//      Caso contrário → is_unique = false, cacheia (evita segunda query).
//   4) Fallback defensivo: se o DB der timeout ou erro, assume is_unique=true
//      (comportamento menos destrutivo — pior caso é um over-count pequeno).
//
// [PR-3c FIX] Bug #3: NÃO cacheia em caminho de erro do DB.
//   Antes (v20.5): erro do Supabase setava `uniqueCheckCache.set(key, true)`
//   por 24h — quando o DB voltava ao normal, o cache ainda dizia "já vimos"
//   e o is_unique nunca retornava true pra essa tupla até o TTL estourar.
//   Agora: em erro/timeout, retorna true (decisão otimista) mas NÃO persiste
//   no LRU. Próxima request pra mesma chave tenta o DB de novo. Pior caso:
//   over-count temporário enquanto o DB está degradado — aceitável, é melhor
//   que under-count permanente.
// ──────────────────────────────────────────────────────────────────────────
const UNIQUE_WINDOW_MS = 24 * 60 * 60 * 1000;
const UNIQUE_DB_TIMEOUT_MS = 1500;

const checkIsUnique = async (ip, user_agent, campaign_id) => {
    // PR-3b.4 (Bug A): chave inclui UA. NAT/CGNAT/escritório com UAs distintos
    // não colapsam mais em "1 único" por IP. Pipe `|` evita colisão de chave
    // caso UA contenha ":" (raro, mas possível).
    const key = `${ip}|${user_agent || ''}|${campaign_id}`;
    if (uniqueCheckCache.has(key)) return false;

    try {
        const since = new Date(Date.now() - UNIQUE_WINDOW_MS).toISOString();
        const { data, error } = await withTimeout(
            supabase.from('requests_log')
                .select('id')
                .eq('campaign_id', campaign_id)
                .eq('ip_address', ip)
                .eq('user_agent', user_agent)   // ← PR-3b.4: filtro por UA no DB
                .gte('created_at', since)
                .limit(1)
                .maybeSingle(),
            UNIQUE_DB_TIMEOUT_MS
        );
        if (error) {
            // [PR-3c FIX] Bug #3: NÃO cacheia em erro — permite retry quando DB volta.
            console.error('[UNIQUE CHECK ERRO]', sanitizeLog(error.message));
            return true;
        }
        const isUnique = !data;
        uniqueCheckCache.set(key, true);
        return isUnique;
    } catch (err) {
        // [PR-3c FIX] Bug #3: NÃO cacheia em timeout/exceção — mesmo motivo.
        console.error('[UNIQUE CHECK FALHOU]', sanitizeLog(err.message));
        return true;
    }
};

const updateCampaignStats = async (campaign_id, { action, cost, is_unique }) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        await withTimeout(supabase.from('campaign_stats').upsert({ campaign_id, date: today }, { onConflict: 'campaign_id,date', ignoreDuplicates: true }), 2000);
        const { error } = await withTimeout(supabase.rpc('increment_campaign_stats', {
            p_campaign_id: campaign_id, p_date: today, p_clicks_total: 1, p_clicks_unique: is_unique ? 1 : 0,
            // [PR-3c FIX] Bug #4: ?? 0 (em vez de || 0) preserva cost=0 legítimo no payload,
            // consistente com a higienização do PR-3b.4 em logEvent + /fp.
            p_clicks_approved: action === ACTION.OFFER_PAGE ? 1 : 0, p_clicks_blocked: action === ACTION.BOT_BLOCKED ? 1 : 0, p_cost_total: cost ?? 0,
            p_dedup_clicks: 0, p_prefetch_clicks: 0, p_ghost_clicks: 0,
        }), 3000);
        if (error) console.error('[STATS ERRO]', sanitizeLog(error.message));
    } catch (err) { console.error('[STATS FALHOU]', sanitizeLog(err.message)); }
};

// ==========================================
// CONTENT FETCH (masking) — S-01/S-02/S-03 PATCHED
// ==========================================
const fetchAndServe = async (res, targetUrl) => {
    try {
        // S-01: pré-validação SSRF
        await assertSafeUrl(targetUrl);
        // S-02: cap de 2MB no body via safeFetch
        const result = await safeFetch(targetUrl, {
            headers: FETCH_HEADERS, maxBytes: 2 * 1024 * 1024, timeoutMs: 8000, maxRedirects: 3,
        });
        const contentType = result.response.headers.get('content-type') || 'text/html';
        let body = result.bodyText();
        if (contentType.includes('text/html')) {
            try {
                const origin = new URL(targetUrl).origin;
                const baseTag = `<base href="${origin}/">`;
                if (/<head[\s>]/i.test(body)) body = body.replace(/(<head[\s>][^>]*>)/i, `$1${baseTag}`);
                else if (/<html[\s>]/i.test(body)) body = body.replace(/(<html[\s>][^>]*>)/i, `$1<head>${baseTag}</head>`);
                else body = baseTag + body;
            } catch {}
        }
        res.setHeader('Content-Type', contentType);
        return res.status(200).send(body);
    } catch (err) {
        // S-03: NUNCA redireciona para targetUrl no catch — sempre fallback seguro
        console.error(`[CONTENT FETCH ERRO] ${sanitizeLog(err.message)} | url: ${sanitizeLog(targetUrl)}`);
        return res.redirect(302, SAFE_FALLBACK_URL);
    }
};

// ==========================================
// LOG E BLACKLIST — v19.3: logEvent usa buffer
// ==========================================
const logEvent = ({ campaign_id, user_id, ip, user_agent, action, reason, country, device, tracking, riskScore }) => {
    requestsLogBuffer.push({
        campaign_id, user_id, ip_address: ip, user_agent, action_taken: action,
        block_reason: reason || null, device_type: device || detectDevice(user_agent),
        country_code: country || null, created_at: new Date(),
        click_id: tracking?.click_id || null, campaign_name_platform: tracking?.campaign_name_platform || null,
        adset_name: tracking?.adset_name || null, ad_id: tracking?.ad_id || null,
        // PR-3b.4 (varredura): ?? preserva 0 legítimo; || convertia 0 em null/0.
        // - cost=0 (campanha orgânica/sem custo) ia pra null, somando errado em ROI.
        // - risk_score=0 (limpo, passou todas travas) virava null, sumindo do dashboard.
        // - is_unique como Boolean() é mais explícito que `|| false`.
        placement: tracking?.placement || null, cost: tracking?.cost ?? null,
        source_platform: tracking?.source_platform || null, is_unique: Boolean(tracking?.is_unique),
        risk_score: riskScore ?? 0,
    });
};

const blockIpPermanently = (ip, reason, user_id, isGlobal = false) => {
    if (!user_id) return;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    supabase.from('blocked_ips').upsert({ ip_address: ip, reason, user_id, expires_at: expiresAt, created_at: new Date(), is_global: isGlobal }, { onConflict: 'ip_address' })
        .then(({ error }) => { if (error) console.error('[ERRO AO BLOQUEAR IP]', sanitizeLog(error.message)); });
};

// ==========================================
// VERIFICACAO DE IP
// ==========================================
const checkIPInfo = async (ip) => {
    // S-04 defesa: garante formato de IP antes de injetar na URL
    if (!net.isIP(ip)) throw new Error('invalid_ip_format');
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}?token=${process.env.IPINFO_TOKEN}`);
    if (!res.ok) throw new Error(`IPinfo HTTP ${res.status}`);
    const data = await res.json();
    if (data.bogon) return { isThreat: true, reason: 'bogon_ip', riskScore: 100 };
    const org = (data.org || '').toLowerCase();
    const datacenterKeywords = ['amazon', 'google', 'microsoft', 'digitalocean', 'linode', 'vultr', 'hetzner', 'ovh', 'datacenter', 'hosting', 'colocation', 'server'];
    if (datacenterKeywords.some(k => org.includes(k))) return { isThreat: true, reason: `datacenter:${data.org}`, riskScore: 90 };
    return { isThreat: false, reason: null, riskScore: 0 };
};

const checkProxycheck = async (ip) => {
    if (!net.isIP(ip)) throw new Error('invalid_ip_format');
    const res = await fetch(`https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${process.env.PROXYCHECK_KEY}&vpn=1&risk=1`);
    if (!res.ok) throw new Error(`Proxycheck HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(`Proxycheck status: ${data.status}`);
    const result = data[ip];
    if (!result) throw new Error('Proxycheck: resposta vazia');
    if (result.proxy === 'yes') return { isThreat: true, reason: `proxy:${result.type || 'unknown'}:risk${result.risk || 0}`, riskScore: result.risk || 100 };
    if ((result.risk || 0) >= 66) return { isThreat: true, reason: `high_risk:${result.risk}`, riskScore: result.risk };
    return { isThreat: false, reason: null, riskScore: result.risk || 0 };
};

const checkIp = async (ip, userId = null) => {
    // S-05: refatorado para evitar concatenação no .or()
    try {
        // Query 1: blacklist global
        const { data: globalBlock } = await withTimeout(
            supabase.from('blocked_ips').select('reason, expires_at, is_global')
                .eq('ip_address', ip).eq('is_global', true).limit(1).maybeSingle(), 2000);

        // Query 2: blacklist do usuário (se userId presente)
        let userBlock = null;
        if (userId) {
            const { data } = await withTimeout(
                supabase.from('blocked_ips').select('reason, expires_at, is_global')
                    .eq('ip_address', ip).eq('user_id', userId).limit(1).maybeSingle(), 2000);
            userBlock = data;
        }

        const blocked = globalBlock || userBlock;
        if (blocked) {
            const expired = blocked.expires_at && new Date(blocked.expires_at) < new Date();
            if (!expired) { const tag = blocked.is_global ? '[BLACKLIST GLOBAL]' : '[BLACKLIST]'; console.log(`${tag} IP: ${sanitizeLog(ip)} | motivo: ${sanitizeLog(blocked.reason)}`); return { isThreat: true, reason: `blacklist:${blocked.reason}`, riskScore: 100 }; }
        }
    } catch {}
    const memHit = getFromMemoryCache(ip);
    if (memHit) { console.log(`[CACHE MEM] IP: ${sanitizeLog(ip)} | threat: ${memHit.isThreat}`); return memHit; }
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: cached } = await withTimeout(supabase.from('ip_cache').select('is_threat, reason, risk_score').eq('ip', ip).gte('checked_at', oneDayAgo).single(), 2000);
        if (cached) { console.log(`[CACHE DB] IP: ${sanitizeLog(ip)} | threat: ${cached.is_threat}`); setInMemoryCache(ip, cached.is_threat, cached.reason, cached.risk_score || 0); return { isThreat: cached.is_threat, reason: cached.reason, riskScore: cached.risk_score || 0 }; }
    } catch {}
    console.log(`[API CHECK] IP: ${sanitizeLog(ip)}`);
    let isThreat = false, reason = null, riskScore = 0;
    try {
        const [ipinfoResult, proxycheckResult] = await Promise.allSettled([withTimeout(checkIPInfo(ip), 2000), withTimeout(checkProxycheck(ip), 2000)]);
        if (ipinfoResult.status === 'fulfilled' && ipinfoResult.value.isThreat) { isThreat = true; reason = ipinfoResult.value.reason; riskScore = ipinfoResult.value.riskScore || 90; }
        if (!isThreat && proxycheckResult.status === 'fulfilled' && proxycheckResult.value.isThreat) { isThreat = true; reason = proxycheckResult.value.reason; riskScore = proxycheckResult.value.riskScore || 0; }
        if (!isThreat && proxycheckResult.status === 'fulfilled') { riskScore = proxycheckResult.value.riskScore || 0; }
        if (ipinfoResult.status === 'rejected') console.warn(`[IPINFO FALHOU] ${sanitizeLog(ipinfoResult.reason?.message)}`);
        if (proxycheckResult.status === 'rejected') console.warn(`[PROXYCHECK FALHOU] ${sanitizeLog(proxycheckResult.reason?.message)}`);
    } catch (err) { console.error(`[CHECKIP ERRO] ${sanitizeLog(err.message)}`); return { isThreat: false, reason: 'check_error', riskScore: 0 }; }
    const isHighRisk = riskScore && riskScore > 65;
    const finalIsThreat = isThreat || isHighRisk;
    const finalReason = isHighRisk && !isThreat ? `high_risk_score:${riskScore}` : reason;
    setInMemoryCache(ip, finalIsThreat, finalReason, riskScore);
    supabase.from('ip_cache').upsert({ ip, is_threat: finalIsThreat, reason: finalReason, risk_score: riskScore, checked_at: new Date() }, { onConflict: 'ip' }).then(({ error }) => { if (error) console.error('[ERRO AO SALVAR IP_CACHE]', sanitizeLog(error.message)); });
    if (finalIsThreat) {
        const isGlobal = finalReason?.startsWith('datacenter:') || finalReason?.startsWith('proxy:') || finalReason?.startsWith('high_risk');
        blockIpPermanently(ip, finalReason, userId, isGlobal);
        if (isHighRisk && !isThreat) console.log(`[TRAVA 1] IP: ${sanitizeLog(ip)} | risk_score: ${riskScore} | bloqueado`);
        if (isGlobal) console.log(`[BLACKLIST GLOBAL ADICIONADO] IP: ${sanitizeLog(ip)} | motivo: ${sanitizeLog(finalReason)}`);
    }
    return { isThreat: finalIsThreat, reason: finalReason, riskScore };
};

const pickOfferUrl = (campaign) => { const offerB = campaign.offer_page_b; if (offerB && isValidUrl(offerB)) return Math.random() < 0.5 ? campaign.offer_url : offerB; return campaign.offer_url; };

// ==========================================
// v20.3: BORDER QUARANTINE — Cloudflare IP Access Rules Sync
// ==========================================
// Drains cf_sync_queue periodically and pushes hostile IPs to Cloudflare's
// edge firewall via IP Access Rules API. Future requests from those IPs are
// blocked at the edge before hitting the VPS.
//
// The trigger enqueue_cf_block (see migration) inserts into cf_sync_queue
// whenever server.js writes a high-confidence global block to blocked_ips.
//
// KILL SWITCH: set CF_SYNC_ENABLED=0 in .env to disable the worker entirely
// without a code change. Queue continues to accumulate; drain resumes on
// re-enable.
//
// AUTH: uses CLOUDFLARE_API_TOKEN with Zone:SSL:Edit + Zone:Zone:Read scopes
// (v20.3 migrated off Global API Key). Token MUST be scoped to the specific
// zone, never global.
// ==========================================
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_SYNC_ENABLED = process.env.CF_SYNC_ENABLED === '1';
const CF_SYNC_BATCH_SIZE = parseInt(process.env.CF_SYNC_BATCH_SIZE) || 20;
const CF_SYNC_INTERVAL_MS = parseInt(process.env.CF_SYNC_INTERVAL_MS) || 15_000;

class BorderQuarantineWorker {
    constructor() {
        this.running = false;
        this.stats = {
            synced: 0,
            failed: 0,
            last_run: null,
            last_error: null,
            enabled: CF_SYNC_ENABLED,
        };
    }

    async drain() {
        if (!CF_SYNC_ENABLED || this.running) return;
        if (!CF_ZONE_ID || !CF_TOKEN) {
            console.error('[CF-SYNC] CLOUDFLARE_ZONE_ID or CLOUDFLARE_API_TOKEN missing; worker idle');
            return;
        }
        this.running = true;
        try {
            // Claim a batch with row-level lock. SKIP LOCKED guarantees safety
            // under horizontal scaling (multiple server.js instances).
            const { data: claimed, error: claimError } = await withTimeout(
                supabase.rpc('claim_cf_sync_batch', { p_limit: CF_SYNC_BATCH_SIZE }),
                3000
            );
            if (claimError) {
                this.stats.last_error = sanitizeLog(claimError.message);
                console.error(`[CF-SYNC] Claim error: ${this.stats.last_error}`);
                return;
            }
            if (!claimed || claimed.length === 0) return;

            for (const row of claimed) {
                try {
                    if (row.action === 'block') {
                        const ruleId = await this.cfCreateAccessRule(row.ip_address, row.reason);
                        await withTimeout(supabase.from('cf_sync_queue').update({
                            status: 'synced',
                            cf_rule_id: ruleId,
                            synced_at: new Date().toISOString(),
                        }).eq('id', row.id), 2000);
                        this.stats.synced++;
                        console.log(`[CF-SYNC] Edge block installed | IP: ${sanitizeLog(row.ip_address)} | rule: ${sanitizeLog(ruleId)}`);
                    } else if (row.action === 'unblock' && row.cf_rule_id) {
                        await this.cfDeleteAccessRule(row.cf_rule_id);
                        await withTimeout(supabase.from('cf_sync_queue').update({
                            status: 'synced',
                            synced_at: new Date().toISOString(),
                        }).eq('id', row.id), 2000);
                        this.stats.synced++;
                        console.log(`[CF-SYNC] Edge unblock done | IP: ${sanitizeLog(row.ip_address)}`);
                    } else {
                        // Unknown action or missing cf_rule_id on unblock — mark synced to avoid loop.
                        await withTimeout(supabase.from('cf_sync_queue').update({
                            status: 'synced',
                            synced_at: new Date().toISOString(),
                            last_error: 'skipped:invalid_action_or_missing_rule_id',
                        }).eq('id', row.id), 2000);
                    }
                } catch (err) {
                    this.stats.failed++;
                    this.stats.last_error = sanitizeLog(err.message);
                    const nextAttempts = (row.attempts || 0) + 1;
                    const nextStatus = nextAttempts >= 5 ? 'failed' : 'pending';
                    await withTimeout(supabase.from('cf_sync_queue').update({
                        status: nextStatus,
                        attempts: nextAttempts,
                        last_error: sanitizeLog(err.message),
                    }).eq('id', row.id), 2000).catch(() => {});
                    console.error(`[CF-SYNC ERRO] ${sanitizeLog(err.message)} | IP: ${sanitizeLog(row.ip_address)} | attempt: ${nextAttempts}/5`);
                }
            }
            this.stats.last_run = new Date().toISOString();
        } catch (err) {
            this.stats.last_error = sanitizeLog(err.message);
            console.error(`[CF-SYNC DRAIN FALHOU] ${this.stats.last_error}`);
        } finally {
            this.running = false;
        }
    }

    async cfCreateAccessRule(ip, reason) {
        // Cloudflare API: Zone-level IP Access Rule
        // POST /zones/{zone_id}/firewall/access_rules/rules
        // Uses safeFetch for SSRF guard + size cap + manual redirect handling.
        const result = await safeFetch(
            `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/firewall/access_rules/rules`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CF_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mode: 'block',
                    configuration: { target: 'ip', value: ip },
                    notes: `cloakguard:${String(reason).slice(0, 100)}`,
                }),
                timeoutMs: 5000,
                maxBytes: 64 * 1024,
                maxRedirects: 0,
            }
        );
        const data = JSON.parse(result.bodyText());
        if (!data.success) {
            // CF error code 10000 = duplicate rule. Treat as idempotent success.
            if (Array.isArray(data.errors) && data.errors.some(e => e.code === 10000)) {
                return 'duplicate';
            }
            const msg = data.errors?.[0]?.message || 'unknown';
            throw new Error(`CF API block: ${msg}`);
        }
        return data.result?.id || 'unknown';
    }

    async cfDeleteAccessRule(ruleId) {
        if (!ruleId || ruleId === 'duplicate') return;
        const result = await safeFetch(
            `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/firewall/access_rules/rules/${encodeURIComponent(ruleId)}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${CF_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                timeoutMs: 5000,
                maxBytes: 32 * 1024,
                maxRedirects: 0,
            }
        );
        const data = JSON.parse(result.bodyText());
        if (!data.success) {
            const msg = data.errors?.[0]?.message || 'unknown';
            throw new Error(`CF API delete: ${msg}`);
        }
    }
}

const borderQuarantine = new BorderQuarantineWorker();

// ==========================================
// RATE LIMIT
// ==========================================
const limiter = rateLimit({ windowMs: 60 * 1000, max: 60, keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.socket.remoteAddress, message: 'Too many requests', standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// ==========================================
// TRAVA 3 (v19.2): Prefetch Blocking + Shadow Metric
// ==========================================
app.use((req, res, next) => {
    const xPurpose = req.get('x-purpose')?.toLowerCase();
    const secFetchPurpose = req.get('sec-fetch-purpose')?.toLowerCase();
    if (xPurpose === 'preview' || xPurpose === 'prefetch' || secFetchPurpose === 'prefetch') {
        console.log(`[TRAVA 3] Prefetch bloqueado | x-purpose: ${sanitizeLog(xPurpose)} | sec-fetch-purpose: ${sanitizeLog(secFetchPurpose)}`);
        const host = req.get('host')?.split(':')[0];
        if (host) { const cached = campaignCache.get(host); if (cached) incrementShadowStat(cached.id, 'prefetch'); }
        return res.status(204).end();
    }
    next();
});

// ==========================================
// /stats — INTERNAL OBSERVABILITY (renomeado de /health duplicado)
// ==========================================
// PR-3b.4: este endpoint era um SEGUNDO `app.get('/health', ...)` registrado
// depois do healthcheck do UptimeRobot. Express usa só o primeiro com mesmo
// path, então toda essa info de caches/buffers/border_quarantine ficava
// invisível via HTTP — só aparecia no log do [MONITOR] a cada 60s.
// Renomeado pra /stats pra liberar /health pro UptimeRobot e ter ambos
// funcionando.
// ==========================================
app.get('/stats', (req, res) => {
    res.json({ status: 'ok', version: 'v20.6', timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()), // [PR-3c FIX] bump version
        mem_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        caches: { ip: ipMemoryCache.size, dedup: clickDeduplicationCache.size, campaign: campaignCache.size, unique: uniqueCheckCache.size },
        buffers: { log: requestsLogBuffer.pending, fp: fingerprintLogBuffer.pending },
        border_quarantine: borderQuarantine.stats,
    });
});

// Cache clear endpoint — S-07 patched: timing-safe comparison
app.post('/cache-clear', (req, res) => {
    const provided = req.headers['x-cache-secret'];
    const expected = process.env.CACHE_CLEAR_SECRET;
    if (!expected || !provided || typeof provided !== 'string') return res.status(403).json({ error: 'forbidden' });
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(403).json({ error: 'forbidden' });
    const domain = req.body?.domain;
    if (domain) { campaignCache.delete(domain); console.log(`[CACHE CLEAR] Dominio: ${sanitizeLog(domain)}`); }
    else { campaignCache.clear(); console.log(`[CACHE CLEAR] Todos os dominios`); }
    res.json({ ok: true });
});

// ==========================================
// v20: ROTA POST /test — CloakTest (dry-run do funil completo)
// ==========================================
app.post('/test', async (req, res) => {
    const startTime = Date.now();
    try {
        const { campaign_hash, ip, user_agent, referer, country: reqCountry } = req.body || {};
        if (!campaign_hash || !ip || !user_agent) return res.status(400).json({ error: 'missing_params', message: 'campaign_hash, ip e user_agent sao obrigatorios' });
        const ua = user_agent.toLowerCase();
        const device = detectDevice(ua);
        const country = (reqCountry || '').toUpperCase();
        const travas_ativadas = [];
        let riskScore = 0;
        const isBlockedAgent = BLOCKED_AGENTS.some(agent => ua.includes(agent));
        if (isBlockedAgent) {
            travas_ativadas.push('ua_blocklist');
            return res.json({ action: 'safe_page', reason: 'bot_user_agent', travas_ativadas, risk_score: 0, duration_ms: Date.now() - startTime });
        }
        const { data: campaign, error: dbError } = await withTimeout(
            supabase.from('campaigns').select('id, user_id, offer_url, safe_url, target_countries, target_devices, strict_mode, is_active, traffic_source')
                .eq('hash', campaign_hash).single(), 3000
        );
        if (dbError || !campaign) return res.json({ action: 'error', reason: 'campaign_not_found', travas_ativadas, risk_score: 0, duration_ms: Date.now() - startTime });
        if (!campaign.is_active) return res.json({ action: 'safe_page', reason: 'campaign_paused', travas_ativadas, risk_score: 0, duration_ms: Date.now() - startTime });
        const allowedCountries = campaign.target_countries || [];
        if (allowedCountries.length > 0 && country && !allowedCountries.includes(country)) {
            travas_ativadas.push('country_filter');
            return res.json({ action: 'safe_page', reason: `country_blocked:${country}`, travas_ativadas, risk_score: 0, duration_ms: Date.now() - startTime });
        }
        const allowedDevices = campaign.target_devices || [];
        if (allowedDevices.length > 0) {
            const deviceMatches = allowedDevices.includes(device) || (device === 'tablet' && allowedDevices.includes('mobile'));
            if (!deviceMatches) {
                travas_ativadas.push('device_filter');
                return res.json({ action: 'safe_page', reason: `device_blocked:${device}`, travas_ativadas, risk_score: 0, duration_ms: Date.now() - startTime });
            }
        }
        if (campaign.strict_mode) {
            const hasCountry = !!country && country !== 'XX' && country !== 'T1';
            const hasReferer = !!referer;
            if (!hasCountry) { riskScore += 20; travas_ativadas.push('strict:no_country(+20)'); }
            if (!hasReferer && device === 'desktop') { riskScore += 15; travas_ativadas.push('strict:no_referer_desktop(+15)'); }
            if (hasReferer) {
                const refLower = referer.toLowerCase();
                const knownSources = Object.values(SOURCE_REFERERS).flat();
                if (!knownSources.some(s => refLower.includes(s))) { riskScore += 10; travas_ativadas.push('strict:unknown_referer(+10)'); }
            }
            if (!hasCountry && !hasReferer && device === 'desktop') {
                travas_ativadas.push('strict:hard_block');
                return res.json({ action: 'safe_page', reason: 'strict_mode:no_country_no_referer', travas_ativadas, risk_score: riskScore, duration_ms: Date.now() - startTime });
            }
        }
        if (referer && campaign.traffic_source) {
            const refResult = checkRefererSource(referer, campaign.traffic_source, device);
            if (refResult.score > 0) { riskScore += refResult.score; travas_ativadas.push(`trava6:${refResult.flag}(+${refResult.score})`); }
        }
        travas_ativadas.push('trava7:skipped(no_header_in_test)');
        travas_ativadas.push('trava9:skipped(no_header_in_test)');
        const ipResult = await checkIp(ip, campaign.user_id);
        riskScore += ipResult.riskScore;
        if (ipResult.isThreat) {
            travas_ativadas.push(`ip_check:${ipResult.reason}`);
            return res.json({ action: 'safe_page', reason: ipResult.reason, travas_ativadas, risk_score: riskScore, duration_ms: Date.now() - startTime });
        }
        if (ipResult.riskScore > 0) travas_ativadas.push(`ip_score(+${ipResult.riskScore})`);
        travas_ativadas.push('fingerprint:bypassed(test_mode)');
        return res.json({ action: 'offer_page', url: campaign.offer_url, travas_ativadas, risk_score: riskScore, device, duration_ms: Date.now() - startTime });
    } catch (err) {
        // S-16: nunca retornar err.message para o cliente
        console.error(`[TEST ENDPOINT ERRO] ${sanitizeLog(err.message)}`);
        return res.status(500).json({ error: 'internal' });
    }
});

// ==========================================
// v19: ROTA POST /fp — Fingerprint Endpoint
// ==========================================
app.post('/fp', async (req, res) => {
    const startTime = Date.now();
    try {
        const { t: fpToken, s: signals } = req.body || {};
        if (!fpToken || !signals) return res.status(400).json({ error: 'missing_data' });
        const tokenData = await consumeFingerprintToken(fpToken);
        if (!tokenData) { console.warn(`[TRAVA 8] FP token invalido ou expirado`); return res.status(403).json({ error: 'invalid_token' }); }
        const { campaign_id, user_id, offer_url, offer_page_method, safe_url, ip_address, user_agent, device, country, click_id, risk_score, tracking_data } = tokenData;
        const { score: fpScore, result: fpResult, flags } = analyzeFingerprintSignals(signals, device);
        logFingerprintResult(campaign_id, ip_address, device, fpScore, fpResult, { ...signals, flags, analysis_time_ms: Date.now() - startTime });
        supabase.from('fingerprint_tokens').update({ fp_result: fpResult, fp_score: fpScore, fp_signals: { flags, raw: signals } }).eq('token', fpToken).then(({ error }) => { if (error) console.error('[FP UPDATE ERRO]', sanitizeLog(error.message)); });
        let tracking = null;
        try { tracking = tracking_data ? JSON.parse(tracking_data) : null; } catch {}
        if (fpResult === 'bot') {
            console.log(`[TRAVA 8 BLOCK] IP: ${sanitizeLog(ip_address)} | score: ${fpScore} | flags: ${flags.join(',')}`);
            logEvent({ campaign_id, user_id, ip: ip_address, user_agent: user_agent || '', action: ACTION.BOT_BLOCKED, reason: `fingerprint_bot:score_${fpScore}:${flags.join('+')}`, country, device, tracking, riskScore: risk_score || 0 });
            // PR-3b.4: ?? em cost preserva cost=0 legítimo (|| convertia em null).
            updateCampaignStats(campaign_id, { action: ACTION.BOT_BLOCKED, cost: tracking?.cost ?? null, is_unique: false }).catch(() => {});
            return res.json({ url: safe_url || SAFE_FALLBACK_URL });
        }
        console.log(`[TRAVA 8 PASS] IP: ${sanitizeLog(ip_address)} | score: ${fpScore} | ${Date.now() - startTime}ms`);
        logEvent({ campaign_id, user_id, ip: ip_address, user_agent: user_agent || '', action: ACTION.OFFER_PAGE, country, device, tracking, riskScore: risk_score || 0 });
        // PR-3b.4: ?? em cost + Boolean() em is_unique. O is_unique aqui vem do
        // tracking persistido no fingerprint_token (foi calculado no /c/:hash
        // ANTES do sendToSafe), então o valor é verdadeiro.
        updateCampaignStats(campaign_id, { action: ACTION.OFFER_PAGE, cost: tracking?.cost ?? null, is_unique: Boolean(tracking?.is_unique) }).catch(() => {});
        if (tracking) { supabase.from('campaigns').select('id, postback_url, postback_method').eq('id', campaign_id).single().then(({ data: camp }) => { if (camp) firePostback(camp, tracking, { ip: ip_address, country, device }); }).catch(() => {}); }
        if (click_id) { recordOneTimeClick(click_id, user_id, campaign_id, ip_address, user_agent, device, country).catch(() => {}); recordSmartIpBinding(click_id, user_id, campaign_id, ip_address, user_agent, device).catch(() => {}); }
        const hostClean = req.get('host')?.split(':')[0] || '';
        const sessionToken = await createSessionToken({ campaign_id, user_id, offer_url, offer_page_method, ip: ip_address });
        if (sessionToken) return res.json({ url: `https://${hostClean}/t/${sessionToken}` });
        return res.json({ url: offer_url });
    } catch (err) { console.error(`[FP ENDPOINT ERRO] ${sanitizeLog(err.message)}`); return res.status(500).json({ error: 'internal' }); }
});

// ==========================================
// ROTA /t/:token — UniqueToken consumer
// ==========================================
app.get('/t/:token', async (req, res) => {
    const { token } = req.params;
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
    console.log(`\n[TOKEN] IP: ${sanitizeLog(ip)} | token: ${sanitizeLog(token?.slice(0, 8))}...`);
    const result = await consumeSessionToken(token);
    if (!result) { console.log(`[TOKEN INVALIDO] IP: ${sanitizeLog(ip)}`); return res.redirect(302, SAFE_FALLBACK_URL); }
    console.log(`[TOKEN VALIDO] IP: ${sanitizeLog(ip)} | metodo: ${sanitizeLog(result.offer_page_method)}`);
    if (result.offer_page_method === 'content_fetch') return fetchAndServe(res, result.offer_url);
    return res.redirect(302, result.offer_url);
});

// ==========================================
// MOTOR PRINCIPAL — v20.2
// ==========================================
// v20.2 CHANGES:
//   - Rota explicita app.get('/c/:hash') como motor principal
//   - Lookup de campanha por HASH (globalmente unico) em vez de domain
//   - Validacao host-vs-campaign.domain: defense-in-depth contra subdomain takeover
//     (alguem apontando CNAME para cname.cloakerx.com sem ter cadastrado campanha)
//   - campaignCache rekeyed por hash
//   - Catch-all refatorado: qualquer path nao-mapeado -> 302 SAFE_FALLBACK_URL
//     sem logar no banco (sem poluir metricas com lixo de scanner)
//
// PRE-REQUISITO DE BANCO:
//   ALTER TABLE campaigns ADD CONSTRAINT campaigns_hash_unique UNIQUE (hash);
//
// Hashes sao gerados pelo painel e armazenados em campaigns.hash. Motor nao
// toca na geracao — so faz lookup. Se hash nao existe OU nao bate com o host
// da request, cai no fallback seguro.
// ==========================================

// Regex de hash do painel: alphanumerico (letras + numeros), 6-32 chars.
// Ajuste se o gerador do painel usar chars diferentes — bloquear hashes
// malformados aqui economiza hit no Supabase e rejeita lixo cedo.
const HASH_REGEX = /^[A-Za-z0-9]{6,32}$/;

app.get('/c/:hash', async (req, res) => {
    const host = req.get('host') || '';
    const userAgent = (req.get('user-agent') || '').toLowerCase();
    const ip = req.headers['cf-connecting-ip'];
    const country = (req.headers['cf-ipcountry'] || '').toUpperCase();
    const rawHash = req.params.hash;

    if (!ip) { console.warn(`[CF-IP AUSENTE] host: ${sanitizeLog(host)}`); return res.status(403).end(); }

    // S-04: validação de formato do cf-connecting-ip (IPv4/IPv6 público)
    if (!isValidPublicIp(ip)) {
        console.warn(`[CF-IP INVALIDO] valor recusado: ${sanitizeLog(ip)} | host: ${sanitizeLog(host)}`);
        return res.status(403).end();
    }

    // S-04: hard enforcement em produção. Em dev, mantém warning.
    const remoteAddr = req.ip;
    if (!isCloudflareIP(remoteAddr)) {
        if (IS_PRODUCTION) {
            console.warn(`[CF-IP HARD BLOCK] origem nao Cloudflare: ${sanitizeLog(remoteAddr)} | host: ${sanitizeLog(host)}`);
            return res.status(403).end();
        } else {
            console.warn(`[CF-IP WARN] origem nao Cloudflare (dev mode): ${sanitizeLog(remoteAddr)} | host: ${sanitizeLog(host)}`);
        }
    }

    // v20.2: rejeicao cedo de hashes malformados — nao polui log, nao bate no banco
    if (!rawHash || !HASH_REGEX.test(rawHash)) {
        return res.redirect(302, SAFE_FALLBACK_URL);
    }

    const device = detectDevice(userAgent);
    const tracking = extractTrackingParams(req.query);
    const hostClean = host.split(':')[0];
    console.log(`\n[CLIQUE] IP: ${sanitizeLog(ip)} | Pais: ${country} | Device: ${device} | ${sanitizeLog(hostClean)}/c/${sanitizeLog(rawHash)} | Platform: ${sanitizeLog(tracking.source_platform)}`);

    try {
        let isDuplicate = false;
        let lockAcquired = false;
        let riskScore = 0;
        const isBlockedAgent = BLOCKED_AGENTS.some(agent => userAgent.includes(agent));
        if (isBlockedAgent) { console.log(`[BLOQUEADO - AGENT] ${sanitizeLog(userAgent)}`); return res.redirect(302, SAFE_FALLBACK_URL); }

        // v20.2: Campaign lookup por HASH (cache rekeyed)
        let campaign = campaignCache.get(rawHash);
        if (!campaign) {
            const { data, error: dbError } = await withTimeout(
                supabase.from('campaigns')
                    .select('id, user_id, hash, domain, offer_url, offer_page_b, safe_url, safe_page_method, offer_page_method, is_active, target_countries, target_devices, strict_mode, postback_url, postback_method, traffic_source')
                    .eq('hash', rawHash).single(), 3000
            );
            if (dbError || !data) {
                console.warn(`[HASH NAO ENCONTRADO] hash: ${sanitizeLog(rawHash)} | host: ${sanitizeLog(hostClean)}`);
                return res.redirect(302, SAFE_FALLBACK_URL);
            }
            campaign = data;
            campaignCache.set(rawHash, campaign);
        }

        // v20.2: HOST VALIDATION — defense-in-depth contra subdomain takeover.
        if (!campaign.domain || campaign.domain.toLowerCase() !== hostClean.toLowerCase()) {
            console.warn(`[HOST MISMATCH] hash: ${sanitizeLog(rawHash)} | esperado: ${sanitizeLog(campaign.domain)} | recebido: ${sanitizeLog(hostClean)}`);
            return res.redirect(302, SAFE_FALLBACK_URL);
        }

        const safeDest = isValidUrl(campaign.safe_url) ? campaign.safe_url : SAFE_FALLBACK_URL;
        const safeMethod = campaign.safe_page_method || 'redirect';

        // ──────────────────────────────────────────────────────────────────
        // PR-3b.4 (Bug B + C): Motor de unicidade ANTES de sendToSafe.
        // Antes (v20.5 inicial): checkIsUnique era chamado depois de
        // enrichedOfferUrl, e sendToSafe hardcodava is_unique=false.
        // Resultado: TODA rota de bloqueio (campaign_paused, no_click_id,
        // country_blocked, device_blocked, strict_mode, T10 bot signature,
        // IP threat, etc.) gravava is_unique=false no requests_log e no
        // campaign_stats. O card "Cliques Únicos" mostrava 0 quando a
        // campanha tinha 100% de tráfego sujo.
        // Agora: calculamos uma vez aqui no topo, e usamos em TODOS os
        // caminhos (sendToSafe, dedup silencioso, FP token, fallback).
        // ──────────────────────────────────────────────────────────────────
        const is_unique = await checkIsUnique(ip, userAgent, campaign.id);
        const finalTracking = { ...tracking, is_unique };

        const sendToSafe = async (reason, action = ACTION.BOT_BLOCKED) => {
            // PR-3b.4: passa finalTracking (com is_unique real) e usa is_unique
            // no updateCampaignStats em vez do antigo hardcoded false.
            logEvent({ campaign_id: campaign.id, user_id: campaign.user_id, ip, user_agent: userAgent, action, reason, country, device, tracking: finalTracking, riskScore });
            updateCampaignStats(campaign.id, { action, cost: tracking.cost, is_unique }).catch(() => {});
            if (safeMethod === 'content_fetch') return fetchAndServe(res, safeDest);
            return res.redirect(302, safeDest);
        };

        if (!campaign.is_active) { console.log(`[CAMPANHA PAUSADA] ${sanitizeLog(rawHash)}`); return sendToSafe('campaign_paused', ACTION.SAFE_PAGE); }

        if (!tracking.click_id) {
            console.log(`[FANTASMA SEM CLICK_ID] IP: ${sanitizeLog(ip)}`);
            incrementShadowStat(campaign.id, 'ghost');
            return sendToSafe('no_click_id', ACTION.GHOST);
        }

        if (tracking.click_id && tracking.click_id.length > 0) {
            const lockResult = tryAcquireDedupLock(ip, tracking.click_id);
            isDuplicate = lockResult.isDuplicate; lockAcquired = lockResult.acquired;
            if (isDuplicate) { incrementDuplicateCount(ip, tracking.click_id); console.log(`[DEDUP/F5] IP: ${sanitizeLog(ip)} | click: ${sanitizeLog(tracking.click_id.slice(0, 15))}...`); }
        }

        if (!isDuplicate) {
            const oneTimeCheck = await checkOneTimeClick(tracking.click_id, campaign.user_id);
            if (oneTimeCheck.fraudDetected) { console.log(`[TRAVA 4] Spy Tool detectada!`); return sendToSafe('one_time_click_reused', ACTION.SAFE_PAGE); }
            const smartBindingCheck = await checkSmartIpBinding(tracking.click_id, campaign.user_id, ip, userAgent, device);
            if (!smartBindingCheck.allowed) { console.log(`[TRAVA 5] IP-Binding violation! reason: ${sanitizeLog(smartBindingCheck.reason)}`); return sendToSafe(smartBindingCheck.reason || 'ip_binding_violation', ACTION.SAFE_PAGE); }
        }

        const allowedCountries = campaign.target_countries || [];
        if (allowedCountries.length > 0 && country && !allowedCountries.includes(country)) { console.log(`[BLOQUEADO - PAIS] ${country}`); return sendToSafe(`country_blocked:${country}`); }
        const allowedDevices = campaign.target_devices || [];
        if (allowedDevices.length > 0) {
            const deviceMatches = allowedDevices.includes(device) || (device === 'tablet' && allowedDevices.includes('mobile'));
            if (!deviceMatches) { console.log(`[BLOQUEADO - DEVICE] ${device}`); return sendToSafe(`device_blocked:${device}`); }
        }

        let strictScore = 0;
        const referer = req.headers['referer'] || req.headers['referrer'] || '';
        if (campaign.strict_mode) {
            const hasCountry = !!country && country !== 'XX' && country !== 'T1';
            const hasReferer = !!referer;
            if (!hasCountry) { strictScore += 20; }
            if (!hasReferer && device === 'desktop') { strictScore += 15; }
            if (hasReferer) {
                const refLower = referer.toLowerCase();
                const knownSources = Object.values(SOURCE_REFERERS).flat();
                if (!knownSources.some(s => refLower.includes(s))) { strictScore += 10; }
            }
            if (strictScore > 0) { riskScore += strictScore; console.log(`[STRICT SCORE] +${strictScore} | referer: "${sanitizeLog(referer.slice(0, 50)) || 'vazio'}" | country: "${country}" | total: ${riskScore}`); }
            if (!hasCountry && !hasReferer && device === 'desktop') { console.log(`[STRICT BLOCK] desktop sem pais e sem referer`); return sendToSafe('strict_mode:no_country_no_referer'); }
        }

        // ── TRAVA 10: Macro & Bot Signature Filter ─────────────────────────
        // Bloqueia auditoria de plataformas (TikTok/Meta/Google) ANTES de qualquer
        // chamada cara (proxycheck, fingerprint, postback). UA é O(1), macro é
        // O(n) no tamanho da URL — ambos baratos. Loga via sendToSafe(bot_blocked)
        // pra aparecer no dashboard como "Robô de Plataforma".
        const botFilter = runBotSignatureFilter({
            userAgent,                   // já em lowercase
            rawUrl: req.originalUrl,     // path + query string crua
        });
        if (botFilter.blocked) {
            console.log(`[TRAVA 10] ${botFilter.reason} | ${botFilter.detail} | IP: ${sanitizeLog(ip)} | hash: ${sanitizeLog(rawHash)}`);
            return sendToSafe(botFilter.reason);
        }

        if (referer && campaign.traffic_source) {
            const refResult = checkRefererSource(referer, campaign.traffic_source, device);
            if (refResult.score > 0) { riskScore += refResult.score; }
        }
        const acceptLang = req.get('accept-language') || '';
        if (country) {
            const langResult = checkAcceptLanguage(acceptLang, country);
            if (langResult.score > 0) { riskScore += langResult.score; console.log(`[TRAVA 7] ${langResult.flag} | +${langResult.score} | total: ${riskScore}`); }
        }
        const hintsResult = checkClientHints(req, userAgent);
        if (hintsResult.score > 0) { riskScore += hintsResult.score; }

        const ipResult = await checkIp(ip, campaign.user_id);
        riskScore += ipResult.riskScore;
        if (ipResult.isThreat) { console.log(`[BLOQUEADO - IP] ${sanitizeLog(ip)} | motivo: ${sanitizeLog(ipResult.reason)} | score: ${riskScore}`); return sendToSafe(ipResult.reason); }

        const offerUrl = pickOfferUrl(campaign);
        const offerMethod = campaign.offer_page_method || 'redirect';
        if (!isValidUrl(offerUrl)) { console.error(`[URL INVALIDA] ${sanitizeLog(offerUrl)}`); return sendToSafe('invalid_offer_url', ACTION.SAFE_PAGE); }
        const enrichedOfferUrl = buildEnrichedOfferUrl(offerUrl, req.query);
        if (enrichedOfferUrl !== offerUrl) console.log(`[PARAM FORWARD] ${Object.keys(req.query).length} params injetados`);

        // PR-3b.4: o is_unique e finalTracking JÁ foram calculados lá em cima,
        // antes de sendToSafe. Não recalculamos aqui — usamos os mesmos.

        if (isDuplicate) {
            console.log(`[DEDUP SILENCIOSO] BD nao atualizado`);
            incrementShadowStat(campaign.id, 'dedup');
            recordSmartIpBinding(tracking.click_id, campaign.user_id, campaign.id, ip, userAgent, device).catch(() => {});
            if (lockAcquired) releaseDedupLock(ip, tracking.click_id);
            if (offerMethod === 'content_fetch') return fetchAndServe(res, enrichedOfferUrl);
            return res.redirect(302, enrichedOfferUrl);
        }

        const fpToken = await createFingerprintToken({
            campaign_id: campaign.id, user_id: campaign.user_id,
            offer_url: enrichedOfferUrl, offer_page_method: offerMethod, safe_url: safeDest,
            ip, user_agent: userAgent, device, country, click_id: tracking.click_id,
            risk_score: riskScore, tracking: finalTracking, hostClean,
        });
        if (lockAcquired) releaseDedupLock(ip, tracking.click_id);

        if (fpToken) {
            console.log(`[TRAVA 8] Servindo checkpoint FP | IP: ${sanitizeLog(ip)} | ${country}`);
            const fpPage = buildFingerprintPage(fpToken, enrichedOfferUrl);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            return res.status(200).send(fpPage);
        }

        console.log(`[TRAVA 8 FALLBACK] FP token falhou -> aprovando direto`);
        logEvent({ campaign_id: campaign.id, user_id: campaign.user_id, ip, user_agent: userAgent, action: ACTION.OFFER_PAGE, country, device, tracking: finalTracking, riskScore });
        updateCampaignStats(campaign.id, { action: ACTION.OFFER_PAGE, cost: tracking.cost, is_unique }).catch(() => {});
        firePostback(campaign, finalTracking, { ip, country, device });
        recordOneTimeClick(tracking.click_id, campaign.user_id, campaign.id, ip, userAgent, device, country).catch(() => {});
        recordSmartIpBinding(tracking.click_id, campaign.user_id, campaign.id, ip, userAgent, device).catch(() => {});

        const fallbackToken = await createSessionToken({ campaign_id: campaign.id, user_id: campaign.user_id, offer_url: enrichedOfferUrl, offer_page_method: offerMethod, ip });
        if (fallbackToken) return res.redirect(302, `https://${hostClean}/t/${fallbackToken}`);
        if (offerMethod === 'content_fetch') return fetchAndServe(res, enrichedOfferUrl);
        return res.redirect(302, enrichedOfferUrl);

    } catch (error) {
        console.error('[ERRO NO FUNIL]', sanitizeLog(error.message));
        return res.redirect(302, SAFE_FALLBACK_URL);
    }
});

// ==========================================
// v20.2: CATCH-ALL FALLBACK
// ==========================================
// Qualquer request que nao bateu em nenhuma rota explicita (/, /qualquer-coisa,
// /c/hash-malformado que escapou do regex, etc) cai aqui. Nao loga no banco,
// nao gasta invocations do Supabase, nao polui metricas de campanhas.
// Apenas 302 para SAFE_FALLBACK_URL.
//
// IMPORTANTE: este e o ULTIMO app.use do arquivo. Qualquer rota nova precisa
// ser registrada ACIMA dele, senao cai aqui por default.
// ==========================================
app.use((req, res) => {
    // Sem logar IP nem path — scanner nao deve conseguir poluir logs via request spam.
    // Se precisar debug de catch-all, ativar via env var DEBUG_CATCHALL=1.
    if (process.env.DEBUG_CATCHALL === '1') {
        const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
        console.log(`[CATCHALL] ${sanitizeLog(req.method)} ${sanitizeLog(req.path)} | IP: ${sanitizeLog(ip)}`);
    }
    return res.redirect(302, SAFE_FALLBACK_URL);
});

// ==========================================
// v20: MONITORAMENTO
// ==========================================
// [PR-3c FIX] Bug #5: ref do timer salva em const pra que o gracefulShutdown
// consiga clearInterval ANTES do flush dos buffers.
const monitorInterval = setInterval(() => {
    const stats = {
        ip: ipMemoryCache.size, dedup: clickDeduplicationCache.size,
        camp: campaignCache.size, uniq: uniqueCheckCache.size,
        log_buf: requestsLogBuffer.pending, fp_buf: fingerprintLogBuffer.pending,
        mem: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        cfq_synced: borderQuarantine.stats.synced,
        cfq_failed: borderQuarantine.stats.failed,
    };
    console.log(`[MONITOR] IP:${stats.ip} Dedup:${stats.dedup} Camp:${stats.camp} Uniq:${stats.uniq} | Buf:${stats.log_buf}+${stats.fp_buf} | CFQ:${stats.cfq_synced}/${stats.cfq_failed} | Mem:${stats.mem}MB`);
}, 60 * 1000);

// ==========================================
// v20.3: Border Quarantine drain loop
// ==========================================
// [PR-3c FIX] Bug #5: ref do timer salva em const (null quando kill switch off)
// pra que o gracefulShutdown saiba se precisa parar esse loop também.
const cfSyncInterval = CF_SYNC_ENABLED
    ? setInterval(() => {
        borderQuarantine.drain().catch(err => console.error('[CF-SYNC LOOP ERRO]', sanitizeLog(err.message)));
    }, CF_SYNC_INTERVAL_MS)
    : null;

// ==========================================
// [PR-3c FIX] Bug #5: GRACEFUL SHUTDOWN UNIFICADO
// ==========================================
// Antes (v20.5): handlers SIGTERM/SIGINT foram registrados logo após a criação
// dos buffers (lá em cima), e os setInterval(monitor) e setInterval(cf-sync)
// rodavam até o process.exit. Resultado: durante o flush final dos buffers,
// o monitor (60s) e o cf-sync (15s) ainda podiam disparar, batendo no
// Supabase em paralelo com o flush — gerando race em escrita e poluindo log
// final. Agora: cleanup ordenado.
//   1. Idempotência via flag isShuttingDown (SIGTERM + SIGINT concomitantes
//      do PM2/systemd não disparam o flush 2x).
//   2. clearInterval em ambos os timers ANTES do flush — sem disparos novos.
//   3. Promise.all([requestsLogBuffer.shutdown(), fingerprintLogBuffer.shutdown()])
//      pra limpar tudo que estava pending.
//   4. process.exit(0) só depois do flush — PM2 não vai matar a -9.
// ==========================================
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[SHUTDOWN] Sinal ${signal} recebido — parando timers e fazendo flush dos buffers...`);
    clearInterval(monitorInterval);
    if (cfSyncInterval) clearInterval(cfSyncInterval);
    try {
        await Promise.all([requestsLogBuffer.shutdown(), fingerprintLogBuffer.shutdown()]);
        console.log('[SHUTDOWN] Flush concluído. Encerrando processo.');
    } catch (err) {
        console.error('[SHUTDOWN] Erro durante flush final:', sanitizeLog(err.message));
    }
    process.exit(0);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ==========================================
// START
// ==========================================
app.listen(port, () => {
    console.log(`CloakGuard v20.6 (PR-3c — hardening: race conditions, backoff, cleanup) rodando na porta ${port}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'} | CF-IP enforcement: ${IS_PRODUCTION ? 'HARD BLOCK' : 'WARN ONLY'}`);
    console.log(`SAFE_FALLBACK_URL: ${SAFE_FALLBACK_URL}`);

    console.log(`\n=== PR-3c (v20.6) HARDENING ===`);
    console.log(`    Bug #1 WriteBuffer:    requeue (unshift) + backoff em consecutiveFailures (>5 -> CRITICAL)`);
    console.log(`    Bug #2 Token consume:  UPDATE atomico em session_tokens + fingerprint_tokens (sem race)`);
    console.log(`    Bug #3 Unique cache:   sem cacheamento em caminho de erro do DB (permite retry)`);
    console.log(`    Bug #4 Cost stats:     ?? 0 em updateCampaignStats (consistente com PR-3b.4)`);
    console.log(`    Bug #5 Shutdown:       clearInterval(monitor + cf-sync) ANTES do flush dos buffers`);

    console.log(`\n=== PR-3b.4 (v20.5) ===`);
    console.log(`    is_unique:        DB-backed (requests_log rolling 24h) + LRU hot cache`);
    console.log(`    Chave unicidade:  ip|user_agent|campaign_id (UA incluso)`);
    console.log(`    Posicionamento:   checkIsUnique calculado ANTES de sendToSafe`);
    console.log(`    Higienizacao:     ?? em cost/risk_score, Boolean() em is_unique`);
    console.log(`    /health:          UptimeRobot (status:ok / 503 degraded)`);
    console.log(`    /stats:           internal observability (caches/buffers/CF queue)`);
    console.log(`    Migration req.:   idx_requests_log_campaign_ip_ua_created`);

    console.log(`\n=== V20.3 BORDER QUARANTINE ===`);
    console.log(`    CF_SYNC_ENABLED: ${CF_SYNC_ENABLED ? 'YES (active drain)' : 'NO (queue accumulates, no drain)'}`);
    console.log(`    Batch size:      ${CF_SYNC_BATCH_SIZE} rows per drain`);
    console.log(`    Drain interval:  ${CF_SYNC_INTERVAL_MS}ms`);
    console.log(`    Auth:            Bearer token (Global API Key deprecated)`);
    console.log(`    Worker status:   ${CF_SYNC_ENABLED ? 'scheduled' : 'idle (kill switch ON)'}`);

    console.log(`\n=== V20.2 ROUTING ===`);
    console.log(`    Motor principal: GET /c/:hash (lookup por hash globalmente unico)`);
    console.log(`    Campaign cache:  rekeyed por hash (antes: por domain)`);
    console.log(`    Host validation: hostClean MUST match campaign.domain (anti-takeover)`);
    console.log(`    Catch-all:       302 -> SAFE_FALLBACK_URL, sem log no banco`);
    console.log(`    Pre-req SQL:     ALTER TABLE campaigns ADD CONSTRAINT campaigns_hash_unique UNIQUE (hash)`);

    console.log(`\n=== V20.1 SECURITY PATCHES (preserved) ===`);
    console.log(`    S-01 SSRF guard: assertSafeUrl + safeFetch (DNS resolution + private IP block + manual redirect)`);
    console.log(`    S-02 DoS:       fetchAndServe body cap 2MB, postback cap 1MB`);
    console.log(`    S-03 Open redir: catch falls back to SAFE_FALLBACK_URL, never to user URL`);
    console.log(`    S-04 CF-IP:     hard block in production`);
    console.log(`    S-05 Filter inj: .or() rewritten as separate queries`);
    console.log(`    S-07 Timing:    timingSafeEqual on /cache-clear`);
    console.log(`    S-16 Err leak:  /test no longer returns err.message`);

    console.log(`\n=== V20 PERFORMANCE (500k/dia) ===`);
    console.log(`    WriteBuffer: requests_log(200/3s) fingerprint_log(100/5s)`);
    console.log(`    Campaign Cache: LRU 5k, TTL 5min`);
    console.log(`    Unique Cache: LRU 500k, TTL 24h`);
    console.log(`    IP Cache: LRU 200k, TTL 24h (cache hit ~98%)`);
    console.log(`    Dedup Cache: LRU 100k, TTL 10min`);

    console.log(`\n=== 10 TRAVAS ===`);
    console.log(`    T1: Risk Score > 65          | T2: Dedup LRU 100k`);
    console.log(`    T3: Prefetch + Shadow         | T4: One-Time-ID 7d`);
    console.log(`    T5: IP-Binding 2 IPs          | T6: Referrer x Source`);
    console.log(`    T7: Accept-Language scoring   | T8: JS Fingerprint (headless)`);
    console.log(`    T9: Client Hints sec-ch-ua    | T10: Macro & Bot Signature`);
});
