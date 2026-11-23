import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { type Deps, handler, HttpError, type UserInfo } from "./index.ts";

const base = "http://localhost/functions/v1/admin";
const TOM = "00000000-0000-4000-8000-000000000001"; // admin
const EVA = "00000000-0000-4000-8000-000000000002"; // user
const MISSING = "00000000-0000-4000-8000-0000000000ff";

/** In-memory accounts behind the Deps interface; tokens "tom"/"eva" belong to TOM/EVA. */
function fake() {
  const users = new Map<string, UserInfo>([
    [TOM, { user_id: TOM, username: "tom", role: "admin", created_at: "2026-01-01T00:00:00Z" }],
    [EVA, { user_id: EVA, username: "eva", role: "user", created_at: "2026-01-02T00:00:00Z" }],
  ]);
  const passwords = new Map<string, string>();
  const calls: string[] = [];
  const tokens: Record<string, string> = { tom: TOM, eva: EVA };
  const existing = (id: string) => {
    const user = users.get(id);
    if (!user) throw new HttpError(404, "Uživatel neexistuje.");
    return user;
  };
  let next = 100;
  const deps: Deps = {
    getCaller: (token) => Promise.resolve(Object.hasOwn(tokens, token) ? { id: tokens[token] } : null),
    getRole: (id) => Promise.resolve(users.get(id)?.role ?? null),
    listUsers: () => Promise.resolve([...users.values()].sort((a, b) => a.username.localeCompare(b.username))),
    createUser: (username, password) => {
      calls.push(`create ${username}`);
      const id = `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
      const user: UserInfo = { user_id: id, username, role: "user", created_at: "2026-02-01T00:00:00Z" };
      users.set(id, user);
      passwords.set(id, password);
      return Promise.resolve({ ...user });
    },
    updatePassword: (id, password) => {
      existing(id);
      passwords.set(id, password);
      return Promise.resolve();
    },
    deleteUser: (id) => {
      existing(id);
      users.delete(id);
      return Promise.resolve();
    },
    setRole: (id, role) => {
      existing(id).role = role;
      return Promise.resolve();
    },
    countAdmins: () => Promise.resolve([...users.values()].filter((u) => u.role === "admin").length),
    usernameExists: (username) => Promise.resolve([...users.values()].some((u) => u.username === username)),
  };
  return { deps, users, passwords, calls };
}

const post = (deps: Deps, body: unknown, token: string | null = "tom") =>
  handler(
    new Request(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    deps,
  );

async function expectError(res: Response, status: number, message?: RegExp) {
  assertEquals(res.status, status);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
  if (message) assertMatch(body.error, message);
}

Deno.test("only POST", async () => {
  const { deps } = fake();
  await expectError(await handler(new Request(base, { headers: { Authorization: "Bearer tom" } }), deps), 405);
});

Deno.test("missing or invalid token is 401", async () => {
  const { deps } = fake();
  await expectError(await post(deps, { action: "list" }, null), 401);
  await expectError(await post(deps, { action: "list" }, "forged"), 401);
});

Deno.test("non-admins get 403 for every action and change nothing", async () => {
  const { deps, users, passwords, calls } = fake();
  for (const body of [
    { action: "list" },
    { action: "create", username: "mallory", password: "secret1" },
    { action: "set_password", user_id: TOM, password: "secret1" },
    { action: "delete", user_id: TOM },
    { action: "set_role", user_id: EVA, role: "admin" },
  ]) {
    await expectError(await post(deps, body, "eva"), 403);
  }
  assertEquals(users.size, 2);
  assertEquals(users.get(EVA)!.role, "user");
  assertEquals(passwords.size, 0);
  assertEquals(calls, []);
});

Deno.test("malformed body and unknown action are 400", async () => {
  const { deps } = fake();
  await expectError(await post(deps, "{not json"), 400);
  await expectError(await post(deps, [1, 2]), 400);
  await expectError(await post(deps, { action: "drop_database" }), 400, /Neznámá akce/);
  await expectError(await post(deps, {}), 400, /Neznámá akce/);
});

Deno.test("list returns accounts sorted by username", async () => {
  const { deps } = fake();
  const res = await post(deps, { action: "list" });
  assertEquals(res.status, 200);
  const { users } = await res.json();
  assertEquals(users.map((u: UserInfo) => [u.username, u.role]), [["eva", "user"], ["tom", "admin"]]);
  assertEquals(Object.keys(users[0]).sort(), ["created_at", "role", "user_id", "username"]);
});

Deno.test("create: user by default, admin on request, username normalized", async () => {
  const { deps, users, passwords } = fake();
  let res = await post(deps, { action: "create", username: " Petr ", password: "secret1" });
  assertEquals(res.status, 200);
  const { user } = await res.json();
  assertEquals([user.username, user.role], ["petr", "user"]);
  assertEquals(passwords.get(user.user_id), "secret1");

  res = await post(deps, { action: "create", username: "jana", password: "secret2", role: "admin" });
  assertEquals(res.status, 200);
  const jana = (await res.json()).user;
  assertEquals(jana.role, "admin");
  assertEquals(users.get(jana.user_id)!.role, "admin");
});

Deno.test("create: duplicate 409, bad username, short password and bad role 400", async () => {
  const { deps, calls } = fake();
  await expectError(await post(deps, { action: "create", username: "Eva", password: "secret1" }), 409, /obsazené/);
  for (const username of ["ab", "-eva", "eva novák", "a".repeat(33), "", 42]) {
    await expectError(await post(deps, { action: "create", username, password: "secret1" }), 400, /Uživatelské jméno/);
  }
  await expectError(await post(deps, { action: "create", username: "petr", password: "12345" }), 400, /aspoň 6 znaků/);
  await expectError(await post(deps, { action: "create", username: "petr" }), 400, /aspoň 6 znaků/);
  await expectError(await post(deps, { action: "create", username: "petr", password: "secret1", role: "owner" }), 400);
  assertEquals(calls, []);
});

Deno.test("set_password", async () => {
  const { deps, passwords } = fake();
  const res = await post(deps, { action: "set_password", user_id: EVA, password: "novéheslo" });
  assertEquals([res.status, await res.json()], [200, {}]);
  assertEquals(passwords.get(EVA), "novéheslo");
  await expectError(await post(deps, { action: "set_password", user_id: EVA, password: "short" }), 400);
  await expectError(await post(deps, { action: "set_password", user_id: "nope", password: "secret1" }), 400);
  await expectError(await post(deps, { action: "set_password", user_id: MISSING, password: "secret1" }), 404);
});

Deno.test("delete: others yes, yourself no", async () => {
  const { deps, users } = fake();
  await expectError(await post(deps, { action: "delete", user_id: TOM }), 400, /Sám sebe/);
  assertEquals(users.has(TOM), true);
  const res = await post(deps, { action: "delete", user_id: EVA });
  assertEquals([res.status, await res.json()], [200, {}]);
  assertEquals(users.has(EVA), false);
  await expectError(await post(deps, { action: "delete", user_id: MISSING }), 404);
  await expectError(await post(deps, { action: "delete" }), 400);
});

Deno.test("set_role: grant and revoke, but the last admin stays", async () => {
  const { deps, users } = fake();
  await expectError(await post(deps, { action: "set_role", user_id: TOM, role: "user" }), 400, /aspoň jeden správce/);
  assertEquals(users.get(TOM)!.role, "admin");

  let res = await post(deps, { action: "set_role", user_id: EVA, role: "admin" });
  assertEquals([res.status, await res.json()], [200, {}]);
  assertEquals(users.get(EVA)!.role, "admin");

  // with two admins, either may step down; then the other one is the last
  res = await post(deps, { action: "set_role", user_id: TOM, role: "user" });
  assertEquals(res.status, 200);
  assertEquals(users.get(TOM)!.role, "user");
  await expectError(await post(deps, { action: "set_role", user_id: EVA, role: "user" }, "eva"), 400, /aspoň jeden správce/);

  await expectError(await post(deps, { action: "set_role", user_id: TOM, role: "owner" }, "eva"), 400);
  await expectError(await post(deps, { action: "set_role", user_id: MISSING, role: "admin" }, "eva"), 404);
});

Deno.test("unexpected failures are 500 with a message for the UI", async () => {
  const { deps } = fake();
  deps.listUsers = () => Promise.reject(new Error("connection reset"));
  const original = console.error;
  console.error = () => {};
  try {
    await expectError(await post(deps, { action: "list" }), 500, /zkus to znovu/);
  } finally {
    console.error = original;
  }
});
