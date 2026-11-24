"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  authErrorMessage,
  DEFAULT_PLACES,
  isValidPassword,
  normalizeUsername,
  OTHER_PLACE,
  PASSWORD_HINT,
  Profile,
  Role,
  roleLabel,
  USERNAME_HINT,
} from "@/lib/account";
import { ACCENTS, AccentOption, formatDayCzech, ThemeOption } from "@/lib/models";
import { AdminAPI, AdminUser } from "@/lib/admin";
import { APP_VERSION, BUILD_NUMBER, IS_BETA, RELEASES } from "@/lib/changelog";

type SubScreen =
  | { type: "root" }
  | { type: "password" }
  | { type: "places" }
  | { type: "users" }
  | { type: "userDetail"; user: AdminUser; isLastAdmin: boolean }
  | { type: "userPassword"; user: AdminUser }
  | { type: "changelog" };

export function SettingsView({
  profile,
  profileError,
  onReloadProfile,
  onSavePlaces,
  theme,
  onChangeTheme,
  accent,
  onChangeAccent,
}: {
  profile: Profile | null;
  profileError: string | null;
  onReloadProfile: () => Promise<void>;
  onSavePlaces: (places: string[] | null) => Promise<void>;
  theme: ThemeOption;
  onChangeTheme: (t: ThemeOption) => void;
  accent: AccentOption;
  onChangeAccent: (a: AccentOption) => void;
}) {
  const [sub, setSub] = useState<SubScreen>({ type: "root" });
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    setConfirmSignOut(false);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      setSignOutError(e instanceof Error ? e.message : "Nepodařilo se odhlásit.");
    }
  }

  if (sub.type === "password") {
    return (
      <NewPasswordScreen
        title="Změnit heslo"
        onBack={() => setSub({ type: "root" })}
        onSave={async (password) => {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
        }}
      />
    );
  }

  if (sub.type === "places") {
    return (
      <PlacesScreen
        profile={profile}
        onBack={() => setSub({ type: "root" })}
        onSavePlaces={onSavePlaces}
      />
    );
  }

  if (sub.type === "users") {
    return (
      <UsersScreen
        currentUserId={profile?.user_id ?? null}
        onBack={() => setSub({ type: "root" })}
        onSelectUser={(u, isLastAdmin) =>
          setSub({ type: "userDetail", user: u, isLastAdmin })
        }
      />
    );
  }

  if (sub.type === "userDetail") {
    return (
      <UserDetailScreen
        user={sub.user}
        isSelf={sub.user.user_id === profile?.user_id}
        isLastAdmin={sub.isLastAdmin}
        onBack={() => setSub({ type: "users" })}
        onSetPassword={() => setSub({ type: "userPassword", user: sub.user })}
        onSelfRoleChanged={onReloadProfile}
      />
    );
  }

  if (sub.type === "userPassword") {
    return (
      <NewPasswordScreen
        title="Nastavit heslo"
        onBack={() =>
          setSub({ type: "userDetail", user: sub.user, isLastAdmin: false })
        }
        onSave={async (password) => {
          await AdminAPI.setPassword(sub.user.user_id, password);
        }}
      />
    );
  }

  if (sub.type === "changelog") {
    return <ChangelogScreen onBack={() => setSub({ type: "root" })} />;
  }

  return (
    <div className="screen-container">
      <div className="top-header-row">
        <h1 className="large-title">Nastavení</h1>
      </div>

      <div className="ios-section">
        <div className="ios-section-header">Účet</div>
        <div className="ios-card">
          {profile ? (
            <>
              <div className="ios-row space-between">
                <span>Uživatelské jméno</span>
                <span className="secondary-text">{profile.username}</span>
              </div>
              <div className="ios-row space-between">
                <span>Role</span>
                <span className="secondary-text">{roleLabel(profile.role)}</span>
              </div>
            </>
          ) : profileError ? (
            <>
              <div className="ios-row error-text">{profileError}</div>
              <button
                type="button"
                className="ios-row ios-button-row accent-text"
                onClick={() => void onReloadProfile()}
              >
                Zkusit znovu
              </button>
            </>
          ) : (
            <div className="ios-row secondary-text">Načítám profil…</div>
          )}
          <button
            type="button"
            className="ios-row ios-button-row space-between"
            onClick={() => setSub({ type: "password" })}
          >
            <span>Změnit heslo</span>
            <ChevronRight size={18} className="chevron-icon" />
          </button>
        </div>
      </div>

      <div className="ios-section">
        <div className="ios-section-header">Vzhled</div>
        <div className="ios-card">
          <div className="ios-row space-between">
            <span>Motiv</span>
            <select
              className="ios-select"
              value={theme}
              onChange={(e) => onChangeTheme(e.target.value as ThemeOption)}
            >
              <option value="system">Podle systému</option>
              <option value="light">Světlý</option>
              <option value="dark">Tmavý</option>
            </select>
          </div>
          <div className="ios-row space-between">
            <span>Barva</span>
            <div className="accent-swatches">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="swatch-btn"
                  style={{ backgroundColor: a.hex }}
                  onClick={() => onChangeAccent(a.id)}
                  aria-label={a.label}
                  title={a.label}
                >
                  {accent === a.id && <Check size={14} color="#fff" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="ios-section">
        <div className="ios-section-header">Místa</div>
        <div className="ios-card">
          <button
            type="button"
            className="ios-row ios-button-row space-between"
            onClick={() => setSub({ type: "places" })}
          >
            <span>Moje místa</span>
            <ChevronRight size={18} className="chevron-icon" />
          </button>
        </div>
      </div>

      {profile?.role === "admin" && (
        <div className="ios-section">
          <div className="ios-section-header">Správa uživatelů</div>
          <div className="ios-card">
            <button
              type="button"
              className="ios-row ios-button-row space-between"
              onClick={() => setSub({ type: "users" })}
            >
              <span>Uživatelé</span>
              <ChevronRight size={18} className="chevron-icon" />
            </button>
          </div>
        </div>
      )}

      <div className="ios-section">
        <div className="ios-section-header">O aplikaci</div>
        <div className="ios-card">
          <div className="ios-row space-between">
            <span>Verze</span>
            <span className="version-wrap">
              <span className="secondary-text">
                {APP_VERSION} ({BUILD_NUMBER})
              </span>
              {IS_BETA && <span className="beta-badge">BETA</span>}
            </span>
          </div>
          <button
            type="button"
            className="ios-row ios-button-row space-between"
            onClick={() => setSub({ type: "changelog" })}
          >
            <span>Co je nového</span>
            <ChevronRight size={18} className="chevron-icon" />
          </button>
        </div>
      </div>

      <div className="ios-section">
        <div className="ios-card">
          <button
            type="button"
            className="ios-row ios-button-row destructive-text"
            onClick={() => setConfirmSignOut(true)}
          >
            Odhlásit
          </button>
        </div>
        {signOutError && <div className="ios-section-footer error-text">{signOutError}</div>}
      </div>

      {confirmSignOut && (
        <div className="modal-backdrop" onClick={() => setConfirmSignOut(false)}>
          <div className="ios-alert" onClick={(e) => e.stopPropagation()}>
            <h3>Odhlásit se?</h3>
            <div className="ios-alert-actions">
              <button
                type="button"
                className="ios-alert-btn"
                onClick={() => setConfirmSignOut(false)}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="ios-alert-btn destructive bold"
                onClick={() => void signOut()}
              >
                Odhlásit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewPasswordScreen({
  title,
  onBack,
  onSave,
}: {
  title: string;
  onBack: () => void;
  onSave: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problem = !isValidPassword(password)
    ? PASSWORD_HINT
    : password !== repeated
    ? "Hesla se neshodují."
    : null;

  async function submit() {
    if (saving || problem) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(password);
      setDone(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen-container">
      <div className="top-navbar">
        <button type="button" className="nav-back-btn" onClick={onBack}>
          <ChevronLeft size={22} />
          <span>Zpět</span>
        </button>
        <div className="nav-inline-title">{title}</div>
        <button
          type="button"
          className="nav-action-btn bold"
          disabled={problem !== null || saving}
          onClick={() => void submit()}
        >
          Uložit
        </button>
      </div>

      <div className="ios-section">
        <div className="ios-card">
          <div className="ios-row">
            <input
              type="password"
              className="ios-input"
              placeholder="Nové heslo"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="ios-row">
            <input
              type="password"
              className="ios-input"
              placeholder="Nové heslo znovu"
              autoComplete="new-password"
              value={repeated}
              onChange={(e) => setRepeated(e.target.value)}
            />
          </div>
        </div>
        {password.length > 0 && repeated.length > 0 && problem && (
          <div className="ios-section-footer">{problem}</div>
        )}
      </div>

      {error && (
        <div className="ios-section">
          <div className="ios-card">
            <div className="ios-row error-text">{error}</div>
          </div>
        </div>
      )}

      {done && (
        <div className="modal-backdrop" onClick={onBack}>
          <div className="ios-alert" onClick={(e) => e.stopPropagation()}>
            <h3>Heslo je změněné</h3>
            <div className="ios-alert-actions">
              <button type="button" className="ios-alert-btn bold" onClick={onBack}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlacesScreen({
  profile,
  onBack,
  onSavePlaces,
}: {
  profile: Profile | null;
  onBack: () => void;
  onSavePlaces: (places: string[] | null) => Promise<void>;
}) {
  const [newPlace, setNewPlace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const places = profile?.places ?? DEFAULT_PLACES;
  const trimmed = newPlace.trim();
  const canAdd =
    trimmed.length > 0 &&
    ![...places, OTHER_PLACE].some((p) => p.toLowerCase() === trimmed.toLowerCase());

  async function save(updated: string[] | null) {
    try {
      await onSavePlaces(updated);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se uložit místa.");
    }
  }

  function add() {
    if (!canAdd) return;
    void save([...places, trimmed]);
    setNewPlace("");
  }

  function move(idx: number, delta: number) {
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= places.length) return;
    const copy = [...places];
    const [removed] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, removed);
    void save(copy);
  }

  function removeAt(idx: number) {
    const copy = places.filter((_, i) => i !== idx);
    void save(copy);
  }

  return (
    <div className="screen-container">
      <div className="top-navbar">
        <button type="button" className="nav-back-btn" onClick={onBack}>
          <ChevronLeft size={22} />
          <span>Nastavení</span>
        </button>
        <div className="nav-inline-title">Moje místa</div>
        <span className="nav-btn-placeholder" />
      </div>

      <div className="ios-section">
        <div className="ios-card">
          <div className="ios-row space-between">
            <input
              type="text"
              className="ios-input"
              placeholder="Nové místo"
              value={newPlace}
              onChange={(e) => setNewPlace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            <button
              type="button"
              className="text-nav-btn accent-text bold"
              disabled={!canAdd}
              onClick={add}
            >
              Přidat
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="ios-section">
          <div className="ios-card">
            <div className="ios-row error-text">{error}</div>
          </div>
        </div>
      )}

      <div className="ios-section">
        <div className="ios-card">
          {places.map((p, idx) => (
            <div key={p} className="ios-row space-between">
              <span>{p}</span>
              <div className="row-actions">
                <button
                  type="button"
                  className="icon-subtle-btn"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                  title="Posunout nahoru"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon-subtle-btn"
                  disabled={idx === places.length - 1}
                  onClick={() => move(idx, 1)}
                  title="Posunout dolů"
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="icon-danger-btn"
                  onClick={() => removeAt(idx)}
                  title="Smazat"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="ios-section-footer">
          „{OTHER_PLACE}“ s vlastním textem je při přidávání zhlédnutí k dispozici vždy.
        </div>
      </div>

      <div className="ios-section">
        <div className="ios-card">
          <button
            type="button"
            className="ios-row ios-button-row accent-text"
            disabled={profile?.places == null}
            onClick={() => setConfirmReset(true)}
          >
            Obnovit výchozí
          </button>
        </div>
      </div>

      {confirmReset && (
        <div className="modal-backdrop" onClick={() => setConfirmReset(false)}>
          <div className="ios-alert" onClick={(e) => e.stopPropagation()}>
            <h3>Obnovit výchozí místa?</h3>
            <div className="ios-alert-actions">
              <button
                type="button"
                className="ios-alert-btn"
                onClick={() => setConfirmReset(false)}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="ios-alert-btn destructive bold"
                onClick={() => {
                  setConfirmReset(false);
                  void save(null);
                }}
              >
                Obnovit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersScreen({
  onBack,
  onSelectUser,
}: {
  currentUserId: string | null;
  onBack: () => void;
  onSelectUser: (user: AdminUser, isLastAdmin: boolean) => void;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await AdminAPI.list();
      setUsers(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba při načítání uživatelů.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const adminCount = users.filter((u) => u.role === "admin").length;

  const createProblem =
    normalizeUsername(newUsername) === null
      ? USERNAME_HINT
      : !isValidPassword(newPassword)
      ? PASSWORD_HINT
      : null;

  async function createUser() {
    const normalized = normalizeUsername(newUsername);
    if (savingUser || !normalized || !isValidPassword(newPassword)) return;
    setSavingUser(true);
    setCreateError(null);
    try {
      const created = await AdminAPI.create(
        normalized,
        newPassword,
        newIsAdmin ? "admin" : "user"
      );
      setUsers((prev) =>
        [...prev, created].sort((a, b) => a.username.localeCompare(b.username))
      );
      setCreating(false);
      setNewUsername("");
      setNewPassword("");
      setNewIsAdmin(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Nepodařilo se vytvořit účet.");
    } finally {
      setSavingUser(false);
    }
  }

  return (
    <div className="screen-container">
      <div className="top-navbar">
        <button type="button" className="nav-back-btn" onClick={onBack}>
          <ChevronLeft size={22} />
          <span>Nastavení</span>
        </button>
        <div className="nav-inline-title">Uživatelé</div>
        <button
          type="button"
          className="nav-action-btn"
          onClick={() => {
            setCreateError(null);
            setCreating(true);
          }}
        >
          <Plus size={18} />
          <span>Nový</span>
        </button>
      </div>

      {error && (
        <div className="ios-section">
          <div className="ios-card">
            <div className="ios-row error-text">{error}</div>
          </div>
        </div>
      )}

      {!loaded && !error && (
        <div className="center-pad secondary-text">Načítám uživatele…</div>
      )}

      {users.length > 0 && (
        <div className="ios-section">
          <div className="ios-card">
            {users.map((u) => (
              <button
                key={u.user_id}
                type="button"
                className="ios-row ios-button-row space-between"
                onClick={() =>
                  onSelectUser(u, u.role === "admin" && adminCount === 1)
                }
              >
                <span>{u.username}</span>
                <div className="row-actions">
                  {u.role === "admin" && (
                    <span className="role-badge">{roleLabel(u.role)}</span>
                  )}
                  <ChevronRight size={18} className="chevron-icon" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <div className="modal-backdrop" onClick={() => setCreating(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-navbar">
              <button
                type="button"
                className="nav-btn"
                onClick={() => setCreating(false)}
              >
                Zrušit
              </button>
              <div className="nav-title">Nový uživatel</div>
              <button
                type="button"
                className="nav-btn bold"
                disabled={createProblem !== null || savingUser}
                onClick={() => void createUser()}
              >
                Uložit
              </button>
            </div>
            <div className="modal-body">
              <div className="ios-section">
                <div className="ios-card">
                  <div className="ios-row">
                    <input
                      type="text"
                      className="ios-input"
                      placeholder="Uživatelské jméno"
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                    />
                  </div>
                  <div className="ios-row">
                    <input
                      type="password"
                      className="ios-input"
                      placeholder="Heslo"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div className="ios-row space-between">
                    <span>Správce</span>
                    <input
                      type="checkbox"
                      className="ios-switch"
                      checked={newIsAdmin}
                      onChange={(e) => setNewIsAdmin(e.target.checked)}
                    />
                  </div>
                </div>
                {newUsername.length > 0 && newPassword.length > 0 && createProblem && (
                  <div className="ios-section-footer">{createProblem}</div>
                )}
              </div>

              {createError && (
                <div className="ios-section">
                  <div className="ios-card">
                    <div className="ios-row error-text">{createError}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserDetailScreen({
  user,
  isSelf,
  isLastAdmin,
  onBack,
  onSetPassword,
  onSelfRoleChanged,
}: {
  user: AdminUser;
  isSelf: boolean;
  isLastAdmin: boolean;
  onBack: () => void;
  onSetPassword: () => void;
  onSelfRoleChanged: () => Promise<void>;
}) {
  const [role, setRole] = useState<Role>(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function toggleRole(nextAdmin: boolean) {
    const newRole: Role = nextAdmin ? "admin" : "user";
    if (busy || newRole === role) return;
    setBusy(true);
    setError(null);
    try {
      await AdminAPI.setRole(user.user_id, newRole);
      setRole(newRole);
      if (isSelf) await onSelfRoleChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se změnit roli.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (busy) return;
    setConfirmDelete(false);
    setBusy(true);
    setError(null);
    try {
      await AdminAPI.remove(user.user_id);
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se smazat účet.");
      setBusy(false);
    }
  }

  return (
    <div className="screen-container">
      <div className="top-navbar">
        <button type="button" className="nav-back-btn" onClick={onBack}>
          <ChevronLeft size={22} />
          <span>Uživatelé</span>
        </button>
        <div className="nav-inline-title">{user.username}</div>
        <span className="nav-btn-placeholder" />
      </div>

      <div className="ios-section">
        <div className="ios-card">
          <div className="ios-row space-between">
            <span>Uživatelské jméno</span>
            <span className="secondary-text">{user.username}</span>
          </div>
          {isLastAdmin ? (
            <div className="ios-row space-between">
              <span>Role</span>
              <span className="secondary-text">{roleLabel(role)}</span>
            </div>
          ) : (
            <div className="ios-row space-between">
              <span>Správce</span>
              <input
                type="checkbox"
                className="ios-switch"
                disabled={busy}
                checked={role === "admin"}
                onChange={(e) => void toggleRole(e.target.checked)}
              />
            </div>
          )}
        </div>
        {isLastAdmin && (
          <div className="ios-section-footer">
            Poslední správce nemůže o roli přijít.
          </div>
        )}
      </div>

      <div className="ios-section">
        <div className="ios-card">
          <button
            type="button"
            className="ios-row ios-button-row space-between"
            onClick={onSetPassword}
          >
            <span>Nastavit heslo</span>
            <ChevronRight size={18} className="chevron-icon" />
          </button>
        </div>
      </div>

      {error && (
        <div className="ios-section">
          <div className="ios-card">
            <div className="ios-row error-text">{error}</div>
          </div>
        </div>
      )}

      {!isSelf && (
        <div className="ios-section">
          <div className="ios-card">
            <button
              type="button"
              disabled={busy}
              className="ios-row ios-button-row destructive-text"
              onClick={() => setConfirmDelete(true)}
            >
              Smazat účet
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="ios-alert" onClick={(e) => e.stopPropagation()}>
            <h3>Smazat účet {user.username}?</h3>
            <p>Smažou se i všechna jeho zhlédnutí a seznam Chci vidět.</p>
            <div className="ios-alert-actions">
              <button
                type="button"
                className="ios-alert-btn"
                onClick={() => setConfirmDelete(false)}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="ios-alert-btn destructive bold"
                onClick={() => void deleteUser()}
              >
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangelogScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen-container">
      <div className="top-navbar">
        <button type="button" className="nav-back-btn" onClick={onBack}>
          <ChevronLeft size={22} />
          <span>Nastavení</span>
        </button>
        <div className="nav-inline-title">Co je nového</div>
        <span className="nav-btn-placeholder" />
      </div>

      {RELEASES.map((rel) => (
        <div key={rel.version} className="ios-section">
          <div className="ios-section-header space-between">
            <span>Verze {rel.version}</span>
            {rel.date && <span>{formatDayCzech(rel.date)}</span>}
          </div>
          <div className="ios-card">
            {rel.items.map((item, idx) => (
              <div key={idx} className="ios-row changelog-item-row">
                <Sparkles size={15} className="accent-text shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
