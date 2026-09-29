export interface AuthUser {
  name: string;
  email: string;
  company: string;
}

const AUTH_KEY = 'campaignmind:auth';
const USER_KEY = 'campaignmind:user';
const PASSWORD_HASH_KEY = 'campaignmind:password-hash';
const LEGACY_PASSWORD_KEY = 'campaignmind:password';

async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function getAuthUser(): AuthUser | null {
  const authenticated = localStorage.getItem(AUTH_KEY);

  if (authenticated !== 'true') {
    return null;
  }

  const storedUser = localStorage.getItem(USER_KEY);

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser) as AuthUser;
  } catch {
    return null;
  }
}

export async function signup(
  user: AuthUser,
  password: string
): Promise<void> {
  localStorage.setItem(AUTH_KEY, 'true');
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(PASSWORD_HASH_KEY, await hashPassword(password));
}

export async function login(
  email: string,
  password: string
): Promise<boolean> {
  const storedUser = localStorage.getItem(USER_KEY);
  const storedPasswordHash = localStorage.getItem(PASSWORD_HASH_KEY);
  const legacyPassword = localStorage.getItem(LEGACY_PASSWORD_KEY);

  if (!storedUser || (!storedPasswordHash && !legacyPassword)) {
    return false;
  }

  try {
    const user = JSON.parse(storedUser) as AuthUser;

    const passwordMatches = storedPasswordHash
      ? storedPasswordHash === (await hashPassword(password))
      : legacyPassword === password;

    if (user.email.toLowerCase() === email.toLowerCase() && passwordMatches) {
      localStorage.setItem(AUTH_KEY, 'true');
      if (!storedPasswordHash) {
        localStorage.setItem(PASSWORD_HASH_KEY, await hashPassword(password));
        localStorage.removeItem(LEGACY_PASSWORD_KEY);
      }
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.clear();
}
