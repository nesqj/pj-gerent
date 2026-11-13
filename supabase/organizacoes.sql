-- PJ GERENT — lojas (organizações), equipe, convites, painel da plataforma e cobrança
-- Como usar: depois do esquema.sql, abra "SQL Editor" no Supabase, cole este arquivo inteiro e clique em "Run".
-- Pode rodar mais de uma vez sem problema.
--
-- NÃO APAGA NADA. Os dados que cada conta já tinha (tabela dados_loja) são COPIADOS para uma loja
-- nova daquela conta, com ela como administradora. A tabela dados_loja continua lá, intacta, como reserva.
--
-- Papéis numa loja:
--   admin     tudo, inclusive a equipe e restaurar cópia de segurança
--   gerente   tudo, menos a equipe e restaurar cópia de segurança
--   vendedor  registra vendas e entradas no estoque; o resto só vê
--   leitor    só vê
-- Administrador da plataforma: vê e administra todas as lojas (painel "Admin Plataforma").

-- ============================================================ tabelas

create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  suspensa boolean not null default false,
  criada_em timestamptz not null default now(),
  criada_por uuid references auth.users (id) on delete set null,
  migrada_de uuid unique -- conta cujos dados antigos (dados_loja) deram origem a esta loja
);

create table if not exists public.membros (
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel text not null check (papel in ('admin', 'gerente', 'vendedor', 'leitor')),
  criado_em timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists membros_user_id on public.membros (user_id);

-- Convite para quem ainda não tem conta: vira membro ao criar a conta com este e-mail
create table if not exists public.convites (
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%@%'),
  papel text not null check (papel in ('admin', 'gerente', 'vendedor', 'leitor')),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  primary key (org_id, email)
);
create index if not exists convites_email on public.convites (email);

-- Dados de cada loja (fornecedores, preços, regras, estoque, vendas e marca) num campo JSON.
-- "versao" sobe a cada salvamento: impede que um aparelho com dados velhos apague o que outro salvou.
create table if not exists public.dados_org (
  org_id uuid primary key references public.organizacoes (id) on delete cascade,
  conteudo jsonb not null default '{}'::jsonb,
  versao integer not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

create table if not exists public.admins_plataforma (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

-- Configuração da plataforma (uma linha só) — quem pode criar conta:
--   somente_convite = true   só entra quem foi colocado numa loja; sem convite, vê um aviso
--   somente_convite = false e aprovacao = true    quem chega sem convite pede a loja e espera sua aprovação
--   somente_convite = false e aprovacao = false   quem chega sem convite ganha uma loja própria na hora
-- ("cadastro" é a coluna da primeira versão; fica acompanhando somente_convite)
create table if not exists public.config_plataforma (
  id boolean primary key default true check (id),
  cadastro text not null default 'convite' check (cadastro in ('convite', 'aberto')),
  atualizado_em timestamptz not null default now()
);
insert into public.config_plataforma (id) values (true) on conflict do nothing;
alter table public.config_plataforma add column if not exists somente_convite boolean not null default true;
alter table public.config_plataforma add column if not exists aprovacao boolean not null default false;
update public.config_plataforma set somente_convite = false where cadastro = 'aberto' and somente_convite;

-- Pedidos de quem criou conta sem convite (com o cadastro com aprovação ligado)
create table if not exists public.pedidos_cadastro (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'recusado')),
  decidido_em timestamptz,
  decidido_por uuid references auth.users (id) on delete set null
);

-- Auditoria: quem fez o quê e quando. Não dá para alterar nem apagar pelo app.
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  org_id uuid references public.organizacoes (id) on delete set null,
  org_nome text,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  acao text not null check (char_length(acao) <= 60),
  detalhe text check (char_length(detalhe) <= 300)
);
create index if not exists auditoria_criado_em on public.auditoria (criado_em desc);
create index if not exists auditoria_org on public.auditoria (org_id, criado_em desc);

-- ============================================================ funções de apoio
-- "security definer": rodam com poder de dono, mas cada uma confere quem está chamando.

create or replace function public.e_admin_plataforma() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins_plataforma where user_id = (select auth.uid()))
$$;

-- Papel de quem chama numa loja (null se não é membro ou se a loja está suspensa)
create or replace function public.papel_na_org(o uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.papel from public.membros m join public.organizacoes g on g.id = m.org_id
  where m.org_id = o and m.user_id = (select auth.uid()) and not g.suspensa
$$;

-- É membro (mesmo com a loja suspensa)?
create or replace function public.e_membro(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros where org_id = o and user_id = (select auth.uid()))
$$;

-- Pode administrar a equipe da loja?
create or replace function public.pode_gerir_equipe(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.e_admin_plataforma() or coalesce(public.papel_na_org(o) = 'admin', false)
$$;

-- Registra na auditoria (e-mail e nome da loja preenchidos aqui, não pelo app)
create or replace function public.auditar(o uuid, a text, d text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (org_id, org_nome, user_id, email, acao, detalhe)
  values (o, (select nome from public.organizacoes where id = o), auth.uid(),
          (select email from auth.users where id = auth.uid()), left(a, 60), left(d, 300));
end $$;

-- Gatilho: a auditoria gravada direto pelo app também tem quem e quando conferidos pelo banco
create or replace function public.auditoria_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.criado_em := now();
  new.user_id := auth.uid();
  new.email := (select email from auth.users where id = auth.uid());
  new.org_nome := (select nome from public.organizacoes where id = new.org_id);
  return new;
end $$;
drop trigger if exists auditoria_conferir on public.auditoria;
create trigger auditoria_conferir before insert on public.auditoria
  for each row execute function public.auditoria_conferir();

-- ============================================================ segurança (RLS)

alter table public.organizacoes enable row level security;
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.dados_org enable row level security;
alter table public.admins_plataforma enable row level security;
alter table public.config_plataforma enable row level security;
alter table public.pedidos_cadastro enable row level security; -- sem regras de leitura: só pelas funções
alter table public.auditoria enable row level security;

-- Leitura direta. Gravações nas tabelas de lojas/equipe acontecem só pelas funções abaixo.
drop policy if exists "organizacoes: ver" on public.organizacoes;
create policy "organizacoes: ver" on public.organizacoes for select to authenticated
  using (public.e_admin_plataforma() or public.e_membro(id));

drop policy if exists "membros: ver" on public.membros;
create policy "membros: ver" on public.membros for select to authenticated
  using (public.e_admin_plataforma() or public.e_membro(org_id));

drop policy if exists "convites: ver" on public.convites;
create policy "convites: ver" on public.convites for select to authenticated
  using (public.pode_gerir_equipe(org_id));

drop policy if exists "dados_org: ver" on public.dados_org;
create policy "dados_org: ver" on public.dados_org for select to authenticated
  using (public.e_admin_plataforma() or public.papel_na_org(org_id) is not null);

drop policy if exists "admins_plataforma: ver" on public.admins_plataforma;
create policy "admins_plataforma: ver" on public.admins_plataforma for select to authenticated
  using (public.e_admin_plataforma() or user_id = (select auth.uid()));

drop policy if exists "config_plataforma: ver" on public.config_plataforma;
create policy "config_plataforma: ver" on public.config_plataforma for select to authenticated using (true);

drop policy if exists "auditoria: ver" on public.auditoria;
create policy "auditoria: ver" on public.auditoria for select to authenticated
  using (public.e_admin_plataforma() or coalesce(public.papel_na_org(org_id) = 'admin', false));

drop policy if exists "auditoria: registrar" on public.auditoria;
create policy "auditoria: registrar" on public.auditoria for insert to authenticated
  with check (public.e_admin_plataforma() or public.papel_na_org(org_id) is not null);

-- ============================================================ funções usadas pelo app

-- Chamada ao entrar: aceita convites do e-mail, cria o 1º administrador da plataforma
-- (se ainda não houver nenhum) e, para quem não tem loja, segue o modo de cadastro:
-- só convite → nada; com aprovação → registra o pedido; aberto → cria a loja.
create or replace function public.entrar_na_plataforma() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
  meu_email text;
  meu_nome text;
  virou_admin boolean := false;
  nova uuid;
  c record;
  cfg record;
begin
  if eu is null then raise exception 'sem-sessao'; end if;
  select lower(email), coalesce(nullif(btrim(raw_user_meta_data->>'nome'), ''), split_part(email, '@', 1))
    into meu_email, meu_nome from auth.users where id = eu;

  if not exists (select 1 from public.admins_plataforma) then
    insert into public.admins_plataforma (user_id) values (eu);
    virou_admin := true;
    perform public.auditar(null, 'admin.primeiro', meu_email);
  end if;

  for c in select * from public.convites where email = meu_email loop
    insert into public.membros (org_id, user_id, papel) values (c.org_id, eu, c.papel) on conflict do nothing;
    delete from public.convites where org_id = c.org_id and email = c.email;
    perform public.auditar(c.org_id, 'convite.aceito', meu_email);
  end loop;

  select * into cfg from public.config_plataforma;

  if exists (select 1 from public.membros where user_id = eu) then
    delete from public.pedidos_cadastro where user_id = eu; -- já tem loja: pedido antigo não vale mais
  elsif virou_admin or (not cfg.somente_convite and not cfg.aprovacao) then
    insert into public.organizacoes (nome, criada_por) values (left('Loja de ' || meu_nome, 60), eu) returning id into nova;
    insert into public.membros (org_id, user_id, papel) values (nova, eu, 'admin');
    insert into public.dados_org (org_id, atualizado_por) values (nova, eu);
    perform public.auditar(nova, 'org.criada', 'primeiro acesso');
  elsif not cfg.somente_convite and cfg.aprovacao then
    insert into public.pedidos_cadastro (user_id) values (eu) on conflict do nothing;
    if found then perform public.auditar(null, 'pedido.criado', meu_email); end if;
  end if;

  return jsonb_build_object(
    'admin', public.e_admin_plataforma(),
    'pedido', (select situacao from public.pedidos_cadastro where user_id = eu));
end $$;

-- Lojas de quem chama (o seletor do topo)
drop function if exists public.minhas_orgs(); -- a parte 2 recria com a situação da cobrança
create function public.minhas_orgs() returns table (id uuid, nome text, suspensa boolean, papel text, criada_por_mim boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.nome, g.suspensa, m.papel, g.criada_por = auth.uid()
  from public.membros m join public.organizacoes g on g.id = m.org_id
  where m.user_id = auth.uid()
  order by g.nome
$$;

-- Salva os dados da loja. Se outra pessoa salvou antes (versão diferente), recusa com "conflito"
-- e o app busca a versão nova, refaz a alteração e tenta de novo.
create or replace function public.salvar_dados(o uuid, novo_conteudo jsonb, versao_esperada integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  p text := public.papel_na_org(o);
  nova_versao integer;
begin
  -- coalesce: sem papel, "p in (...)" dá null, e "not null" não bloquearia
  if not (public.e_admin_plataforma() or coalesce(p in ('admin', 'gerente', 'vendedor'), false)) then
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

-- ---------- equipe da loja (admin da loja ou da plataforma)

create or replace function public.equipe_da_org(o uuid)
returns table (user_id uuid, email text, nome text, papel text, criado_em timestamptz, ultimo_acesso timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.e_admin_plataforma() or public.e_membro(o)) then raise exception 'sem-permissao'; end if;
  return query
    select m.user_id, u.email::text, coalesce(u.raw_user_meta_data->'perfil'->>'nome', u.raw_user_meta_data->>'nome', '')::text,
           m.papel, m.criado_em, u.last_sign_in_at
    from public.membros m join auth.users u on u.id = m.user_id
    where m.org_id = o
    order by m.criado_em;
end $$;

-- Põe alguém na loja pelo e-mail. Sem conta ainda: fica como convite.
create or replace function public.adicionar_membro(o uuid, email_pessoa text, novo_papel text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(btrim(email_pessoa));
  alvo uuid;
begin
  if not public.pode_gerir_equipe(o) then raise exception 'sem-permissao'; end if;
  if novo_papel not in ('admin', 'gerente', 'vendedor', 'leitor') then raise exception 'papel-invalido'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email-invalido'; end if;
  select id into alvo from auth.users where lower(email) = e;
  if alvo is not null then
    if exists (select 1 from public.membros where org_id = o and user_id = alvo) then return 'ja-membro'; end if;
    perform public.conferir_limite_pessoas(o); -- limite de pessoas do plano (parte 2)
    insert into public.membros (org_id, user_id, papel) values (o, alvo, novo_papel);
    perform public.auditar(o, 'membro.adicionado', e || ' (' || novo_papel || ')');
    return 'adicionado';
  end if;
  if not exists (select 1 from public.convites where org_id = o and email = e) then perform public.conferir_limite_pessoas(o); end if;
  insert into public.convites (org_id, email, papel, criado_por) values (o, e, novo_papel, auth.uid())
    on conflict (org_id, email) do update set papel = excluded.papel, criado_em = now(), criado_por = excluded.criado_por;
  perform public.auditar(o, 'convite.criado', e || ' (' || novo_papel || ')');
  return 'convidado';
end $$;

-- Impede que a loja fique sem nenhum administrador
create or replace function public.sobra_admin(o uuid, sem uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros where org_id = o and papel = 'admin' and user_id <> sem)
$$;

create or replace function public.mudar_papel(o uuid, pessoa uuid, novo_papel text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_gerir_equipe(o) then raise exception 'sem-permissao'; end if;
  if novo_papel not in ('admin', 'gerente', 'vendedor', 'leitor') then raise exception 'papel-invalido'; end if;
  if novo_papel <> 'admin' and not public.sobra_admin(o, pessoa) then raise exception 'ultimo-admin'; end if;
  update public.membros set papel = novo_papel where org_id = o and user_id = pessoa;
  perform public.auditar(o, 'membro.papel', (select email from auth.users where id = pessoa) || ' → ' || novo_papel);
end $$;

create or replace function public.remover_membro(o uuid, pessoa uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_gerir_equipe(o) then raise exception 'sem-permissao'; end if;
  if not public.sobra_admin(o, pessoa) then raise exception 'ultimo-admin'; end if;
  delete from public.membros where org_id = o and user_id = pessoa;
  perform public.auditar(o, 'membro.removido', (select email from auth.users where id = pessoa));
end $$;

create or replace function public.cancelar_convite(o uuid, email_pessoa text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_gerir_equipe(o) then raise exception 'sem-permissao'; end if;
  delete from public.convites where org_id = o and email = lower(btrim(email_pessoa));
  perform public.auditar(o, 'convite.cancelado', lower(btrim(email_pessoa)));
end $$;

-- ---------- painel da plataforma (só administradores da plataforma)

create or replace function public.exigir_admin_plataforma() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.e_admin_plataforma() then raise exception 'sem-permissao'; end if;
end $$;

create or replace function public.criar_org(nome_loja text, email_admin text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare nova uuid;
begin
  perform public.exigir_admin_plataforma();
  insert into public.organizacoes (nome, criada_por) values (btrim(nome_loja), auth.uid()) returning id into nova;
  insert into public.dados_org (org_id, atualizado_por) values (nova, auth.uid());
  perform public.auditar(nova, 'org.criada', btrim(nome_loja));
  if nullif(btrim(email_admin), '') is not null then perform public.adicionar_membro(nova, email_admin, 'admin'); end if;
  return nova;
end $$;

create or replace function public.renomear_org(o uuid, novo_nome text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  update public.organizacoes set nome = btrim(novo_nome) where id = o;
  perform public.auditar(o, 'org.renomeada', btrim(novo_nome));
end $$;

create or replace function public.suspender_org(o uuid, suspender boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  update public.organizacoes set suspensa = suspender where id = o;
  perform public.auditar(o, case when suspender then 'org.suspensa' else 'org.reativada' end, null);
end $$;

-- Excluir apaga a loja e TODOS os dados dela. Só vale para loja suspensa e com o nome digitado certo.
create or replace function public.excluir_org(o uuid, nome_digitado text) returns void
language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  perform public.exigir_admin_plataforma();
  select * into g from public.organizacoes where id = o;
  if g is null then return; end if;
  if not g.suspensa then raise exception 'suspenda-antes'; end if;
  if btrim(nome_digitado) is distinct from g.nome then raise exception 'nome-diferente'; end if;
  perform public.auditar(o, 'org.excluida', g.nome);
  delete from public.organizacoes where id = o;
end $$;

-- Números de cada loja (telas Dashboard e Uso)
create or replace function public.uso_das_orgs()
returns table (id uuid, nome text, suspensa boolean, criada_em timestamptz, membros integer, convites integer,
               fornecedores integer, produtos integer, vendas integer, vendas_30d integer,
               faturamento numeric, faturamento_30d numeric, atualizado_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare limite text := to_char(now() - interval '30 days', 'YYYY-MM-DD');
begin
  perform public.exigir_admin_plataforma();
  return query
    select g.id, g.nome, g.suspensa, g.criada_em,
      (select count(*)::int from public.membros m where m.org_id = g.id),
      (select count(*)::int from public.convites c where c.org_id = g.id),
      coalesce(jsonb_array_length(case when jsonb_typeof(d.conteudo->'fornecedores') = 'array' then d.conteudo->'fornecedores' end), 0),
      coalesce(jsonb_array_length(case when jsonb_typeof(d.conteudo->'precosForn') = 'array' then d.conteudo->'precosForn' end), 0),
      coalesce(jsonb_array_length(case when jsonb_typeof(d.conteudo->'vendas') = 'array' then d.conteudo->'vendas' end), 0),
      (select count(*)::int from jsonb_array_elements(case when jsonb_typeof(d.conteudo->'vendas') = 'array' then d.conteudo->'vendas' else '[]'::jsonb end) v
        where v->>'dia' >= limite),
      (select coalesce(sum((v->>'total')::numeric), 0) from jsonb_array_elements(case when jsonb_typeof(d.conteudo->'vendas') = 'array' then d.conteudo->'vendas' else '[]'::jsonb end) v
        where (v->>'total') ~ '^-?[0-9.]+$'),
      (select coalesce(sum((v->>'total')::numeric), 0) from jsonb_array_elements(case when jsonb_typeof(d.conteudo->'vendas') = 'array' then d.conteudo->'vendas' else '[]'::jsonb end) v
        where (v->>'total') ~ '^-?[0-9.]+$' and v->>'dia' >= limite),
      d.atualizado_em
    from public.organizacoes g left join public.dados_org d on d.org_id = g.id
    order by g.nome;
end $$;

-- Todos os usuários (tela Usuários)
create or replace function public.listar_usuarios()
returns table (id uuid, email text, nome text, criado_em timestamptz, ultimo_acesso timestamptz, confirmado boolean,
               admin_plataforma boolean, lojas jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  return query
    select u.id, u.email::text, coalesce(u.raw_user_meta_data->'perfil'->>'nome', u.raw_user_meta_data->>'nome', '')::text,
      u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
      exists (select 1 from public.admins_plataforma a where a.user_id = u.id),
      coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome, 'papel', m.papel) order by g.nome)
                from public.membros m join public.organizacoes g on g.id = m.org_id where m.user_id = u.id), '[]'::jsonb)
    from auth.users u
    order by u.created_at;
end $$;

create or replace function public.listar_admins()
returns table (user_id uuid, email text, nome text, criado_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  return query
    select a.user_id, u.email::text, coalesce(u.raw_user_meta_data->'perfil'->>'nome', u.raw_user_meta_data->>'nome', '')::text, a.criado_em
    from public.admins_plataforma a join auth.users u on u.id = a.user_id
    order by a.criado_em;
end $$;

-- Só para quem já tem conta
create or replace function public.adicionar_admin(email_pessoa text) returns void
language plpgsql security definer set search_path = '' as $$
declare alvo uuid;
begin
  perform public.exigir_admin_plataforma();
  select id into alvo from auth.users where lower(email) = lower(btrim(email_pessoa));
  if alvo is null then raise exception 'sem-conta'; end if;
  insert into public.admins_plataforma (user_id) values (alvo) on conflict do nothing;
  perform public.auditar(null, 'admin.adicionado', lower(btrim(email_pessoa)));
end $$;

create or replace function public.remover_admin(pessoa uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  if not exists (select 1 from public.admins_plataforma where user_id <> pessoa) then raise exception 'ultimo-admin-plataforma'; end if;
  delete from public.admins_plataforma where user_id = pessoa;
  perform public.auditar(null, 'admin.removido', (select email from auth.users where id = pessoa));
end $$;

drop function if exists public.definir_cadastro(text); -- versão antiga (um modo só)
create or replace function public.definir_cadastro(so_convite boolean, com_aprovacao boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  if so_convite is null or com_aprovacao is null then raise exception 'modo-invalido'; end if;
  update public.config_plataforma
     set somente_convite = so_convite, aprovacao = com_aprovacao,
         cadastro = case when so_convite then 'convite' else 'aberto' end, atualizado_em = now() where id; -- o Supabase recusa UPDATE sem WHERE
  perform public.auditar(null, 'cadastro.modo',
    case when so_convite then 'só convite' when com_aprovacao then 'com aprovação' else 'aberto' end);
end $$;

-- Pedidos de cadastro (pendentes e recusados)
create or replace function public.listar_pedidos()
returns table (user_id uuid, email text, nome text, criado_em timestamptz, situacao text, decidido_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  return query
    select p.user_id, u.email::text, coalesce(u.raw_user_meta_data->'perfil'->>'nome', u.raw_user_meta_data->>'nome', '')::text,
           p.criado_em, p.situacao, p.decidido_em
    from public.pedidos_cadastro p join auth.users u on u.id = p.user_id
    order by p.situacao, p.criado_em;
end $$;

-- Aprovar cria a loja e torna quem pediu administrador dela
create or replace function public.aprovar_pedido(pessoa uuid, nome_loja text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare nova uuid;
begin
  perform public.exigir_admin_plataforma();
  if not exists (select 1 from public.pedidos_cadastro where user_id = pessoa) then raise exception 'sem-pedido'; end if;
  insert into public.organizacoes (nome, criada_por) values (btrim(nome_loja), pessoa) returning id into nova;
  insert into public.membros (org_id, user_id, papel) values (nova, pessoa, 'admin');
  insert into public.dados_org (org_id, atualizado_por) values (nova, pessoa);
  delete from public.pedidos_cadastro where user_id = pessoa;
  perform public.auditar(nova, 'pedido.aprovado', (select email from auth.users where id = pessoa));
  return nova;
end $$;

create or replace function public.recusar_pedido(pessoa uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  update public.pedidos_cadastro set situacao = 'recusado', decidido_em = now(), decidido_por = auth.uid() where user_id = pessoa;
  perform public.auditar(null, 'pedido.recusado', (select email from auth.users where id = pessoa));
end $$;

-- ============================================================ permissões das funções
-- Ninguém sem login chama nada; as funções internas não ficam expostas.

do $$
declare f text;
begin
  foreach f in array array[
    'e_admin_plataforma()', 'papel_na_org(uuid)', 'e_membro(uuid)', 'pode_gerir_equipe(uuid)',
    'auditar(uuid, text, text)', 'auditoria_conferir()', 'sobra_admin(uuid, uuid)', 'exigir_admin_plataforma()',
    'entrar_na_plataforma()', 'minhas_orgs()', 'salvar_dados(uuid, jsonb, integer)', 'equipe_da_org(uuid)',
    'adicionar_membro(uuid, text, text)', 'mudar_papel(uuid, uuid, text)', 'remover_membro(uuid, uuid)',
    'cancelar_convite(uuid, text)', 'criar_org(text, text)', 'renomear_org(uuid, text)', 'suspender_org(uuid, boolean)',
    'excluir_org(uuid, text)', 'uso_das_orgs()', 'listar_usuarios()', 'listar_admins()', 'adicionar_admin(text)',
    'remover_admin(uuid)', 'definir_cadastro(boolean, boolean)', 'listar_pedidos()', 'aprovar_pedido(uuid, text)',
    'recusar_pedido(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
  end loop;
  -- funções que o app chama (as de apoio usadas nas regras de segurança também precisam)
  foreach f in array array[
    'e_admin_plataforma()', 'papel_na_org(uuid)', 'e_membro(uuid)', 'pode_gerir_equipe(uuid)',
    'entrar_na_plataforma()', 'minhas_orgs()', 'salvar_dados(uuid, jsonb, integer)', 'equipe_da_org(uuid)',
    'adicionar_membro(uuid, text, text)', 'mudar_papel(uuid, uuid, text)', 'remover_membro(uuid, uuid)',
    'cancelar_convite(uuid, text)', 'criar_org(text, text)', 'renomear_org(uuid, text)', 'suspender_org(uuid, boolean)',
    'excluir_org(uuid, text)', 'uso_das_orgs()', 'listar_usuarios()', 'listar_admins()', 'adicionar_admin(text)',
    'remover_admin(uuid)', 'definir_cadastro(boolean, boolean)', 'listar_pedidos()', 'aprovar_pedido(uuid, text)',
    'recusar_pedido(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============================================================ trazer os dados antigos (sem apagar)
-- Cada conta que tinha dados em dados_loja ganha uma loja com esses dados, e vira admin dela.
-- O primeiro usuário cadastrado vira administrador da plataforma, se ainda não houver nenhum.

do $$
declare
  r record;
  nova uuid;
begin
  for r in
    select d.user_id, d.conteudo from public.dados_loja d
    where not exists (select 1 from public.organizacoes g where g.migrada_de = d.user_id)
  loop
    insert into public.organizacoes (nome, criada_por, migrada_de)
    values (left(coalesce(nullif(btrim(r.conteudo->'config'->>'nomeLoja'), ''), 'Minha loja'), 60), r.user_id, r.user_id)
    returning id into nova;
    insert into public.membros (org_id, user_id, papel) values (nova, r.user_id, 'admin');
    insert into public.dados_org (org_id, conteudo, atualizado_por) values (nova, r.conteudo, r.user_id);
  end loop;

  if not exists (select 1 from public.admins_plataforma) then
    insert into public.admins_plataforma (user_id)
    select id from auth.users order by created_at limit 1;
  end if;
end $$;

-- ################################################################################################
-- PARTE 2 — cadastro das lojas, marca da plataforma e cobrança (Stripe ou Asaas)
-- (fica no fim do arquivo: o que é redefinido aqui vale sobre a versão de cima)
-- ################################################################################################

-- ============================================================ cadastro das lojas e marca da plataforma

-- Cadastro da loja: { razao_social, cnpj, contato_nome, contato_email, contato_telefone, cidade, uf, observacoes }
alter table public.organizacoes add column if not exists cadastro jsonb not null default '{}'::jsonb;

-- Marca da plataforma (vale para o login e para as lojas sem marca própria):
-- { nome, cor, corEscuro, logo, logoEscuro, tema }
alter table public.config_plataforma add column if not exists marca jsonb not null default '{}'::jsonb;

-- ============================================================ cobrança: tabelas

-- Configuração (uma linha só). Tem segredos: ninguém lê direto, só pelas funções abaixo.
create table if not exists public.cobranca_config (
  id boolean primary key default true check (id),
  ligada boolean not null default false,
  provedor text check (provedor in ('stripe', 'asaas')),
  tolerancia_dias integer not null default 7 check (tolerancia_dias between 5 and 30),
  -- senha que as funções de servidor (Vercel) usam para falar com o banco; copie para COBRANCA_SEGREDO
  segredo_servidor text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  modo_teste boolean,
  webhook_id text,
  webhook_segredo text,  -- Stripe: segredo de assinatura do aviso; Asaas: token do aviso
  webhook_url text,
  conectado_em timestamptz,
  atualizado_em timestamptz not null default now()
);
insert into public.cobranca_config (id) values (true) on conflict do nothing;

create table if not exists public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  preco_centavos integer not null check (preco_centavos >= 500),
  intervalo text not null default 'mensal' check (intervalo in ('mensal', 'anual')),
  dias_teste integer not null default 14 check (dias_teste between 0 and 90),
  max_pessoas integer check (max_pessoas is null or max_pessoas >= 1),
  visivel boolean not null default true,   -- false: "só você atribui" (plano negociado)
  padrao boolean not null default false,   -- plano de quem entra sozinho
  arquivado_em timestamptz,
  criado_em timestamptz not null default now()
);
create unique index if not exists planos_um_padrao on public.planos (padrao) where padrao;

-- Assinatura de cada loja. Loja sem linha aqui = isenta (usa de graça, sem limite).
create table if not exists public.assinaturas (
  org_id uuid primary key references public.organizacoes (id) on delete cascade,
  plano_id uuid references public.planos (id),
  isenta boolean not null default false,
  teste_ate timestamptz,          -- fim do teste grátis (null = sem teste: entrada paga)
  pago_ate timestamptz,           -- até quando está pago
  provedor text check (provedor in ('stripe', 'asaas', 'manual')),
  cliente_ref text,               -- id do cliente no provedor
  assinatura_ref text,            -- id da assinatura no provedor
  link_pagamento text,
  cancelada_em timestamptz,
  criada_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists assinaturas_ref on public.assinaturas (assinatura_ref);
create index if not exists assinaturas_cliente on public.assinaturas (cliente_ref);

create table if not exists public.pagamentos (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizacoes (id) on delete set null,
  org_nome text,
  valor_centavos integer not null,
  pago_em timestamptz not null default now(),
  cobre_ate timestamptz,
  provedor text not null,
  referencia text,
  observacao text check (char_length(observacao) <= 200),
  registrado_por uuid references auth.users (id) on delete set null
);
create unique index if not exists pagamentos_referencia on public.pagamentos (provedor, referencia) where referencia is not null;
create index if not exists pagamentos_org on public.pagamentos (org_id, pago_em desc);

-- Avisos de pagamento já processados (o provedor pode mandar o mesmo aviso mais de uma vez)
create table if not exists public.eventos_cobranca (
  provedor text not null,
  evento_id text not null,
  recebido_em timestamptz not null default now(),
  primary key (provedor, evento_id)
);

alter table public.cobranca_config enable row level security;   -- sem regras: só pelas funções
alter table public.eventos_cobranca enable row level security;  -- sem regras: só pelas funções
alter table public.planos enable row level security;
alter table public.assinaturas enable row level security;
alter table public.pagamentos enable row level security;

drop policy if exists "planos: ver" on public.planos;
create policy "planos: ver" on public.planos for select to authenticated
  using (public.e_admin_plataforma() or (visivel and arquivado_em is null));

drop policy if exists "assinaturas: ver" on public.assinaturas;
create policy "assinaturas: ver" on public.assinaturas for select to authenticated
  using (public.e_admin_plataforma() or public.e_membro(org_id));

drop policy if exists "pagamentos: ver" on public.pagamentos;
create policy "pagamentos: ver" on public.pagamentos for select to authenticated
  using (public.e_admin_plataforma()
         or exists (select 1 from public.membros m where m.org_id = pagamentos.org_id and m.user_id = (select auth.uid()) and m.papel = 'admin'));

-- ============================================================ cobrança: situação de cada loja
--   isenta      cobrança desligada, loja sem plano ou isenta
--   teste       no teste grátis
--   em_dia      pago
--   aguardando  plano sem teste grátis e ainda sem o primeiro pagamento (bloqueada até pagar)
--   atrasada    venceu, mas está dentro da tolerância (funciona, com aviso)
--   suspensa    passou da tolerância (bloqueada até pagar)

create or replace function public.situacao_cobranca(o uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not c.ligada or a.org_id is null or a.isenta or a.plano_id is null then 'isenta'
    when a.pago_ate is not null and a.pago_ate > now() then 'em_dia'
    when a.teste_ate is not null and a.teste_ate > now() then 'teste'
    when a.pago_ate is null and a.teste_ate is null then 'aguardando'
    when greatest(coalesce(a.teste_ate, '-infinity'::timestamptz), coalesce(a.pago_ate, '-infinity'::timestamptz))
         + make_interval(days => c.tolerancia_dias) >= now() then 'atrasada'
    else 'suspensa'
  end
  from public.cobranca_config c left join public.assinaturas a on a.org_id = o
$$;

create or replace function public.bloqueada_por_cobranca(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.situacao_cobranca(o) in ('suspensa', 'aguardando'), false)
$$;

-- Papel na loja agora também considera a cobrança: loja bloqueada por falta de pagamento fica sem acesso
-- (o administrador da plataforma continua entrando, e o administrador da loja continua podendo pagar).
create or replace function public.papel_na_org(o uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.papel from public.membros m join public.organizacoes g on g.id = m.org_id
  where m.org_id = o and m.user_id = (select auth.uid()) and not g.suspensa and not public.bloqueada_por_cobranca(o)
$$;

-- Pode ver e pagar a cobrança da loja (mesmo com ela bloqueada)?
create or replace function public.pode_pagar(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.e_admin_plataforma()
      or exists (select 1 from public.membros where org_id = o and user_id = (select auth.uid()) and papel = 'admin')
$$;

-- Lojas de quem chama (seletor do topo), agora com a situação da cobrança
drop function if exists public.minhas_orgs();
create function public.minhas_orgs()
returns table (id uuid, nome text, suspensa boolean, papel text, criada_por_mim boolean, cobranca text)
language sql stable security definer set search_path = '' as $$
  select g.id, g.nome, g.suspensa, m.papel, g.criada_por = auth.uid(), public.situacao_cobranca(g.id)
  from public.membros m join public.organizacoes g on g.id = m.org_id
  where m.user_id = auth.uid()
  order by g.nome
$$;

-- Limite de pessoas do plano (membros + convites)
create or replace function public.conferir_limite_pessoas(o uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare limite integer;
begin
  if public.situacao_cobranca(o) = 'isenta' then return; end if;
  select p.max_pessoas into limite from public.assinaturas a join public.planos p on p.id = a.plano_id where a.org_id = o;
  if limite is not null and
     (select count(*) from public.membros where org_id = o) + (select count(*) from public.convites where org_id = o) >= limite then
    raise exception 'limite-plano';
  end if;
end $$;

-- Toda loja nova nasce com o plano padrão (com a cobrança ligada e um plano padrão escolhido)
create or replace function public.org_nova_assinatura() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pl record;
begin
  if not coalesce((select ligada from public.cobranca_config), false) then return new; end if;
  select * into pl from public.planos where padrao and arquivado_em is null;
  if not found then return new; end if;
  insert into public.assinaturas (org_id, plano_id, teste_ate)
  values (new.id, pl.id, case when pl.dias_teste > 0 then now() + make_interval(days => pl.dias_teste) end)
  on conflict (org_id) do nothing;
  return new;
end $$;
drop trigger if exists org_nova_assinatura on public.organizacoes;
create trigger org_nova_assinatura after insert on public.organizacoes
  for each row when (new.migrada_de is null) execute function public.org_nova_assinatura();

-- ============================================================ cobrança: funções para as telas

-- Tudo da cobrança de uma loja (Configurações → Plano e cobrança, e a ficha da loja no painel)
create or replace function public.cobranca_da_org(o uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a record; p record; c record;
begin
  if not public.pode_pagar(o) then raise exception 'sem-permissao'; end if;
  select * into c from public.cobranca_config;
  select * into a from public.assinaturas where org_id = o;
  select * into p from public.planos where id = a.plano_id;
  return jsonb_build_object(
    'ligada', c.ligada,
    'provedor_config', c.provedor,
    'tolerancia_dias', c.tolerancia_dias,
    'situacao', public.situacao_cobranca(o),
    'isenta', coalesce(a.isenta, a.org_id is null),
    'plano', case when p.id is null then null else jsonb_build_object('id', p.id, 'nome', p.nome, 'preco_centavos', p.preco_centavos,
              'intervalo', p.intervalo, 'dias_teste', p.dias_teste, 'max_pessoas', p.max_pessoas) end,
    'teste_ate', a.teste_ate, 'pago_ate', a.pago_ate, 'provedor', a.provedor,
    'tem_assinatura', a.assinatura_ref is not null, 'link_pagamento', a.link_pagamento, 'cancelada_em', a.cancelada_em,
    'pessoas', (select count(*) from public.membros where org_id = o) + (select count(*) from public.convites where org_id = o),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'valor_centavos', x.valor_centavos, 'pago_em', x.pago_em,
              'cobre_ate', x.cobre_ate, 'provedor', x.provedor, 'observacao', x.observacao) order by x.pago_em desc)
              from (select * from public.pagamentos where org_id = o order by pago_em desc limit 24) x), '[]'::jsonb));
end $$;

-- Troca de plano. Loja: só no teste grátis (ou sem assinatura no provedor). Administrador da plataforma: sempre.
-- Devolve se é preciso atualizar o valor no provedor.
create or replace function public.trocar_plano(o uuid, novo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a record; p record; antigo record; admin boolean := public.e_admin_plataforma(); s text := public.situacao_cobranca(o);
begin
  if not public.pode_pagar(o) then raise exception 'sem-permissao'; end if;
  select * into p from public.planos where id = novo and arquivado_em is null;
  if not found then raise exception 'plano-invalido'; end if;
  if not admin and not p.visivel then raise exception 'plano-invalido'; end if;
  select * into a from public.assinaturas where org_id = o;
  select * into antigo from public.planos where id = a.plano_id;
  if not admin and a.assinatura_ref is not null and s not in ('teste', 'aguardando') then raise exception 'troca-fale-com-admin'; end if;
  if not admin and s in ('atrasada', 'suspensa') then raise exception 'regularize-antes'; end if;
  if a.assinatura_ref is not null and antigo.intervalo is distinct from p.intervalo then raise exception 'intervalo-diferente'; end if;
  if p.max_pessoas is not null and
     (select count(*) from public.membros where org_id = o) + (select count(*) from public.convites where org_id = o) > p.max_pessoas then
    raise exception 'acima-do-plano';
  end if;
  if a.org_id is null then
    insert into public.assinaturas (org_id, plano_id, teste_ate)
    values (o, p.id, case when p.dias_teste > 0 then now() + make_interval(days => p.dias_teste) end);
  else
    update public.assinaturas set plano_id = p.id, isenta = false, atualizado_em = now() where org_id = o;
  end if;
  perform public.auditar(o, 'cobranca.plano', p.nome);
  return jsonb_build_object('sincronizar', a.assinatura_ref is not null, 'provedor', a.provedor);
end $$;

-- ---------- só o administrador da plataforma

create or replace function public.cobranca_config_admin() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record;
begin
  perform public.exigir_admin_plataforma();
  select * into c from public.cobranca_config;
  return jsonb_build_object('ligada', c.ligada, 'provedor', c.provedor, 'tolerancia_dias', c.tolerancia_dias,
    'modo_teste', c.modo_teste, 'conectado_em', c.conectado_em, 'webhook_url', c.webhook_url,
    'webhook_ok', c.webhook_segredo is not null, 'segredo_servidor', c.segredo_servidor,
    'assinaturas_no_provedor', (select count(*) from public.assinaturas where assinatura_ref is not null and cancelada_em is null));
end $$;

create or replace function public.definir_cobranca(ligar boolean, tolerancia integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  if ligar is null or tolerancia is null or tolerancia not between 5 and 30 then raise exception 'valor-invalido'; end if;
  update public.cobranca_config set ligada = ligar, tolerancia_dias = tolerancia, atualizado_em = now() where id; -- o Supabase recusa UPDATE sem WHERE
  perform public.auditar(null, 'cobranca.config', case when ligar then 'ligada' else 'desligada' end || ', tolerância ' || tolerancia || ' dias');
end $$;

-- Escolher o provedor. Não deixa trocar com lojas pagando pelo provedor atual.
create or replace function public.definir_provedor(novo text) returns void
language plpgsql security definer set search_path = '' as $$
declare atual text := (select provedor from public.cobranca_config);
begin
  perform public.exigir_admin_plataforma();
  if novo not in ('stripe', 'asaas') then raise exception 'valor-invalido'; end if;
  if atual is not null and atual <> novo and exists (
       select 1 from public.assinaturas where provedor = atual and assinatura_ref is not null and cancelada_em is null) then
    raise exception 'provedor-em-uso';
  end if;
  if atual is distinct from novo then
    update public.cobranca_config set provedor = novo, modo_teste = null, webhook_id = null, webhook_segredo = null,
      webhook_url = null, conectado_em = null, atualizado_em = now() where id; -- o Supabase recusa UPDATE sem WHERE
    perform public.auditar(null, 'cobranca.provedor', novo);
  end if;
end $$;

-- Gera uma senha nova para as funções de servidor (depois, atualize COBRANCA_SEGREDO na Vercel)
create or replace function public.trocar_segredo_servidor() returns text
language plpgsql security definer set search_path = '' as $$
declare novo text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform public.exigir_admin_plataforma();
  update public.cobranca_config set segredo_servidor = novo where id; -- o Supabase recusa UPDATE sem WHERE
  perform public.auditar(null, 'cobranca.segredo', null);
  return novo;
end $$;

create or replace function public.salvar_plano(pid uuid, nome_plano text, preco integer, intervalo_plano text, dias integer,
                                               max_p integer, visivel_plano boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare atual record; novo_id uuid;
begin
  perform public.exigir_admin_plataforma();
  if pid is null then
    insert into public.planos (nome, preco_centavos, intervalo, dias_teste, max_pessoas, visivel)
    values (btrim(nome_plano), preco, intervalo_plano, dias, max_p, visivel_plano) returning id into novo_id;
    perform public.auditar(null, 'plano.criado', btrim(nome_plano));
    return novo_id;
  end if;
  select * into atual from public.planos where id = pid;
  if not found then raise exception 'plano-invalido'; end if;
  -- preço e intervalo travam quando alguém assina pelo provedor
  if (atual.preco_centavos <> preco or atual.intervalo <> intervalo_plano)
     and exists (select 1 from public.assinaturas where plano_id = pid and assinatura_ref is not null) then
    raise exception 'plano-travado';
  end if;
  update public.planos set nome = btrim(nome_plano), preco_centavos = preco, intervalo = intervalo_plano, dias_teste = dias,
    max_pessoas = max_p, visivel = visivel_plano where id = pid;
  perform public.auditar(null, 'plano.alterado', btrim(nome_plano));
  return pid;
end $$;

create or replace function public.plano_padrao(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  update public.planos set padrao = false where padrao;
  if pid is not null then
    update public.planos set padrao = true where id = pid and arquivado_em is null;
    if not found then raise exception 'plano-invalido'; end if;
  end if;
  perform public.auditar(null, 'plano.padrao', (select nome from public.planos where id = pid));
end $$;

create or replace function public.arquivar_plano(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  update public.planos set arquivado_em = now(), padrao = false where id = pid;
  perform public.auditar(null, 'plano.arquivado', (select nome from public.planos where id = pid));
end $$;

-- Lista de lojas com plano e situação (Cobrança → Visão geral / Assinaturas)
create or replace function public.cobranca_resumo()
returns table (org_id uuid, nome text, suspensa boolean, plano_id uuid, plano text, preco_centavos integer, intervalo text,
               situacao text, isenta boolean, teste_ate timestamptz, pago_ate timestamptz, provedor text, tem_assinatura boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  return query
    select g.id, g.nome, g.suspensa, p.id, p.nome, p.preco_centavos, p.intervalo, public.situacao_cobranca(g.id),
           coalesce(a.isenta, a.org_id is null), a.teste_ate, a.pago_ate, a.provedor, a.assinatura_ref is not null
    from public.organizacoes g
    left join public.assinaturas a on a.org_id = g.id
    left join public.planos p on p.id = a.plano_id
    order by g.nome;
end $$;

create or replace function public.isentar_loja(o uuid, isentar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  if isentar then
    update public.assinaturas set isenta = true, atualizado_em = now() where org_id = o;
  else
    update public.assinaturas set isenta = false, atualizado_em = now() where org_id = o;
    if not found then raise exception 'escolha-um-plano'; end if;
  end if;
  perform public.auditar(o, case when isentar then 'cobranca.isenta' else 'cobranca.cobrar' end, null);
end $$;

-- Pagamento recebido fora do sistema (Pix direto, dinheiro...): estende o pago até mais um período do plano
create or replace function public.marcar_pago(o uuid, valor integer, obs text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare a record; p record; base timestamptz; ate timestamptz;
begin
  perform public.exigir_admin_plataforma();
  select * into a from public.assinaturas where org_id = o;
  if not found or a.plano_id is null then raise exception 'escolha-um-plano'; end if;
  select * into p from public.planos where id = a.plano_id;
  base := greatest(now(), coalesce(a.pago_ate, now()), coalesce(a.teste_ate, now()));
  ate := base + case when p.intervalo = 'anual' then interval '1 year' else interval '1 month' end;
  update public.assinaturas set pago_ate = ate, provedor = coalesce(provedor, 'manual'), atualizado_em = now() where org_id = o;
  insert into public.pagamentos (org_id, org_nome, valor_centavos, cobre_ate, provedor, observacao, registrado_por)
  values (o, (select nome from public.organizacoes where id = o), coalesce(valor, p.preco_centavos), ate, 'manual', left(obs, 200), auth.uid());
  perform public.auditar(o, 'cobranca.pago-manual', to_char(ate, 'DD/MM/YYYY'));
  return ate;
end $$;

create or replace function public.estender_teste(o uuid, dias integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  if dias is null or dias not between 1 and 90 then raise exception 'valor-invalido'; end if;
  update public.assinaturas set teste_ate = greatest(coalesce(teste_ate, now()), now()) + make_interval(days => dias), atualizado_em = now()
  where org_id = o;
  if not found then raise exception 'escolha-um-plano'; end if;
  perform public.auditar(o, 'cobranca.teste', '+' || dias || ' dias');
end $$;

-- ---------- cadastro da loja e marca da plataforma

create or replace function public.salvar_cadastro_org(o uuid, dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  if jsonb_typeof(dados) <> 'object' or length(dados::text) > 4000 then raise exception 'valor-invalido'; end if;
  update public.organizacoes set cadastro = dados where id = o;
  perform public.auditar(o, 'org.cadastro', dados->>'razao_social');
end $$;

-- Marca da plataforma: qualquer um pode ler (a tela de login usa)
create or replace function public.marca_plataforma() returns jsonb
language sql stable security definer set search_path = '' as $$
  select marca from public.config_plataforma
$$;

create or replace function public.salvar_marca(m jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin_plataforma();
  if jsonb_typeof(m) <> 'object' or length(m::text) > 1600000 then raise exception 'valor-invalido'; end if;
  update public.config_plataforma set marca = m, atualizado_em = now() where id; -- o Supabase recusa UPDATE sem WHERE
  perform public.auditar(null, 'plataforma.marca', m->>'nome');
end $$;

-- ============================================================ cobrança: funções do servidor (Vercel)
-- Só funcionam com a senha do servidor (COBRANCA_SEGREDO). Ninguém do app consegue usar.

create or replace function public.srv_conferir(segredo text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if segredo is null or segredo <> (select segredo_servidor from public.cobranca_config) then raise exception 'segredo-invalido'; end if;
end $$;

create or replace function public.srv_config(segredo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record;
begin
  perform public.srv_conferir(segredo);
  select * into c from public.cobranca_config;
  return jsonb_build_object('ligada', c.ligada, 'provedor', c.provedor, 'webhook_id', c.webhook_id, 'webhook_segredo', c.webhook_segredo);
end $$;

create or replace function public.srv_salvar_conexao(segredo text, prov text, teste boolean, wid text, wsegredo text, wurl text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.srv_conferir(segredo);
  update public.cobranca_config set provedor = prov, modo_teste = teste, webhook_id = wid, webhook_segredo = wsegredo,
    webhook_url = wurl, conectado_em = now(), atualizado_em = now() where id; -- o Supabase recusa UPDATE sem WHERE
  insert into public.auditoria (acao, detalhe) values ('cobranca.conectada', prov || case when teste then ' (teste)' else '' end);
end $$;

-- O que o servidor precisa para criar a cobrança no provedor
create or replace function public.srv_dados_loja(segredo text, o uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g record; a record; p record;
begin
  perform public.srv_conferir(segredo);
  select * into g from public.organizacoes where id = o;
  if not found then raise exception 'sem-loja'; end if;
  select * into a from public.assinaturas where org_id = o;
  select * into p from public.planos where id = a.plano_id;
  return jsonb_build_object(
    'org_id', g.id, 'nome', g.nome, 'cadastro', g.cadastro,
    -- o cliente no provedor nasce com o e-mail do administrador mais antigo da loja
    'email', (select u.email from public.membros m join auth.users u on u.id = m.user_id
              where m.org_id = o and m.papel = 'admin' order by m.criado_em limit 1),
    'situacao', public.situacao_cobranca(o),
    'plano', case when p.id is null then null else jsonb_build_object('id', p.id, 'nome', p.nome, 'preco_centavos', p.preco_centavos, 'intervalo', p.intervalo) end,
    'teste_ate', a.teste_ate, 'pago_ate', a.pago_ate, 'provedor', a.provedor,
    'cliente_ref', a.cliente_ref, 'assinatura_ref', a.assinatura_ref, 'link_pagamento', a.link_pagamento, 'cancelada_em', a.cancelada_em);
end $$;

create or replace function public.srv_registrar_assinatura(segredo text, o uuid, prov text, cliente text, assinatura text, link text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.srv_conferir(segredo);
  update public.assinaturas set provedor = prov, cliente_ref = coalesce(cliente, cliente_ref),
    assinatura_ref = coalesce(assinatura, assinatura_ref), link_pagamento = coalesce(link, link_pagamento),
    cancelada_em = case when assinatura is not null then null else cancelada_em end, atualizado_em = now()
  where org_id = o;
end $$;

-- Aviso do provedor. tipo: 'pago' | 'cancelado' | 'checkout'.
-- 'pago' usa pago_ate_exato (Stripe: fim do período pago) ou vencimento (Asaas: + um período do plano).
create or replace function public.srv_evento(segredo text, prov text, evento text, tipo text, assinatura text, cliente text,
                                             o uuid, pago_ate_exato timestamptz, vencimento date, valor integer, referencia text)
returns text
language plpgsql security definer set search_path = '' as $$
declare a record; p record; ate timestamptz;
begin
  perform public.srv_conferir(segredo);
  if evento is not null then
    insert into public.eventos_cobranca (provedor, evento_id) values (prov, evento) on conflict do nothing;
    if not found then return 'repetido'; end if;
  end if;
  select * into a from public.assinaturas
   where (o is not null and org_id = o) or (assinatura is not null and assinatura_ref = assinatura) or (cliente is not null and cliente_ref = cliente)
   order by (org_id = o) desc nulls last limit 1;
  if not found then return 'sem-loja'; end if;

  if tipo = 'checkout' then
    update public.assinaturas set provedor = prov, cliente_ref = coalesce(cliente, cliente_ref),
      assinatura_ref = coalesce(assinatura, assinatura_ref), cancelada_em = null, atualizado_em = now() where org_id = a.org_id;
  elsif tipo = 'pago' then
    select * into p from public.planos where id = a.plano_id;
    ate := coalesce(pago_ate_exato,
                    vencimento::timestamptz + case when p.intervalo = 'anual' then interval '1 year' else interval '1 month' end);
    if ate is null then return 'sem-data'; end if;
    update public.assinaturas set pago_ate = greatest(coalesce(pago_ate, ate), ate), provedor = prov,
      assinatura_ref = coalesce(assinatura_ref, assinatura), cliente_ref = coalesce(cliente_ref, cliente), atualizado_em = now()
    where org_id = a.org_id;
    insert into public.pagamentos (org_id, org_nome, valor_centavos, cobre_ate, provedor, referencia)
    values (a.org_id, (select nome from public.organizacoes where id = a.org_id), coalesce(valor, p.preco_centavos, 0), ate, prov, referencia)
    on conflict do nothing;
    insert into public.auditoria (org_id, org_nome, acao, detalhe)
    values (a.org_id, (select nome from public.organizacoes where id = a.org_id), 'cobranca.pago', prov || ' até ' || to_char(ate, 'DD/MM/YYYY'));
  elsif tipo = 'cancelado' then
    update public.assinaturas set cancelada_em = now(), atualizado_em = now() where org_id = a.org_id;
    insert into public.auditoria (org_id, org_nome, acao, detalhe)
    values (a.org_id, (select nome from public.organizacoes where id = a.org_id), 'cobranca.cancelada', prov);
  end if;
  return 'ok';
end $$;

-- ============================================================ permissões (parte 2)
do $$
declare f text;
begin
  foreach f in array array[
    'situacao_cobranca(uuid)', 'bloqueada_por_cobranca(uuid)', 'pode_pagar(uuid)', 'minhas_orgs()', 'conferir_limite_pessoas(uuid)',
    'org_nova_assinatura()', 'cobranca_da_org(uuid)', 'trocar_plano(uuid, uuid)', 'cobranca_config_admin()',
    'definir_cobranca(boolean, integer)', 'definir_provedor(text)', 'trocar_segredo_servidor()',
    'salvar_plano(uuid, text, integer, text, integer, integer, boolean)', 'plano_padrao(uuid)', 'arquivar_plano(uuid)',
    'cobranca_resumo()', 'isentar_loja(uuid, boolean)', 'marcar_pago(uuid, integer, text)', 'estender_teste(uuid, integer)',
    'salvar_cadastro_org(uuid, jsonb)', 'marca_plataforma()', 'salvar_marca(jsonb)',
    'srv_conferir(text)', 'srv_config(text)', 'srv_salvar_conexao(text, text, boolean, text, text, text)', 'srv_dados_loja(text, uuid)',
    'srv_registrar_assinatura(text, uuid, text, text, text, text)',
    'srv_evento(text, text, text, text, text, text, uuid, timestamptz, date, integer, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
  end loop;
  foreach f in array array[
    'situacao_cobranca(uuid)', 'bloqueada_por_cobranca(uuid)', 'pode_pagar(uuid)', 'minhas_orgs()',
    'cobranca_da_org(uuid)', 'trocar_plano(uuid, uuid)', 'cobranca_config_admin()',
    'definir_cobranca(boolean, integer)', 'definir_provedor(text)', 'trocar_segredo_servidor()',
    'salvar_plano(uuid, text, integer, text, integer, integer, boolean)', 'plano_padrao(uuid)', 'arquivar_plano(uuid)',
    'cobranca_resumo()', 'isentar_loja(uuid, boolean)', 'marcar_pago(uuid, integer, text)', 'estender_teste(uuid, integer)',
    'salvar_cadastro_org(uuid, jsonb)', 'marca_plataforma()', 'salvar_marca(jsonb)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- a tela de login lê a marca antes de alguém entrar
  execute 'grant execute on function public.marca_plataforma() to anon';
  -- as funções do servidor são chamadas sem login, com a chave pública + a senha do servidor
  foreach f in array array[
    'srv_config(text)', 'srv_salvar_conexao(text, text, boolean, text, text, text)', 'srv_dados_loja(text, uuid)',
    'srv_registrar_assinatura(text, uuid, text, text, text, text)',
    'srv_evento(text, text, text, text, text, text, uuid, timestamptz, date, integer, text)'
  ] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
