-- Gerenciador de Preços — estrutura do banco no Supabase
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo inteiro e clique em "Run".
-- Pode rodar mais de uma vez sem problema.

-- Uma linha por conta, com todos os dados da loja daquela conta (fornecedores, preços,
-- regras, estoque, vendas, perfil e marca) num campo JSON.
create table if not exists public.dados_loja (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  conteudo jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Segurança: cada conta só vê e altera a própria linha (mesmo com a chave pública do app).
alter table public.dados_loja enable row level security;

drop policy if exists "dados_loja: ver os próprios" on public.dados_loja;
create policy "dados_loja: ver os próprios" on public.dados_loja
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "dados_loja: criar os próprios" on public.dados_loja;
create policy "dados_loja: criar os próprios" on public.dados_loja
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "dados_loja: alterar os próprios" on public.dados_loja;
create policy "dados_loja: alterar os próprios" on public.dados_loja
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "dados_loja: apagar os próprios" on public.dados_loja;
create policy "dados_loja: apagar os próprios" on public.dados_loja
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Atualiza a data da última alteração automaticamente
create or replace function public.dados_loja_tocar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists dados_loja_tocar on public.dados_loja;
create trigger dados_loja_tocar before update on public.dados_loja
  for each row execute function public.dados_loja_tocar();
