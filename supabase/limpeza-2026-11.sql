-- Limpeza do banco (17/11/2026): remove o que o app não usa mais.
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar de novo sem problema.
--
-- 1) Funções de equipe que o app não usa mais (cada loja tem um único usuário):
--    mudar papel, remover pessoa, cancelar convite e a de apoio delas (sobra_admin).
-- 2) Tabela antiga "dados_loja" (primeira versão do app, antes de existir "loja"). Os dados dela já foram
--    copiados para as lojas (dados_org) e ela ficou só como reserva.
--    TRAVA: só apaga se TODAS as contas que tinham dados lá já têm a loja com a cópia. Se faltar alguma,
--    não apaga a tabela e avisa. Apagar não tem volta.

-- 1) funções de equipe sem uso
drop function if exists public.mudar_papel(uuid, uuid, text);
drop function if exists public.remover_membro(uuid, uuid);
drop function if exists public.cancelar_convite(uuid, text);
drop function if exists public.sobra_admin(uuid, uuid);

-- 2) tabela antiga dados_loja
do $$
declare
  faltando integer;
begin
  if to_regclass('public.dados_loja') is null then
    raise notice 'A tabela antiga dados_loja já não existe.';
    return;
  end if;

  select count(*) into faltando
    from public.dados_loja d
   where not exists (select 1 from public.organizacoes g where g.migrada_de = d.user_id);

  if faltando > 0 then
    raise exception 'Não apaguei a tabela antiga: % conta(s) dela ainda não têm a loja com os dados copiados. As funções de equipe já foram removidas.', faltando;
  end if;

  drop trigger if exists dados_loja_tocar on public.dados_loja;
  drop table public.dados_loja;
  drop function if exists public.dados_loja_tocar();
  raise notice 'Pronto: tabela antiga dados_loja apagada.';
end $$;

-- Conferência final (só mostra): deve vir vazia
select 'sobrou: ' || p.proname as item
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('mudar_papel', 'remover_membro', 'cancelar_convite', 'sobra_admin', 'dados_loja_tocar')
union all
select 'sobrou: tabela dados_loja' where to_regclass('public.dados_loja') is not null;
