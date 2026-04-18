-- Trava 10 — Macro & Bot Signature Filter
--
-- block_reason é TEXT (não enum), então NÃO há ALTER TYPE a rodar.
-- action_taken (enum) já aceita 'bot_blocked' desde 20260311212216.
--
-- Este índice é um otimização para o RPC get_block_reasons_summary, que
-- agrega contagens por block_reason. Ele é parcial: só indexa linhas
-- bloqueadas (action_taken = 'bot_blocked') com reason não-nula, que é
-- exatamente o que o RPC agrega.

CREATE INDEX IF NOT EXISTS idx_requests_log_block_reason_partial
  ON public.requests_log (block_reason)
  WHERE action_taken = 'bot_blocked' AND block_reason IS NOT NULL;
