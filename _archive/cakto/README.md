# Arquivo — Cakto (abandonado)

**Decisão (2026-09-16):** CloakerX não usa Cakto. Billing = Stripe USD only.

## O que está aqui
- `functions/cakto-webhook/` — edge + fixtures/tests do adaptador
- `migrations/` — fatia 3b (nunca aplicada) e drafts locais de events_raw

## O que permanece no banco (não dropar sem migração explícita)
Tabelas/RPCs já aplicadas no projeto remoto (`cakto_*`, `cakto_apply_event`, etc.) ficam órfãs.
Não entram no path de produto. Limpeza de schema = tarefa separada se necessário.

## Não redeployar
Não existe mais `[functions.cakto-webhook]` em `supabase/config.toml`.
