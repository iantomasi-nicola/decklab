-- =====================================================================
-- Decklab / Combo Lab - migrazione 0002: piani di side (tabella "sidePlans")
--
-- COME APPLICARLA
--   SQL Editor -> "New query" -> incolla TUTTO questo file -> "Run" (idempotente), oppure `supabase db push`.
--   Va applicata DOPO 0001_init.sql (usa la funzione public.decklab_touch() creata li').
--
-- MODELLO: identico alle altre tabelle sincronizzate (id, user_id, data jsonb, updated_at del server, deleted_at).
--   Il nome e' "sidePlans" (maiuscola, tra virgolette) perche' il client usa lo stesso nome locale e remoto.
--   RLS: solo le proprie righe (user_id = auth.uid()) per select/insert/update/delete.
-- =====================================================================

do $$
declare
  t text := 'sidePlans';
begin
  execute format($f$
    create table if not exists public.%1$I (
      id         uuid primary key,
      user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
      data       jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default clock_timestamp(),
      deleted_at timestamptz
    )$f$, t);

  execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_user_updated_idx', t);

  execute format('drop trigger if exists decklab_touch on public.%I', t);
  execute format(
    'create trigger decklab_touch before insert or update on public.%I for each row execute function public.decklab_touch()', t);

  execute format('alter table public.%I enable row level security', t);

  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_select', t);

  execute format('drop policy if exists %I on public.%I', t || '_insert', t);
  execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())', t || '_insert', t);

  execute format('drop policy if exists %I on public.%I', t || '_update', t);
  execute format(
    'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
    t || '_update', t);

  execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_delete', t);

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
  ) then
    execute format('alter publication supabase_realtime add table public.%I', t);
  end if;
end;
$$;
