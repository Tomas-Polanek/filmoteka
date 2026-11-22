import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

/**
 * Fresh in-memory database with the Supabase parts the migrations depend on stubbed, the given auth users
 * created and every migration applied in order, like running them one by one in the SQL editor.
 */
export async function setup(userIds) {
  const db = new PGlite();
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
  `);
  for (const id of userIds) await db.query('insert into auth.users values ($1)', [id]);
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

  return { db, as };
}
