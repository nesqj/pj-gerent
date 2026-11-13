-- PJ GERENT — lojas (organizações), equipe, convites e painel da plataforma
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
create or replace function public.minhas_orgs() returns table (id uuid, nome text, suspensa boolean, papel text, criada_por_mim boolean)
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
    insert into public.membros (org_id, user_id, papel) values (o, alvo, novo_papel);
    perform public.auditar(o, 'membro.adicionado', e || ' (' || novo_papel || ')');
    return 'adicionado';
  end if;
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
         cadastro = case when so_convite then 'convite' else 'aberto' end, atualizado_em = now();
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
