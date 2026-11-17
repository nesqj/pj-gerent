-- Correções de segurança (17/11/2026). Rode UMA vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema (só recria as funções).
--
-- 1) Cada loja tem um único usuário: só o dono da loja (papel "admin") grava os dados dela,
--    e só o administrador da plataforma coloca ou tira pessoas de uma loja.
-- 2) Senha do servidor de cobrança: se a configuração não existir, recusa (antes passaria).

-- Só o administrador da plataforma mexe na equipe de uma loja (antes o dono da loja também podia)
create or replace function public.pode_gerir_equipe(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.e_admin_plataforma()
$$;

-- Salvar os dados da loja: só o dono (admin) ou o administrador da plataforma.
-- Antes gerente e vendedor também gravavam a loja inteira; as limitações deles eram conferidas só no app.
create or replace function public.salvar_dados(o uuid, novo_conteudo jsonb, versao_esperada integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  p text := public.papel_na_org(o);
  nova_versao integer;
begin
  if not (public.e_admin_plataforma() or coalesce(p = 'admin', false)) then
    if exists (select 1 from public.organizacoes where id = o and suspensa) then raise exception 'loja-suspensa'; end if;
    raise exception 'sem-permissao';
  end if;
  if jsonb_typeof(novo_conteudo) <> 'object' then raise exception 'conteudo-invalido'; end if;

  insert into public.dados_org (org_id) values (o) on conflict do nothing;
  update public.dados_org
     set conteudo = novo_conteudo, versao = versao + 1, atualizado_em = now(), atualizado_por = auth.uid()
   where org_id = o and versao = versao_esperada
  returning versao into nova_versao;
  if nova_versao is null then raise exception 'conflito'; end if;
  return nova_versao;
end $$;

-- Senha do servidor: "is distinct from" também recusa quando a senha guardada não existe (null)
create or replace function public.srv_conferir(segredo text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if segredo is null or segredo is distinct from (select segredo_servidor from public.cobranca_config where id) then
    raise exception 'segredo-invalido';
  end if;
end $$;

-- Conferência (só mostra, não muda nada): pessoas que estão numa loja sem ser o dono.
-- Se aparecer alguém aqui, essa pessoa agora só consegue ver a loja, não alterar.
select g.nome as loja, u.email, m.papel
  from public.membros m
  join public.organizacoes g on g.id = m.org_id
  join auth.users u on u.id = m.user_id
 where m.papel <> 'admin'
 order by g.nome;
