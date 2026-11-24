-- Automatic viewings from a media server (Jellyfin now, Plex later).
-- A user creates a connection in the app, which stores only the SHA-256 of a random token. The sync script on the
-- media server sends finished plays with that token to public.integration_add_viewings(), which writes them into
-- the token owner's diary. No service role key is needed anywhere.

create table public.integrations (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider     text not null check (provider in ('jellyfin', 'plex')),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  last_sync_at timestamptz,
  unique (user_id, provider)
);

alter table public.integrations enable row level security;

-- Users see, create and delete only their own connections; last_sync_at is written by the function below.
create policy integrations_owner on public.integrations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.integrations from anon, authenticated;
grant select, insert, delete on public.integrations to authenticated;

-- Where a viewing came from; source_ref identifies the play so a repeated sync never adds it twice.
alter table public.viewings
  add column source     text not null default 'manual' check (source in ('manual', 'jellyfin', 'plex')),
  add column source_ref text check (source_ref is null or length(source_ref) between 1 and 200),
  add constraint viewings_source_ref_only_synced check ((source = 'manual') = (source_ref is null));

create unique index viewings_source_ref_unique on public.viewings (user_id, source, source_ref)
  where source_ref is not null;

-- Synced viewings arrive without a poster (the media server has no TMDB poster path); the app fills it in later.
-- Until then the diary shows the newest poster any viewing of the title has.
create or replace view public.titles with (security_invoker = true) as
select
  user_id,
  media_type,
  tmdb_id,
  (array_agg(title        order by watched_on desc, id desc))[1] as title,
  (array_agg(poster_path  order by watched_on desc, id desc) filter (where poster_path is not null))[1] as poster_path,
  (array_agg(release_year order by watched_on desc, id desc) filter (where release_year is not null))[1] as release_year,
  count(*)                as view_count,
  max(watched_on)         as last_watched,
  min(watched_on)         as first_watched,
  round(avg(rating), 1)   as avg_rating
from public.viewings
group by user_id, media_type, tmdb_id;

/**
 * Adds finished plays for the owner of p_token. p_items is a JSON array (at most 500) of
 *   {"ref": text, "media_type": "movie"|"tv", "tmdb_id": int, "title": text, "release_year": int|null,
 *    "watched_on": "YYYY-MM-DD", "season": int|null}
 * Items already synced (same ref) are skipped. Returns how many viewings were added.
 * Raises 'invalid token' for an unknown token and 'invalid item' for malformed input.
 */
create function public.integration_add_viewings(p_token text, p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  conn     public.integrations;
  added    integer;
begin
  select * into conn from public.integrations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found then
    raise exception 'invalid token' using errcode = '28000';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'invalid item' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) i
     where jsonb_typeof(i) <> 'object'
        or coalesce(length(i->>'ref'), 0) not between 1 and 200
        or i->>'media_type' not in ('movie', 'tv')
        or coalesce(i->>'tmdb_id', '') !~ '^[1-9][0-9]{0,9}$'
        or coalesce(length(btrim(i->>'title')), 0) not between 1 and 300
        or coalesce(i->>'watched_on', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or (i->>'release_year' is not null and i->>'release_year' !~ '^\d{4}$')
        or (i->>'season' is not null and (i->>'season' !~ '^\d{1,4}$' or i->>'media_type' <> 'tv'))
  ) then
    raise exception 'invalid item' using errcode = '22023';
  end if;

  insert into public.viewings (user_id, tmdb_id, media_type, title, release_year, watched_on, season, place, source, source_ref)
  select conn.user_id,
         (i->>'tmdb_id')::int,
         i->>'media_type',
         btrim(i->>'title'),
         (i->>'release_year')::smallint,
         least((i->>'watched_on')::date, current_date),
         (i->>'season')::smallint,
         case conn.provider when 'jellyfin' then 'Jellyfin' else 'Plex' end,
         conn.provider,
         i->>'ref'
    from jsonb_array_elements(p_items) i
  on conflict (user_id, source, source_ref) where source_ref is not null do nothing;
  get diagnostics added = row_count;

  update public.integrations set last_sync_at = now() where id = conn.id;
  return added;
end;
$$;

revoke execute on function public.integration_add_viewings(text, jsonb) from public;
grant execute on function public.integration_add_viewings(text, jsonb) to anon, authenticated;
