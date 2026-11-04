-- ONE MORE v18.1: independent, owner-only account cloud saves.
-- APPLIED to the existing shared Pinpoint project on 4 Nov 2026.
-- Keep for audit/recovery; DO NOT run this against a new Pinpoint database
-- or confuse it with the public leaderboard tables.
--
-- One active snapshot per Google account (uid) with monotonically increasing
-- CAS revision. Every UPDATE keeps the last 8 pre-update snapshots in history.
-- All rows are private to the signed-in uid. Anonymous requests have no grants.
-- Database changes do NOT affect existing public.scores/pinpoint_profiles.

create table if not exists public.om_player_saves (
  uid uuid primary key references auth.users (id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  data jsonb not null,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint om_player_saves_data_object check (jsonb_typeof(data) = 'object'),
  constraint om_player_saves_data_limit check (pg_column_size(data) < 131072)
);

alter table public.om_player_saves enable row level security;
revoke all on table public.om_player_saves from public, anon, authenticated;
grant select, insert, update on table public.om_player_saves to authenticated;

drop policy if exists "om_cloud_read_own" on public.om_player_saves;
drop policy if exists "om_cloud_insert_own" on public.om_player_saves;
drop policy if exists "om_cloud_update_own" on public.om_player_saves;

create policy "om_cloud_read_own" on public.om_player_saves
  for select to authenticated
  using ((select auth.uid()) = uid);

create policy "om_cloud_insert_own" on public.om_player_saves
  for insert to authenticated
  with check ((select auth.uid()) = uid);

create policy "om_cloud_update_own" on public.om_player_saves
  for update to authenticated
  using ((select auth.uid()) = uid)
  with check ((select auth.uid()) = uid);

create or replace function public.om_preserve_save_history()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare entries jsonb;
begin
  if NEW.uid is distinct from OLD.uid then
    raise exception 'Cloud save owner cannot change';
  end if;
  if NEW.revision is distinct from OLD.revision + 1 then
    raise exception 'Cloud save revision must increase by exactly one';
  end if;
  if NEW.data is null or jsonb_typeof(NEW.data) <> 'object'
     or pg_column_size(NEW.data) >= 131072 then
    raise exception 'Invalid cloud save payload';
  end if;
  entries := coalesce(OLD.history, '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'revision', OLD.revision, 'data', OLD.data, 'updated_at', OLD.updated_at
    ));
  if jsonb_array_length(entries) > 8 then
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
      into entries
      from jsonb_array_elements(entries) with ordinality as e(value, ordinality)
      where ordinality > jsonb_array_length(entries) - 8;
  end if;
  NEW.history := entries;
  NEW.updated_at := now();
  return NEW;
end;
$function$;
revoke all on function public.om_preserve_save_history() from PUBLIC, anon, authenticated;

drop trigger if exists om_cloud_preserve_history on public.om_player_saves;
create trigger om_cloud_preserve_history
  before update on public.om_player_saves
  for each row execute function public.om_preserve_save_history();

-- Verify with read-only queries: table RLS, policy/grant count, trigger,
-- a rolled-back owner/non-owner impersonation test and Supabase advisor.
-- Do not copy auth.users IDs into source files or expose any Supabase secret.
