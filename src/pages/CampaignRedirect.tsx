// ───────────────────────────────────────────────────────────────────────
// Fallback do SPA para a rota /c/:hash.
//
// O roteamento real do visitante é executado ANTES do SPA por um serviço
// externo (Cloudflare Worker / backend de redirecionamento), que resolve
// o hash, aplica o fingerprint/targeting e responde com um 302 para
// safe_url ou offer_url.
//
// Após a descontinuação do Masking (abr/2026), o engine NÃO deve mais
// fazer fetch() do HTML de destino nem ler safe_page_method /
// offer_page_method. Toda resposta aprovada DEVE ser sempre:
//
//     return Response.redirect(targetUrl, 302);
//
// Este componente só é renderizado quando o Worker deixa passar a
// requisição para o SPA (campanha inexistente / inativa / bloqueada).
// ───────────────────────────────────────────────────────────────────────
export default function CampaignRedirect() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-foreground">Campaign Not Found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This campaign link is inactive or doesn't exist. Please check the URL and try again.
      </p>
    </div>
  );
}
