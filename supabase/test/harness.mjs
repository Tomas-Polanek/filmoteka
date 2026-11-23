import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

/**
 * Fresh in-memory database with the Supabase parts the migrations depend on stubbed, the given auth users
 * created and every migration applied in order, like running them one by one in the SQL editor.
 * Users are ids or `{ id, email, meta }` (meta = raw_user_meta_data); they exist before the migrations run.
 */
export async function setup(users) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id                 uuid primary key,
      email              text,
      raw_user_meta_data jsonb,
      created_at         timestamptz not null default now()
    );
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    -- Supabase's default privileges on the public schema
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  for (const u of users) await addUser(db, typeof u === 'string' ? { id: u } : u);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, dir), 'utf8'));
  }

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

  return { db, as, addUser: (user) => addUser(db, user) };
}

/** Inserts an auth user the way GoTrue does on signup (as the superuser, so the profile trigger fires). */
function addUser(db, { id, email = null, meta = null }) {
  return db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id,
    email,
    meta == null ? null : JSON.stringify(meta),
  ]);
}
