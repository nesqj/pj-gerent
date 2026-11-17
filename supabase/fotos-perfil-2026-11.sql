-- Foto de perfil fora do login (17/11/2026). Rode no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema.
--
-- Por quê: a foto ficava guardada nos dados da conta (user_metadata), e esses dados vão dentro do login (token)
-- em TODO pedido ao banco. Com a foto, o login passava de 19 mil caracteres e o Safari do iPhone recusava
-- os pedidos ("Load failed"). Agora a foto fica numa tabela própria e o login volta a ser pequeno.

-- 1) tabela das fotos: uma por pessoa; cada um só vê e altera a própria
create table if not exists public.fotos_perfil (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  foto text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.fotos_perfil enable row level security;

drop policy if exists "fotos_perfil: ver a própria" on public.fotos_perfil;
create policy "fotos_perfil: ver a própria" on public.fotos_perfil
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "fotos_perfil: criar a própria" on public.fotos_perfil;
create policy "fotos_perfil: criar a própria" on public.fotos_perfil
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "fotos_perfil: alterar a própria" on public.fotos_perfil;
create policy "fotos_perfil: alterar a própria" on public.fotos_perfil
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "fotos_perfil: apagar a própria" on public.fotos_perfil;
create policy "fotos_perfil: apagar a própria" on public.fotos_perfil
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) leva as fotos que já existem para a tabela nova
insert into public.fotos_perfil (user_id, foto)
select id, raw_user_meta_data->'perfil'->>'avatar'
  from auth.users
 where coalesce(raw_user_meta_data->'perfil'->>'avatar', '') <> ''
on conflict (user_id) do update set foto = excluded.foto, atualizado_em = now();

-- 3) tira a foto dos dados da conta (o login volta a ser pequeno na próxima renovação)
update auth.users
   set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{perfil}', (raw_user_meta_data->'perfil') - 'avatar')
 where raw_user_meta_data->'perfil' ? 'avatar';

-- Conferência (só mostra): contas que ainda têm foto dentro do login. Deve vir vazia.
select email from auth.users where raw_user_meta_data->'perfil' ? 'avatar';
