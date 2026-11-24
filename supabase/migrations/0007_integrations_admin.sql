-- Admins manage media server connections for other accounts (Settings → Uživatelé → user → Jellyfin).
-- A connection only lets the sync add viewings to that account's diary; admins still cannot read anyone's diary.
create policy integrations_admin on public.integrations
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
