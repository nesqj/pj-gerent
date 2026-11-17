-- Limpeza do banco (17/11/2026). Rode UMA vez no Supabase: SQL Editor → New query → cole tudo → Run.
--
-- Apaga a tabela antiga "dados_loja" (da primeira versão do app, quando cada conta tinha os dados soltos,
-- antes de existir "loja"). O app não usa mais essa tabela: os dados dela foram copiados para as lojas
-- (tabela dados_org) e ela ficou só como reserva.
--
-- TRAVA DE SEGURANÇA: só apaga se TODAS as contas que tinham dados lá já ganharam a loja com a cópia.
-- Se faltar alguma, não apaga nada e avisa. Apagar não tem volta.

do $$
declare
  faltando integer;
begin
  if to_regclass('public.dados_loja') is null then
    raise notice 'A tabela dados_loja já não existe. Nada a fazer.';
    return;
  end if;

  select count(*) into faltando
    from public.dados_loja d
   where not exists (select 1 from public.organizacoes g where g.migrada_de = d.user_id);

  if faltando > 0 then
    raise exception 'Não apaguei nada: % conta(s) da tabela antiga ainda não têm a loja com os dados copiados.', faltando;
  end if;

  drop trigger if exists dados_loja_tocar on public.dados_loja;
  drop table public.dados_loja;
  drop function if exists public.dados_loja_tocar();
  raise notice 'Pronto: tabela antiga dados_loja apagada.';
end $$;
