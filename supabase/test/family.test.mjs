import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './harness.mjs';

// A creates the family, B joins it, C stays outside (and later joins to test leaving).
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';

const { db, as } = await setup([A, B, C]);

const rpc = (sql, params = []) => db.query(`select * from ${sql}`, params);
const count = async (sql, params = []) => (await db.query(sql, params)).rows.length;
const users = async (rel) =>
  new Set((await db.query(`select distinct user_id from public.${rel}`)).rows.map((r) => r.user_id));

let family; // the families row returned by create_family

before(async () => {
  for (const [uid, tmdb, title] of [[A, 603, 'The Matrix'], [B, 27205, 'Inception'], [C, 550, 'Fight Club']]) {
    await as('authenticated', uid, async () => {
      await db.query(
        `insert into public.viewings (tmdb_id, media_type, title, watched_on, rating) values ($1, 'movie', $2, '2024-01-01', 8)`,
        [tmdb, title],
      );
      await db.query(`insert into public.watchlist (tmdb_id, media_type, title) values ($1, 'tv', $2)`, [tmdb, title]);
    });
  }
});

test('create_family makes the caller a member and returns the family with an invite code', async () => {
  await as('authenticated', A, async () => {
    assert.equal((await rpc('public.my_family_id()')).rows[0].my_family_id, null);
    family = (await rpc('public.create_family($1, $2)', ['  Polánkovi ', 'Tomáš'])).rows[0];
    assert.equal(family.name, 'Polánkovi');
    assert.equal(family.created_by, A);
    assert.match(family.invite_code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    assert.equal((await rpc('public.my_family_id()')).rows[0].my_family_id, family.id);
    const { rows } = await db.query('select user_id, display_name from public.family_members');
    assert.deepEqual(rows, [{ user_id: A, display_name: 'Tomáš' }]);
    await assert.rejects(rpc('public.create_family($1, $2)', ['Druhá', 'Tomáš']), /Už jsi v rodině/);
  });
});

test('join_family: unknown code fails, lowercase code works, joining twice fails', async () => {
  await as('authenticated', B, async () => {
    await assert.rejects(rpc('public.join_family($1, $2)', ['NOPE2345', 'Eva']), /Neznámý kód/);
    const joined = (await rpc('public.join_family($1, $2)', [` ${family.invite_code.toLowerCase()} `, 'Eva'])).rows[0];
    assert.equal(joined.id, family.id);
    await assert.rejects(rpc('public.join_family($1, $2)', [family.invite_code, 'Eva']), /Už jsi v rodině/);
    await assert.rejects(rpc('public.create_family($1, $2)', ['Jiná', 'Eva']), /Už jsi v rodině/);
  });
});

test('members read each other\'s viewings, titles and watchlist; outsiders do not', async () => {
  for (const uid of [A, B]) {
    await as('authenticated', uid, async () => {
      for (const rel of ['viewings', 'titles', 'watchlist']) {
        assert.deepEqual(await users(rel), new Set([A, B]), `${uid} ${rel}`);
      }
    });
  }
  await as('authenticated', C, async () => {
    for (const rel of ['viewings', 'titles', 'watchlist']) {
      assert.deepEqual(await users(rel), new Set([C]), rel);
    }
  });
});

test('members still write only their own rows', async () => {
  await as('authenticated', B, async () => {
    for (const rel of ['viewings', 'watchlist']) {
      assert.equal((await db.query(`update public.${rel} set title = 'hacked' where user_id = $1`, [A])).affectedRows, 0);
      assert.equal((await db.query(`delete from public.${rel} where user_id = $1`, [A])).affectedRows, 0);
      await assert.rejects(db.query(`update public.${rel} set user_id = $1 where user_id = $2`, [A, B]), /row-level security/);
    }
    await assert.rejects(
      db.query(`insert into public.viewings (user_id, tmdb_id, media_type, title, watched_on) values ($1, 1, 'movie', 'X', '2024-01-01')`, [A]),
      /row-level security/,
    );
    await assert.rejects(
      db.query(`insert into public.watchlist (user_id, tmdb_id, media_type, title) values ($1, 1, 'movie', 'X')`, [A]),
      /row-level security/,
    );
  });
  const { rows } = await db.query(`select title from public.viewings where user_id = $1 union all select title from public.watchlist where user_id = $1`, [A]);
  assert.deepEqual(rows.map((r) => r.title), ['The Matrix', 'The Matrix']);
});

test('families and family_members are visible only within the family and change only via RPCs', async () => {
  await as('authenticated', B, async () => {
    assert.equal(await count('select 1 from public.families'), 1);
    assert.equal(await count('select 1 from public.family_members'), 2);
    // own display name only
    assert.equal((await db.query(`update public.family_members set display_name = 'Evička' where user_id = $1`, [B])).affectedRows, 1);
    assert.equal((await db.query(`update public.family_members set display_name = 'hacked' where user_id = $1`, [A])).affectedRows, 0);
    await assert.rejects(db.query(`update public.family_members set family_id = gen_random_uuid() where user_id = $1`, [B]), /permission denied/);
    await assert.rejects(db.query(`update public.families set name = 'hacked'`), /permission denied/);
    await assert.rejects(db.query(`delete from public.family_members where user_id = $1`, [A]), /permission denied/);
    await assert.rejects(db.query(`insert into public.families (name, invite_code) values ('X', 'XXXXXXXX')`), /permission denied/);
    await assert.rejects(
      db.query(`insert into public.family_members (user_id, family_id, display_name) values ($1, $2, 'C')`, [C, family.id]),
      /permission denied/,
    );
    await assert.rejects(rpc('public.new_invite_code()'), /permission denied/);
  });
  const { rows } = await db.query('select user_id, display_name from public.family_members order by user_id');
  assert.deepEqual(rows, [{ user_id: A, display_name: 'Tomáš' }, { user_id: B, display_name: 'Evička' }]);
  await as('authenticated', C, async () => {
    assert.equal(await count('select 1 from public.families'), 0);
    assert.equal(await count('select 1 from public.family_members'), 0);
    assert.equal((await db.query(`update public.family_members set display_name = 'x'`)).affectedRows, 0);
    await assert.rejects(rpc('public.rotate_invite_code()'), /Nejsi v žádné rodině/);
    await assert.rejects(rpc('public.leave_family()'), /Nejsi v žádné rodině/);
  });
});

test('anon sees nothing and cannot call the RPCs', async () => {
  await as('anon', null, async () => {
    for (const rel of ['families', 'family_members', 'viewings', 'titles', 'watchlist']) {
      assert.equal(await count(`select 1 from public.${rel}`), 0, rel);
    }
    for (const call of ["create_family('X', 'Y')", "join_family('X', 'Y')", 'leave_family()', 'rotate_invite_code()', 'my_family_id()']) {
      await assert.rejects(rpc(`public.${call}`), /permission denied/, call);
    }
  });
});

test('rotate_invite_code: any member can, the old code stops working', async () => {
  const old = family.invite_code;
  const code = await as('authenticated', B, async () => (await rpc('public.rotate_invite_code()')).rows[0].rotate_invite_code);
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.notEqual(code, old);
  family.invite_code = code;
  await as('authenticated', A, async () => {
    assert.equal((await db.query('select invite_code from public.families')).rows[0].invite_code, code);
  });
  await as('authenticated', C, async () => {
    await assert.rejects(rpc('public.join_family($1, $2)', [old, 'Cyril']), /Neznámý kód/);
    await rpc('public.join_family($1, $2)', [code, 'Cyril']);
    assert.deepEqual(await users('viewings'), new Set([A, B, C]));
  });
});

test('leave_family removes visibility both ways; the last member leaving deletes the family', async () => {
  await as('authenticated', C, () => rpc('public.leave_family()'));
  await as('authenticated', C, async () => {
    assert.deepEqual(await users('viewings'), new Set([C]));
    assert.deepEqual(await users('watchlist'), new Set([C]));
    assert.equal(await count('select 1 from public.family_members'), 0);
  });
  await as('authenticated', A, async () => assert.deepEqual(await users('titles'), new Set([A, B])));

  await as('authenticated', A, () => rpc('public.leave_family()'));
  await as('authenticated', B, async () => {
    assert.deepEqual(await users('viewings'), new Set([B]));
    assert.equal(await count('select 1 from public.family_members'), 1);
  });
  assert.equal(await count('select 1 from public.families'), 1, 'family survives while B is in it');

  await as('authenticated', B, () => rpc('public.leave_family()'));
  assert.equal(await count('select 1 from public.families'), 0);
  assert.equal(await count('select 1 from public.family_members'), 0);
  await as('authenticated', B, async () => {
    assert.deepEqual(await users('viewings'), new Set([B]));
    await assert.rejects(rpc('public.join_family($1, $2)', [family.invite_code, 'Eva']), /Neznámý kód/);
  });
});
