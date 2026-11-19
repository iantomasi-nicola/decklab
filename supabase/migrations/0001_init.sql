-- =====================================================================
-- Decklab / Combo Lab - schema iniziale del sync (Supabase / Postgres)
--
-- COME APPLICARLA
--   1. Apri il progetto su https://supabase.com/dashboard
--   2. Menu a sinistra: "SQL Editor" -> "New query"
--   3. Incolla TUTTO questo file e premi "Run" (e' idempotente: puoi rilanciarlo senza danni)
--   4. Verifica in "Table Editor" che esistano le 6 tabelle e in
--      "Database -> Publications -> supabase_realtime" che siano abilitate.
--   (In alternativa con la CLI: `supabase db push`.)
--   Poi: Authentication -> Providers: abilita "Email" (magic link) e, se vuoi, "Google";
--   Authentication -> URL Configuration: aggiungi l'URL dell'app (e http://localhost:5173) ai Redirect URLs.
--
-- MODELLO
--   Una tabella per entita' sincronizzata. Ogni riga:
--     id          uuid  PK, generato dal client (UUID v4)
--     user_id     uuid  = auth.uid() (default), mai modificabile
--     data        jsonb l'intera entita' (i campi di dominio)
--     updated_at  timestamptz  impostato SEMPRE dal server (trigger): e' il riferimento del
--                              last-write-wins e il cursore del pull, cosi' gli orologi sfasati
--                              dei dispositivi non contano
--     deleted_at  timestamptz  cancellazione logica (tombstone), null = vivo
--
--   Sicurezza: RLS attiva; ogni operazione e' ristretta a user_id = auth.uid().
--   Nessuna chiave di servizio nel client: usa solo la anon key.
-- =====================================================================

-- Trigger condiviso: il server decide updated_at e blocca il cambio di proprietario.
create or replace function public.decklab_touch()
returns trigger
language plpgsql
as $$
begin
  -- clock_timestamp() (non now()): righe di uno stesso batch ottengono istanti distinti e crescenti
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['archetypes', 'variants', 'combos', 'boards', 'tags', 'settings']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id         uuid primary key,
        user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
        data       jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default clock_timestamp(),
        deleted_at timestamptz
      )$f$, t);

    -- indice per il pull incrementale: where user_id = ? and updated_at >= cursore order by updated_at
    execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_user_updated_idx', t);

    execute format('drop trigger if exists decklab_touch on public.%I', t);
    execute format(
      'create trigger decklab_touch before insert or update on public.%I for each row execute function public.decklab_touch()', t);

    -- RLS: solo le proprie righe, per ogni operazione
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

    -- Realtime: aggiunge la tabella alla publication (se non c'e' gia')
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Nota: le cancellazioni sono logiche (deleted_at). La pulizia definitiva dei tombstone vecchi
-- (es. dopo 90 giorni) si puo' fare con una query manuale o un cron (pg_cron):
--   delete from public.archetypes where deleted_at < now() - interval '90 days';
