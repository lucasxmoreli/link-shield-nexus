

## Plano de Melhorias para o Barramento de Bots

### 1. Ativar Geofencing e Device Filtering no Edge Function
- No Step 2, após validar a campanha, verificar se `campaign.target_countries` contém o `countryCode` do visitante. Se não, enviar para safe page.
- Verificar se `campaign.target_devices` inclui o `deviceType` detectado. Se não, enviar para safe page.
- Isso bloqueia tráfego fora do target antes mesmo das heurísticas.

### 2. Modo Strict para Suspicious Traffic
- Adicionar coluna `strict_mode` (boolean, default false) na tabela `campaigns`.
- No filtro, se `result.suspicious && campaign.strict_mode`, tratar como `bot_blocked` em vez de permitir passagem.
- No UI de edição de campanha, adicionar toggle "Strict Mode — Block suspicious traffic".

### 3. Adicionar coluna `block_reason` ao `requests_log`
- Nova coluna `block_reason text nullable` na tabela `requests_log`.
- Atualizar `logAndRespond` para receber e salvar o reason.
- Isso permite analytics por motivo de bloqueio no dashboard (ex: "40% dos bloqueios são datacenter ASN").

### 4. Persistir IP Blocklist no banco
- Criar tabela `blocked_ips` com `ip_address`, `user_id`, `reason`, `created_at`, `expires_at`.
- No filtro, antes do Layer 1, verificar se o IP está na blocklist do owner da campanha.
- Auto-popular: após 3 bloqueios do mesmo IP em 24h, inserir automaticamente.

### 5. Melhorar Heurísticas de Kwai e Snapchat
- Kwai: validar presença de `did` (device ID) nos query params.
- Snapchat: verificar referer `snapchat.com` além do click ID.

### Ordem de implementação sugerida
1. Block reason logging (base para analytics)
2. Geofencing + device filtering (impacto imediato)
3. Strict mode toggle (controle por campanha)
4. IP blocklist persistente (defesa em profundidade)
5. Heurísticas melhoradas (refinamento)

### Estimativa de mudanças
- **Database**: 1 migration (nova coluna + nova tabela)
- **Edge Function**: ~60 linhas adicionais no `filter/index.ts`
- **Frontend**: Toggle de strict mode no `CampaignEdit.tsx`, coluna reason no `Requests.tsx`

