import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setup } from './harness.mjs';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const TOKEN_A = 'token-of-a-0123456789';
const hash = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

const { db, as } = await setup([A, B]);

const sync = (token, items) =>
  as('anon', null, () =>
    db.query('select public.integration_add_viewings($1, $2::jsonb) as added', [token, JSON.stringify(items)]),
  );

const movie = (ref, day, extra = {}) => ({
  ref,
  media_type: 'movie',
  tmdb_id: 157336,
  title: 'Interstellar',
  release_year: 2014,
  watched_on: day,
  ...extra,
});

before(async () => {
  await as('authenticated', A, () =>
    db.query(`insert into public.integrations (provider, token_hash) values ('jellyfin', $1)`, [hash(TOKEN_A)]),
  );
});

test('a sync adds viewings to the token owner only, marked as Jellyfin', async () => {
  const { rows } = await sync(TOKEN_A, [
    movie('movie:157336:2026-11-20', '2026-11-20'),
    { ref: 'tv:1396:s5:2026-11-21', media_type: 'tv', tmdb_id: 1396, title: 'Perníkový táta', watched_on: '2026-11-21', season: 5 },
  ]);
  assert.equal(rows[0].added, 2);

  const own = await as('authenticated', A, () =>
    db.query('select tmdb_id, place, source, season from public.viewings order by tmdb_id'),
  );
  assert.deepEqual(own.rows, [
    { tmdb_id: 1396, place: 'Jellyfin', source: 'jellyfin', season: 5 },
    { tmdb_id: 157336, place: 'Jellyfin', source: 'jellyfin', season: null },
  ]);
  const other = await as('authenticated', B, () => db.query('select count(*)::int as n from public.viewings'));
  assert.equal(other.rows[0].n, 0);
});

test('syncing the same play again adds nothing', async () => {
  const { rows } = await sync(TOKEN_A, [movie('movie:157336:2026-11-20', '2026-11-20'), movie('movie:157336:2026-11-20', '2026-11-20')]);
  assert.equal(rows[0].added, 0);
});

test('an unknown token is rejected', async () => {
  await assert.rejects(sync('wrong-token', [movie('x', '2026-11-20')]), /invalid token/);
});

test('malformed items are rejected without writing anything', async () => {
  const bad = [
    movie('ok:1', '2026-11-01'),
    { ...movie('bad', '2026-11-01'), media_type: 'book' },
  ];
  await assert.rejects(sync(TOKEN_A, bad), /invalid item/);
  await assert.rejects(sync(TOKEN_A, [movie('s', '2026-11-01', { season: 1 })]), /invalid item/);
  const { rows } = await as('authenticated', A, () =>
    db.query(`select count(*)::int as n from public.viewings where source_ref = 'ok:1'`),
  );
  assert.equal(rows[0].n, 0);
});

test('anon cannot read or create connections, users cannot change last_sync_at', async () => {
  await assert.rejects(as('anon', null, () => db.query('select * from public.integrations')));
  await assert.rejects(
    as('authenticated', A, () => db.query('update public.integrations set last_sync_at = now()')),
  );
  const seen = await as('authenticated', B, () => db.query('select count(*)::int as n from public.integrations'));
  assert.equal(seen.rows[0].n, 0);
});

test('a manual viewing keeps its poster on top of a newer synced one without poster', async () => {
  await as('authenticated', A, () =>
    db.query(
      `insert into public.viewings (tmdb_id, media_type, title, poster_path, watched_on)
       values (157336, 'movie', 'Interstellar', '/poster.jpg', '2020-01-01')`,
    ),
  );
  const { rows } = await as('authenticated', A, () =>
    db.query(`select poster_path, view_count::int from public.titles where tmdb_id = 157336`),
  );
  assert.deepEqual(rows, [{ poster_path: '/poster.jpg', view_count: 2 }]);
});
