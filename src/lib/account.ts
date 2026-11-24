export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const MIN_PASSWORD_LENGTH = 6;
export const EMAIL_DOMAIN = "users.filmoteka.app";

export const USERNAME_HINT =
  "Jméno má 3–32 znaků: malá písmena bez diakritiky, číslice, tečka, podtržítko nebo pomlčka; začíná písmenem nebo číslicí.";
export const PASSWORD_HINT = `Heslo musí mít aspoň ${MIN_PASSWORD_LENGTH} znaků.`;

export function normalizeUsername(input: string): string | null {
  let clean = input.trim().toLowerCase();
  // Kdyby uživatel ze zvyku zadal "jmeno@users.filmoteka.app", ořízneme interní doménu:
  if (clean.endsWith(`@${EMAIL_DOMAIN}`)) {
    clean = clean.slice(0, -(EMAIL_DOMAIN.length + 1));
  }
  return USERNAME_PATTERN.test(clean) ? clean : null;
}

export function internalEmail(username: string): string {
  return `${username}@${EMAIL_DOMAIN}`;
}

export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export function authErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Něco se nepovedlo, zkus to znovu.";
  }
  const err = error as { code?: string; message?: string };
  switch (err.code) {
    case "invalid_credentials":
      return "Špatné jméno nebo heslo";
    case "user_already_exists":
    case "email_exists":
      return "Jméno je obsazené";
    case "weak_password":
      return "Heslo je příliš slabé";
    case "same_password":
      return "Nové heslo je stejné jako současné";
    case "session_not_found":
      return "Nejsi přihlášen.";
    default:
      if (err.message?.toLowerCase().includes("invalid login credentials")) {
        return "Špatné jméno nebo heslo";
      }
      return "Něco se nepovedlo, zkus to znovu.";
  }
}

export type Role = "admin" | "user";

export function roleLabel(role: Role): string {
  return role === "admin" ? "Správce" : "Uživatel";
}

export interface Profile {
  user_id: string;
  username: string;
  role: Role;
  places: string[] | null;
}

export const DEFAULT_PLACES = [
  "Jellyfin",
  "Netflix",
  "HBO Max",
  "Disney+",
  "Prime Video",
  "Apple TV+",
  "SkyShowtime",
  "Kino",
  "TV",
];

export const OTHER_PLACE = "Jiné";
