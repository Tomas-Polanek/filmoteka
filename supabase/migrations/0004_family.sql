-- Families: a user belongs to at most one family and joins it by invite code.
-- Members can read each other's viewings and watchlist; everyone still writes only their own rows.
-- Families and memberships change only through the RPCs below (security definer), never directly.

create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  invite_code text not null unique,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.family_members (
  user_id      uuid primary key references auth.users(id) on delete cascade,  -- pk: at most one family
  family_id    uuid not null references public.families(id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  joined_at    timestamptz not null default now()
);

create index family_members_family_idx on public.family_members (family_id);

alter table public.families enable row level security;
alter table public.family_members enable row level security;

-- Supabase grants everything on new public tables to anon/authenticated by default; RLS would deny writes
-- anyway (no policies), this just makes the intent explicit. Members may only rename themselves.
revoke insert, update, delete, truncate on public.families from anon, authenticated;
revoke insert, update, delete, truncate on public.family_members from anon, authenticated;
grant update (display_name) on public.family_members to authenticated;

-- Helpers read family_members as the definer, so policies using them don't recurse through its RLS.

create function public.my_family_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select family_id from public.family_members where user_id = (select auth.uid())
$$;

-- Everyone in the caller's family, the caller included; empty when not in a family.
create function public.family_user_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.family_members where family_id = public.my_family_id()
$$;

-- 8 characters from an alphabet without look-alikes (no I, O, 0, 1): 32^8 ≈ 10^12 codes.
-- Randomness comes from gen_random_uuid() (CSPRNG; no pgcrypto needed): bytes 0-5 and 10-11 of a v4 UUID are
-- fully random, and 256 is a multiple of 32, so `% 32` is unbiased.
create function public.new_invite_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(r.b, i) % 32 + 1, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) r, unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i
$$;

create function public.create_family(p_name text, p_display_name text) returns public.families
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fam public.families;
begin
  if uid is null then
    raise exception 'Nejsi přihlášen.' using errcode = '42501';
  end if;
  if exists (select 1 from public.family_members where user_id = uid) then
    raise exception 'Už jsi v rodině. Nejdřív ji opusť.' using errcode = 'P0001';
  end if;
  loop
    begin
      insert into public.families (name, invite_code, created_by)
      values (btrim(p_name), public.new_invite_code(), uid)
      returning * into fam;
      exit;
    exception when unique_violation then
      -- invite code collision: try another one
    end;
  end loop;
  insert into public.family_members (user_id, family_id, display_name)
  values (uid, fam.id, btrim(p_display_name));
  return fam;
end;
$$;

create function public.join_family(p_code text, p_display_name text) returns public.families
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fam public.families;
begin
  if uid is null then
    raise exception 'Nejsi přihlášen.' using errcode = '42501';
  end if;
  if exists (select 1 from public.family_members where user_id = uid) then
    raise exception 'Už jsi v rodině. Nejdřív ji opusť.' using errcode = 'P0001';
  end if;
  -- for share: waits for a concurrent last-member leave (which deletes the family) or code rotation
  select * into fam from public.families
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'))
  for share;
  if not found then
    raise exception 'Neznámý kód rodiny.' using errcode = 'P0002';
  end if;
  insert into public.family_members (user_id, family_id, display_name)
  values (uid, fam.id, btrim(p_display_name));
  return fam;
end;
$$;

-- Leaves the caller's family; the family is deleted when its last member leaves.
create function public.leave_family() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid := public.my_family_id();
begin
  if fid is null then
    raise exception 'Nejsi v žádné rodině.' using errcode = 'P0002';
  end if;
  -- serialize with other leaves/joins of this family, so two last members leaving at once still delete it
  perform 1 from public.families where id = fid for update;
  delete from public.family_members where user_id = uid;
  if not exists (select 1 from public.family_members where family_id = fid) then
    delete from public.families where id = fid;
  end if;
end;
$$;

-- Any member may replace the invite code, e.g. after sharing it too widely. Old code stops working.
create function public.rotate_invite_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  fid uuid := public.my_family_id();
  code text;
begin
  if fid is null then
    raise exception 'Nejsi v žádné rodině.' using errcode = 'P0002';
  end if;
  loop
    begin
      update public.families set invite_code = public.new_invite_code() where id = fid
      returning invite_code into code;
      return code;
    exception when unique_violation then
      -- collision: try another one
    end;
  end loop;
end;
$$;

-- Functions are executable by PUBLIC by default (and Supabase also grants anon/authenticated explicitly).
revoke execute on function public.new_invite_code() from public, anon, authenticated;
revoke execute on function
  public.my_family_id(), public.family_user_ids(), public.create_family(text, text),
  public.join_family(text, text), public.leave_family(), public.rotate_invite_code()
  from public, anon;
grant execute on function
  public.my_family_id(), public.family_user_ids(), public.create_family(text, text),
  public.join_family(text, text), public.leave_family(), public.rotate_invite_code()
  to authenticated;

create policy families_select on public.families
  for select to authenticated
  using (id = (select public.my_family_id()));

create policy family_members_select on public.family_members
  for select to authenticated
  using (family_id = (select public.my_family_id()));

create policy family_members_update_own on public.family_members
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- viewings / watchlist: family members read, only the owner writes.
-- `in (select ...)` runs the helper once per query, not once per row.

drop policy viewings_owner on public.viewings;

create policy viewings_select on public.viewings
  for select to authenticated
  using ((select auth.uid()) = user_id or user_id in (select public.family_user_ids()));

create policy viewings_insert on public.viewings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy viewings_update on public.viewings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy viewings_delete on public.viewings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy watchlist_owner on public.watchlist;

create policy watchlist_select on public.watchlist
  for select to authenticated
  using ((select auth.uid()) = user_id or user_id in (select public.family_user_ids()));

create policy watchlist_insert on public.watchlist
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy watchlist_update on public.watchlist
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy watchlist_delete on public.watchlist
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- public.titles is security_invoker over viewings, so it now returns family members' titles too;
-- the app filters by user_id.
