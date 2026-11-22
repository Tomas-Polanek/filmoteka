-- Season of a series viewing (null = whole series / unspecified; 0 = specials, as on TMDB).
-- Per viewing only: public.titles keeps aggregating per title, so it needs no change.
alter table public.viewings
  add column season smallint check (season >= 0),
  add constraint viewings_season_tv_only check (media_type = 'tv' or season is null);
