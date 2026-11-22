create table public.viewings (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_id      int not null,
  media_type   text not null check (media_type in ('movie', 'tv')),
  title        text not null,
  poster_path  text,
  release_year smallint,
  watched_on   date not null, -- UI may record only the month; the app then stores the 1st of that month
  place        text,          -- free text; the app offers presets (Jellyfin, Netflix, cinema, ...)
  rating       smallint check (rating between 1 and 10),
  note         text,
  created_at   timestamptz not null default now()
);

create index viewings_user_title_idx on public.viewings (user_id, media_type, tmdb_id);

alter table public.viewings enable row level security;

create policy viewings_owner on public.viewings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create view public.titles with (security_invoker = true) as
select
  user_id,
  media_type,
  tmdb_id,
  (array_agg(title        order by watched_on desc, id desc))[1] as title,
  (array_agg(poster_path  order by watched_on desc, id desc))[1] as poster_path,
  (array_agg(release_year order by watched_on desc, id desc))[1] as release_year,
  count(*)                as view_count,
  max(watched_on)         as last_watched,
  min(watched_on)         as first_watched,
  round(avg(rating), 1)   as avg_rating
from public.viewings
group by user_id, media_type, tmdb_id;

grant select on public.titles to authenticated;
