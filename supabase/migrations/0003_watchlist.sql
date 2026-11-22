-- "Chci vidět": films/series the user wants to watch. One row per title per user.
create table public.watchlist (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_id      int not null,
  media_type   text not null check (media_type in ('movie', 'tv')),
  title        text not null,
  poster_path  text,
  release_year smallint,
  note         text,
  added_at     timestamptz not null default now(),
  unique (user_id, media_type, tmdb_id)
);

alter table public.watchlist enable row level security;

create policy watchlist_owner on public.watchlist
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
