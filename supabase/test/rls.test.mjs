import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

const db = new PGlite();

// Run `fn` as a Supabase-like role/user; always resets to the superuser afterwards.
async function as(role, uid, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const insert = (tmdb, title, day, rating, uid) =>
  uid
    ? db.query(
        `insert into public.viewings (user_id, tmdb_id, media_type, title, watched_on, rating)
         values ($5, $1, 'movie', $2, $3, $4)`,
        [tmdb, title, day, rating, uid],
      )
    : db.query(
        `insert into public.viewings (tmdb_id, media_type, title, watched_on, rating)
         values ($1, 'movie', $2, $3, $4)`,
        [tmdb, title, day, rating],
      );

before(async () => {
  // Stub the parts of Supabase the migration depends on.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    -- Supabase's default privileges on the public schema
    alter default privileges in schema public grant all on tables to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  // Apply every migration in order, like running them one by one in the SQL editor.
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, dir), 'utf8'));
  }

  await as('authenticated', A, async () => {
    await insert(603, 'The Matrix (old title)', '2020-01-01', 8);
    await insert(603, 'The Matrix', '2024-05-01', 9);
  });
  await as('authenticated', B, () => insert(27205, 'Inception', '2023-03-03', 7));
});

test('user_id defaults to the authenticated user', async () => {
  const { rows } = await db.query('select user_id from public.viewings where title like $1', ['The Matrix%']);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.user_id === A));
});

test('users only see their own rows in viewings and titles', async () => {
  for (const [uid, other, title] of [[B, A, 'Inception'], [A, B, 'The Matrix']]) {
    await as('authenticated', uid, async () => {
      for (const rel of ['viewings', 'titles']) {
        const { rows } = await db.query(`select * from public.${rel}`);
        assert.ok(rows.length > 0);
        assert.ok(rows.every((r) => r.user_id === uid && r.user_id !== other));
        assert.ok(rows.every((r) => r.title.startsWith(title)));
      }
    });
  }
  await as('authenticated', B, async () => {
    assert.equal((await db.query(`select 1 from public.viewings where user_id = $1`, [A])).rows.length, 0);
    assert.equal((await db.query(`select 1 from public.titles where user_id = $1`, [A])).rows.length, 0);
  });
});

test('B cannot insert as A, nor update or delete A rows', async () => {
  await as('authenticated', B, async () => {
    await assert.rejects(insert(1, 'Forged', '2024-01-01', 5, A), /row-level security/);
    const upd = await db.query(`update public.viewings set title = 'hacked' where user_id = $1`, [A]);
    assert.equal(upd.affectedRows, 0);
    const del = await db.query(`delete from public.viewings where user_id = $1`, [A]);
    assert.equal(del.affectedRows, 0);
    // moving own row to A is also rejected
    await assert.rejects(db.query(`update public.viewings set user_id = $1`, [A]), /row-level security/);
  });
  const { rows } = await db.query(`select count(*)::int n from public.viewings where user_id = $1 and title <> 'hacked'`, [A]);
  assert.equal(rows[0].n, 2);
});

test('titles aggregates per title for A', async () => {
  const { rows } = await as('authenticated', A, () => db.query('select * from public.titles'));
  assert.equal(rows.length, 1);
  const t = rows[0];
  assert.equal(Number(t.view_count), 2);
  assert.equal(t.last_watched.toISOString().slice(0, 10), '2024-05-01');
  assert.equal(t.first_watched.toISOString().slice(0, 10), '2020-01-01');
  assert.equal(t.title, 'The Matrix');
  assert.equal(Number(t.avg_rating), 8.5);
});

test('check constraints reject bad rating and media_type', async () => {
  await as('authenticated', A, async () => {
    await assert.rejects(insert(1, 'X', '2024-01-01', 11), /check constraint/);
    await assert.rejects(
      db.query(`insert into public.viewings (tmdb_id, media_type, title, watched_on) values (1, 'book', 'X', '2024-01-01')`),
      /check constraint/,
    );
  });
});

test('anon sees nothing', async () => {
  await as('anon', null, async () => {
    assert.equal((await db.query('select * from public.viewings')).rows.length, 0);
    assert.equal((await db.query('select * from public.titles')).rows.length, 0);
  });
});

test('seasons: tv viewings take a season, titles still aggregate per series, RLS applies', async () => {
  const tv = (season, uid = null) =>
    db.query(
      `insert into public.viewings (user_id, tmdb_id, media_type, title, watched_on, season)
       values (coalesce($2::uuid, auth.uid()), 1399, 'tv', 'Game of Thrones', '2024-06-01', $1)`,
      [season, uid],
    );
  try {
    await as('authenticated', A, async () => {
      await tv(1);
      await tv(2);
      await tv(0); // specials
      await tv(null); // whole series
      const { rows } = await db.query(`select season from public.viewings where tmdb_id = 1399 order by season`);
      assert.deepEqual(rows.map((r) => r.season), [0, 1, 2, null]);
      const titles = await db.query(`select view_count from public.titles where media_type = 'tv' and tmdb_id = 1399`);
      assert.equal(titles.rows.length, 1);
      assert.equal(Number(titles.rows[0].view_count), 4);
    });
    await as('authenticated', B, async () => {
      assert.equal((await db.query(`select 1 from public.viewings where tmdb_id = 1399`)).rows.length, 0);
      assert.equal((await db.query(`select 1 from public.titles where tmdb_id = 1399`)).rows.length, 0);
      await assert.rejects(tv(3, A), /row-level security/);
      const upd = await db.query(`update public.viewings set season = 9 where tmdb_id = 1399`);
      assert.equal(upd.affectedRows, 0);
    });
  } finally {
    await db.query(`delete from public.viewings where tmdb_id = 1399`);
  }
});

test('seasons: rejected on movies and when negative', async () => {
  await as('authenticated', A, async () => {
    await assert.rejects(
      db.query(`insert into public.viewings (tmdb_id, media_type, title, watched_on, season) values (1, 'movie', 'X', '2024-01-01', 1)`),
      /check constraint/,
    );
    await assert.rejects(
      db.query(`insert into public.viewings (tmdb_id, media_type, title, watched_on, season) values (1, 'tv', 'X', '2024-01-01', -1)`),
      /check constraint/,
    );
    await assert.rejects(
      db.query(`update public.viewings set season = 1 where media_type = 'movie'`),
      /check constraint/,
    );
  });
});

test('watchlist: owner CRUD, other users isolated, duplicates rejected', async () => {
  const add = (tmdb, media, title, uid = null) =>
    db.query(
      `insert into public.watchlist (user_id, tmdb_id, media_type, title)
       values (coalesce($4::uuid, auth.uid()), $1, $2, $3) returning id, user_id`,
      [tmdb, media, title, uid],
    );
  try {
    const id = await as('authenticated', A, async () => {
      const { rows } = await add(550, 'movie', 'Fight Club');
      assert.equal(rows[0].user_id, A);
      await add(550, 'tv', 'Same id, other type'); // unique is per media_type
      await assert.rejects(add(550, 'movie', 'Fight Club again'), /duplicate key|unique/);
      const upd = await db.query(`update public.watchlist set note = 'with Eva' where id = $1`, [rows[0].id]);
      assert.equal(upd.affectedRows, 1);
      const sel = await db.query(`select note from public.watchlist where id = $1`, [rows[0].id]);
      assert.equal(sel.rows[0].note, 'with Eva');
      return rows[0].id;
    });
    await as('authenticated', B, async () => {
      assert.equal((await db.query(`select 1 from public.watchlist`)).rows.length, 0);
      await assert.rejects(add(1, 'movie', 'Forged', A), /row-level security/);
      assert.equal((await db.query(`update public.watchlist set title = 'hacked'`)).affectedRows, 0);
      assert.equal((await db.query(`delete from public.watchlist where id = $1`, [id])).affectedRows, 0);
      // B may keep the same title on its own list
      await add(550, 'movie', 'Fight Club');
      assert.equal((await db.query(`select 1 from public.watchlist`)).rows.length, 1);
      await assert.rejects(db.query(`update public.watchlist set user_id = $1`, [A]), /row-level security/);
    });
    await as('anon', null, async () => {
      assert.equal((await db.query(`select 1 from public.watchlist`)).rows.length, 0);
    });
    await as('authenticated', A, async () => {
      await assert.rejects(add(2, 'book', 'X'), /check constraint/);
      assert.equal((await db.query(`delete from public.watchlist where id = $1`, [id])).affectedRows, 1);
      const { rows } = await db.query(`select title from public.watchlist`);
      assert.deepEqual(rows.map((r) => r.title), ['Same id, other type']);
    });
  } finally {
    await db.query(`delete from public.watchlist`);
  }
});
