// =============================================================================
// Escape hatch de tipagem pra RPCs e colunas que ainda não estão no types.ts
// gerado. Mantém o resto do app totalmente tipado.
//
// Uso:
//   import { supabaseUntyped } from "@/integrations/supabase/untyped";
//   const { data, error } = await supabaseUntyped.rpc("admin_custom_rpc", { foo: 1 });
//
// TODO(types): remover quando `supabase gen types typescript --linked` for
//   executado e os tipos estiverem sincronizados com o schema de produção.
// =============================================================================

import { supabase } from "./client";

// Builder minimalista que imita a chain fluente do PostgREST sem exigir tipos gerados.
// Retorna `unknown` no data — caller faz o cast explícito pra sua Row.
type UntypedQueryBuilder = {
  select: (columns?: string) => UntypedQueryBuilder;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => UntypedQueryBuilder;
  update: (values: Record<string, unknown>) => UntypedQueryBuilder;
  delete: () => UntypedQueryBuilder;
  eq: (column: string, value: unknown) => UntypedQueryBuilder;
  neq: (column: string, value: unknown) => UntypedQueryBuilder;
  in: (column: string, values: unknown[]) => UntypedQueryBuilder;
  order: (column: string, opts?: { ascending?: boolean }) => UntypedQueryBuilder;
  limit: (count: number) => UntypedQueryBuilder;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

export type UntypedSupabaseRpc = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => UntypedQueryBuilder;
};

export const supabaseUntyped = supabase as unknown as UntypedSupabaseRpc;
