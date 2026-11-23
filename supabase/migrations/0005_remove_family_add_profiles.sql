-- 1. Rodina (0004) removed: diaries and watchlists are owner-only again, exactly as in 0001/0003.
-- 2. Accounts are username + password: the app signs up with the internal e-mail <username>@users.filmoteka.app
--    and the username in user metadata; public.profiles keeps the username, the role and the user's settings.
--    Only the Edge Function `admin` (service role) creates/deletes other accounts and changes roles.

-- Policies first: they depend on the family helpers, and create_family/join_family return the families row type.
drop policy viewings_select on public.viewings;
drop policy viewings_insert on public.viewings;
drop policy viewings_update on public.viewings;
drop policy viewings_delete on public.viewings;
drop policy watchlist_select on public.watchlist;
drop policy watchlist_insert on public.watchlist;
drop policy watchlist_update on public.watchlist;
drop policy watchlist_delete on public.watchlist;
drop policy families_select on public.families;
drop policy family_members_select on public.family_members;
drop policy family_members_update_own on public.family_members;

drop function public.create_family(text, text);
drop function public.join_family(text, text);
drop function public.leave_family();
drop function public.rotate_invite_code();
drop function public.family_user_ids();
drop function public.my_family_id();
drop function public.new_invite_code();

drop table public.family_members;
drop table public.families;

create policy viewings_owner on public.viewings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy watchlist_owner on public.watchlist
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Usernames: lowercase, 3-32 characters, starting with a letter or digit. Shared by the column check, the signup
-- trigger and the backfill; pure, so it stays executable by everyone (checks run with the writer's privileges).
create function public.is_valid_username(candidate text) returns boolean
language sql immutable set search_path = '' as $$
  select candidate ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
$$;

create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique check (public.is_valid_username(username)),
  role       text not null default 'user' check (role in ('admin', 'user')),
  places     text[],  -- the user's "Kde" presets; null = the app's default list
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Rows come only from the signup trigger and the admin function (service role); users may change only their places.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (places) on public.profiles to authenticated;

-- Reads profiles as the definer, so the select policy using it doesn't recurse through its own RLS.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = (select auth.uid()) and role = 'admin')
$$;

-- Admins see every profile (the admin screen lists accounts); nobody sees anyone else's viewings or watchlist.
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The username asked for in user metadata when valid, otherwise the e-mail local part reduced to allowed characters
-- (may still be invalid, e.g. too short: callers check). Covers users added without metadata, e.g. in the dashboard.
create function public.derive_username(meta jsonb, email text) returns text
language sql immutable set search_path = '' as $$
  select case
    when public.is_valid_username(lower(btrim(meta->>'username'))) then lower(btrim(meta->>'username'))
    else left(ltrim(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]+', '', 'g'), '._-'), 32)
  end
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uname text := public.derive_username(new.raw_user_meta_data, new.email);
begin
  if not coalesce(public.is_valid_username(uname), false) then
    raise exception 'Neplatné uživatelské jméno.' using errcode = '23514';
  end if;
  -- a taken username fails on the unique constraint, so the whole signup is rejected
  insert into public.profiles (user_id, username) values (new.id, uname);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.derive_username(jsonb, text), public.handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Profiles for accounts that existed before this migration. Valid metadata usernames win, then the oldest accounts;
-- taken or invalid names get a numeric suffix (tom -> tom1, jo -> jo1), nothing derivable becomes "user".
do $$
declare
  u record;
  base text;
  candidate text;
  n int;
begin
  for u in
    select id, email, raw_user_meta_data, created_at from auth.users
    where id not in (select user_id from public.profiles)
    order by coalesce(public.is_valid_username(lower(btrim(raw_user_meta_data->>'username'))), false) desc, created_at, id
  loop
    base := coalesce(nullif(public.derive_username(u.raw_user_meta_data, u.email), ''), 'user');
    n := 0;
    loop
      candidate := case when n = 0 then base else left(base, 32 - length(n::text)) || n end;
      exit when public.is_valid_username(candidate)
        and not exists (select 1 from public.profiles where username = candidate);
      n := n + 1;
    end loop;
    insert into public.profiles (user_id, username, created_at) values (u.id, candidate, coalesce(u.created_at, now()));
  end loop;
end;
$$;
