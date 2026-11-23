import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './harness.mjs';

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const DOMAIN = 'users.filmoteka.app';

// Accounts that existed before 0005 (created in this order): the migration backfills their profiles.
const { db, as, addUser } = await setup([
  { id: id(1), email: 'Tom@Example.com' },
  { id: id(2), email: 'tom@example.org' },
  { id: id(3), email: 'x@example.com', meta: { username: 'tom' } }, // a valid metadata username wins
  { id: id(4), email: 'jo@example.com' }, // too short
  { id: id(5), email: '.Jan Novák+filmy@example.com' },
  { id: id(6) }, // nothing derivable
  { id: id(7), meta: { username: 'Bad!' } },
]);

// What the app does: signUp(email: "<username>@users.filmoteka.app", data: ["username": username]).
const signUp = (n, username, email = `${username}@${DOMAIN}`) =>
  addUser({ id: id(n), email, meta: username == null ? null : { username } });
const profile = async (uid) => (await db.query('select * from public.profiles where user_id = $1', [uid])).rows[0];
const authUserExists = async (uid) => (await db.query('select 1 from auth.users where id = $1', [uid])).rows.length > 0;

const EVA = id(10);
const PETR = id(11);

test('backfill gives every existing account a unique valid username', async () => {
  const { rows } = await db.query('select user_id, username, role, places from public.profiles order by user_id');
  assert.deepEqual(
    rows.map((r) => [r.user_id, r.username]),
    [
      [id(1), 'tom1'],
      [id(2), 'tom2'],
      [id(3), 'tom'],
      [id(4), 'jo1'],
      [id(5), 'jannovkfilmy'],
      [id(6), 'user'],
      [id(7), 'user1'],
    ],
  );
  assert.ok(rows.every((r) => r.role === 'user' && r.places === null));
});

test('signup with a username creates a user profile', async () => {
  await signUp(10, ' Eva ', `eva@${DOMAIN}`);
  const p = await profile(EVA);
  assert.equal(p.username, 'eva');
  assert.equal(p.role, 'user');
  assert.equal(p.places, null);
  assert.ok(p.created_at instanceof Date);
});

test('username derived from the e-mail when metadata is missing or invalid', async () => {
  await signUp(11, null, `Petr.Novak@${DOMAIN}`);
  assert.equal((await profile(PETR)).username, 'petr.novak');
  await signUp(12, 'x', `ondra_1@${DOMAIN}`);
  assert.equal((await profile(id(12))).username, 'ondra_1');
});

test('invalid usernames are rejected together with the auth user', async () => {
  for (const [n, username, email] of [
    [20, 'ab', `ab@${DOMAIN}`],
    [21, '-x', `-x@${DOMAIN}`],
    [22, null, null],
    [23, 'a'.repeat(33), null],
  ]) {
    await assert.rejects(signUp(n, username, email), /Neplatné uživatelské jméno/, String(username));
    assert.equal(await authUserExists(id(n)), false);
  }
  await assert.rejects(db.query(`update public.profiles set username = 'Eva' where user_id = $1`, [EVA]), /check constraint/);
  await assert.rejects(db.query(`update public.profiles set role = 'owner' where user_id = $1`, [EVA]), /check constraint/);
});

test('duplicate usernames are rejected together with the auth user', async () => {
  await assert.rejects(signUp(30, 'eva', `eva2@${DOMAIN}`), /duplicate key|unique/);
  assert.equal(await authUserExists(id(30)), false);
  await assert.rejects(signUp(31, null, `eva@example.com`), /duplicate key|unique/);
  assert.equal(await authUserExists(id(31)), false);
});

test('users see only their own profile, admins see all', async () => {
  await db.query(`update public.profiles set role = 'admin' where user_id = $1`, [EVA]);
  const total = (await db.query('select count(*)::int n from public.profiles')).rows[0].n;
  await as('authenticated', PETR, async () => {
    const { rows } = await db.query('select user_id, username from public.profiles');
    assert.deepEqual(rows, [{ user_id: PETR, username: 'petr.novak' }]);
    assert.equal((await db.query('select public.is_admin() a')).rows[0].a, false);
  });
  await as('authenticated', EVA, async () => {
    assert.equal((await db.query('select 1 from public.profiles')).rows.length, total);
    assert.equal((await db.query('select public.is_admin() a')).rows[0].a, true);
  });
});

test('users change only their own places; role and username are off limits, even for admins', async () => {
  await as('authenticated', PETR, async () => {
    const upd = await db.query(`update public.profiles set places = array['Kino', 'Jellyfin'] where user_id = $1`, [PETR]);
    assert.equal(upd.affectedRows, 1);
    assert.deepEqual((await db.query('select places from public.profiles')).rows[0].places, ['Kino', 'Jellyfin']);
    await assert.rejects(db.query(`update public.profiles set role = 'admin' where user_id = $1`, [PETR]), /permission denied/);
    await assert.rejects(db.query(`update public.profiles set username = 'petr' where user_id = $1`, [PETR]), /permission denied/);
    assert.equal((await db.query(`update public.profiles set places = '{}' where user_id = $1`, [EVA])).affectedRows, 0);
    await assert.rejects(db.query(`update public.profiles set user_id = $1`, [EVA]), /permission denied/);
  });
  await as('authenticated', EVA, async () => {
    assert.equal((await db.query(`update public.profiles set places = '{}' where user_id = $1`, [PETR])).affectedRows, 0);
    await assert.rejects(db.query(`update public.profiles set role = 'user' where user_id = $1`, [PETR]), /permission denied/);
  });
  assert.deepEqual((await profile(PETR)).places, ['Kino', 'Jellyfin']);
  assert.equal((await profile(PETR)).role, 'user');
});

test('nobody inserts or deletes profiles directly', async () => {
  for (const uid of [PETR, EVA]) {
    await as('authenticated', uid, async () => {
      await assert.rejects(
        db.query(`insert into public.profiles (user_id, username) values ($1, 'forged')`, [uid]),
        /permission denied/,
      );
      await assert.rejects(db.query('delete from public.profiles where user_id = $1', [uid]), /permission denied/);
    });
  }
});

test('anon sees nothing', async () => {
  await as('anon', null, async () => {
    await assert.rejects(db.query('select * from public.profiles'), /permission denied/);
    await assert.rejects(db.query('select public.is_admin()'), /permission denied/);
  });
});

test('deleting the auth user deletes the profile', async () => {
  await signUp(40, 'gone');
  await db.query('delete from auth.users where id = $1', [id(40)]);
  assert.equal(await profile(id(40)), undefined);
});

test('family is gone; viewings and watchlist are owner-only, also for admins', async () => {
  const { rows: policies } = await db.query(
    `select tablename, policyname, cmd from pg_policies where tablename in ('viewings', 'watchlist') order by tablename`,
  );
  assert.deepEqual(policies, [
    { tablename: 'viewings', policyname: 'viewings_owner', cmd: 'ALL' },
    { tablename: 'watchlist', policyname: 'watchlist_owner', cmd: 'ALL' },
  ]);
  const { rows: leftovers } = await db.query(
    `select relname as name from pg_class where relnamespace = 'public'::regnamespace and relname like 'famil%'
     union all
     select proname from pg_proc where pronamespace = 'public'::regnamespace
       and proname in ('create_family', 'join_family', 'leave_family', 'rotate_invite_code',
                       'my_family_id', 'family_user_ids', 'new_invite_code')`,
  );
  assert.deepEqual(leftovers, []);

  await as('authenticated', PETR, async () => {
    await db.query(`insert into public.viewings (tmdb_id, media_type, title, watched_on) values (603, 'movie', 'The Matrix', '2024-01-01')`);
    await db.query(`insert into public.watchlist (tmdb_id, media_type, title) values (550, 'movie', 'Fight Club')`);
  });
  await as('authenticated', EVA, async () => {
    for (const rel of ['viewings', 'titles', 'watchlist']) {
      assert.equal((await db.query(`select 1 from public.${rel}`)).rows.length, 0, rel);
    }
  });
});
