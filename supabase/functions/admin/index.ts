// Account administration for admins (profiles.role = 'admin'): list, create and delete accounts, set passwords
// and roles. The app POSTs {"action": ...} with the signed-in user's access token; the function checks the
// caller's role and does the work with the service role key (SUPABASE_SERVICE_ROLE_KEY, set by Supabase).
// Deploy with --no-verify-jwt, like tmdb: the user is verified here instead of by the gateway.
// Admins manage accounts only; nobody's diary is readable through this function.
import { createClient } from "npm:@supabase/supabase-js@2";

export type Role = "admin" | "user";
export type UserInfo = { user_id: string; username: string; role: Role; created_at: string };

/** Everything the handler needs from Supabase; tests inject an in-memory fake. */
export interface Deps {
  /** The user owning a valid access token, or null. */
  getCaller(token: string): Promise<{ id: string } | null>;
  /** The user's role, or null when the user has no profile (does not exist). */
  getRole(userId: string): Promise<Role | null>;
  /** Every profile, sorted by username. */
  listUsers(): Promise<UserInfo[]>;
  /** Creates the auth user with the internal e-mail; the signup trigger creates its profile (role user). */
  createUser(username: string, password: string): Promise<UserInfo>;
  updatePassword(userId: string, password: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  setRole(userId: string, role: Role): Promise<void>;
  countAdmins(): Promise<number>;
  usernameExists(username: string): Promise<boolean>;
}

/** A failure with a status and a message for the UI. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const EMAIL_DOMAIN = "users.filmoteka.app";
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD = 6;

const NOT_FOUND = "Uživatel neexistuje.";
const TAKEN = "Uživatelské jméno je už obsazené.";

const PROFILE_COLUMNS = "user_id, username, role, created_at";

export function supabaseDeps(): Deps {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Known auth API failures become UI messages; anything else is a 500.
  const check = (error: { status?: number; code?: string; message: string } | null) => {
    if (!error) return;
    if (error.code === "user_not_found" || error.status === 404) throw new HttpError(404, NOT_FOUND);
    if (error.code === "email_exists" || error.code === "user_already_exists") throw new HttpError(409, TAKEN);
    if (error.code === "weak_password") throw new HttpError(400, "Heslo je příliš slabé.");
    throw new Error(error.message);
  };
  const profile = async (userId: string) => {
    const { data, error } = await db.from("profiles").select(PROFILE_COLUMNS).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data as UserInfo | null;
  };

  return {
    async getCaller(token) {
      const { data, error } = await db.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    async getRole(userId) {
      return (await profile(userId))?.role ?? null;
    },
    async listUsers() {
      const { data, error } = await db.from("profiles").select(PROFILE_COLUMNS).order("username");
      if (error) throw new Error(error.message);
      return data as UserInfo[];
    },
    async createUser(username, password) {
      const { data, error } = await db.auth.admin.createUser({
        email: `${username}@${EMAIL_DOMAIN}`,
        password,
        email_confirm: true,
        user_metadata: { username },
      });
      check(error);
      const created = await profile(data.user!.id);
      if (!created) throw new Error(`profile of ${data.user!.id} was not created`);
      return created;
    },
    async updatePassword(userId, password) {
      check((await db.auth.admin.updateUserById(userId, { password })).error);
    },
    async deleteUser(userId) {
      check((await db.auth.admin.deleteUser(userId)).error); // the profile goes with it (on delete cascade)
    },
    async setRole(userId, role) {
      const { data, error } = await db.from("profiles").update({ role }).eq("user_id", userId).select("user_id");
      if (error) throw new Error(error.message);
      if (data.length === 0) throw new HttpError(404, NOT_FOUND);
    },
    async countAdmins() {
      const { count, error } = await db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async usernameExists(username) {
      const { data, error } = await db.from("profiles").select("user_id").eq("username", username).maybeSingle();
      if (error) throw new Error(error.message);
      return data != null;
    },
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fail = (status: number, message: string) => json(status, { error: message });

const str = (value: unknown) => (typeof value === "string" ? value : "");

function userId(body: Record<string, unknown>): string {
  const id = str(body.user_id);
  if (!UUID_RE.test(id)) throw new HttpError(400, "Chybí nebo je neplatný uživatel.");
  return id;
}

function password(body: Record<string, unknown>): string {
  const value = str(body.password);
  if (value.length < MIN_PASSWORD) throw new HttpError(400, `Heslo musí mít aspoň ${MIN_PASSWORD} znaků.`);
  return value;
}

function role(value: unknown): Role {
  if (value !== "admin" && value !== "user") throw new HttpError(400, "Neplatná role.");
  return value;
}

async function run(body: Record<string, unknown>, callerId: string, deps: Deps): Promise<unknown> {
  switch (body.action) {
    case "list":
      return { users: await deps.listUsers() };

    case "create": {
      const username = str(body.username).trim().toLowerCase();
      if (!USERNAME_RE.test(username)) {
        throw new HttpError(
          400,
          "Uživatelské jméno musí mít 3–32 znaků: malá písmena bez diakritiky, číslice, tečka, pomlčka nebo podtržítko; začíná písmenem nebo číslicí.",
        );
      }
      const pass = password(body);
      const newRole = body.role === undefined ? "user" : role(body.role);
      if (await deps.usernameExists(username)) throw new HttpError(409, TAKEN);
      const user = await deps.createUser(username, pass);
      if (newRole === "admin") {
        await deps.setRole(user.user_id, "admin");
        user.role = "admin";
      }
      return { user };
    }

    case "set_password":
      await deps.updatePassword(userId(body), password(body));
      return {};

    case "delete": {
      const id = userId(body);
      if (id === callerId) throw new HttpError(400, "Sám sebe smazat nemůžeš.");
      await deps.deleteUser(id);
      return {};
    }

    case "set_role": {
      const id = userId(body);
      const newRole = role(body.role);
      const current = await deps.getRole(id);
      if (current === null) throw new HttpError(404, NOT_FOUND);
      if (current === "admin" && newRole === "user" && (await deps.countAdmins()) <= 1) {
        throw new HttpError(400, "Musí zůstat aspoň jeden správce.");
      }
      await deps.setRole(id, newRole);
      return {};
    }

    default:
      throw new HttpError(400, "Neznámá akce.");
  }
}

export async function handler(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return fail(405, "Povolený je jen POST.");

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  try {
    const caller = token ? await deps.getCaller(token) : null;
    if (!caller) return fail(401, "Nejsi přihlášen.");
    if ((await deps.getRole(caller.id)) !== "admin") return fail(403, "Tohle může jen správce.");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail(400, "Neplatný požadavek.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return fail(400, "Neplatný požadavek.");

    return json(200, await run(body as Record<string, unknown>, caller.id, deps));
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    console.error(e);
    return fail(500, "Něco se pokazilo, zkus to znovu.");
  }
}

if (import.meta.main) {
  const deps = supabaseDeps();
  Deno.serve((req) => handler(req, deps));
}
