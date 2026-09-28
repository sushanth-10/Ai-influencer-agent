export interface AuthUser {
  name: string;
  email: string;
  company: string;
}

const AUTH_KEY = 'campaignmind:auth';
const USER_KEY = 'campaignmind:user';
const PASSWORD_KEY = 'campaignmind:password';

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

export function signup(
  user: AuthUser,
  password: string
): void {
  localStorage.setItem(AUTH_KEY, 'true');
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  // Demo-only authentication.
  // Replace with backend authentication before production.
  localStorage.setItem(PASSWORD_KEY, password);
}

export function login(
  email: string,
  password: string
): boolean {
  const storedUser = localStorage.getItem(USER_KEY);
  const storedPassword = localStorage.getItem(PASSWORD_KEY);

  if (!storedUser || !storedPassword) {
    return false;
  }

  try {
    const user = JSON.parse(storedUser) as AuthUser;

    if (
      user.email.toLowerCase() === email.toLowerCase() &&
      storedPassword === password
    ) {
      localStorage.setItem(AUTH_KEY, 'true');
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
