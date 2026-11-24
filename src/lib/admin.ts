import { Role } from "./account";
import { supabase } from "./supabase";

export interface AdminUser {
  user_id: string;
  username: string;
  role: Role;
  created_at?: string;
}

async function postAdmin<T>(body: Record<string, string>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Nejsi přihlášen.");

  const res = await fetch("/api/admin", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Chyba serveru (${res.status})`);
  }
  return data as T;
}

export const AdminAPI = {
  async list(): Promise<AdminUser[]> {
    const res = await postAdmin<{ users: AdminUser[] }>({ action: "list" });
    return res.users;
  },
  async create(username: string, password: string, role: Role): Promise<AdminUser> {
    const res = await postAdmin<{ user: AdminUser }>({
      action: "create",
      username,
      password,
      role,
    });
    return res.user;
  },
  async setPassword(userId: string, password: string): Promise<void> {
    await postAdmin({ action: "set_password", user_id: userId, password });
  },
  async setRole(userId: string, role: Role): Promise<void> {
    await postAdmin({ action: "set_role", user_id: userId, role });
  },
  async remove(userId: string): Promise<void> {
    await postAdmin({ action: "delete", user_id: userId });
  },
};
