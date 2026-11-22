export type DemoRole = "restaurant_manager" | "it_team" | "maintenance_team" | "admin";

export const DEMO_OUTLETS = [
  "Noida Sector 18",
  "Vaishali",
  "Rohini",
  ...Array.from({ length: 21 }, (_, index) => `Outlet ${String(index + 4).padStart(2, "0")}`)
];

export interface DemoSession {
  role: DemoRole;
  email: string;
  outlet?: string;
}

export interface DemoManagerAccount {
  email: string;
  outlet: string;
  salt: string;
  passwordHash: string;
}

const SESSION_KEY = "operations-hub-demo-session";
const OUTLETS_KEY = "operations-hub-demo-outlets";
const MANAGERS_KEY = "operations-hub-demo-managers";
const PASSWORD_ITERATIONS = 120000;

function isValidOutletNames(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(name => typeof name === "string" && name.trim().length > 0 && name.length <= 80)) {
    return false;
  }
  const names = value.map(name => name.trim().toLocaleLowerCase());
  return new Set(names).size === names.length;
}

export function readDemoOutlets(): string[] {
  const saved = localStorage.getItem(OUTLETS_KEY);
  if (!saved) return DEMO_OUTLETS;

  const parsed: unknown = JSON.parse(saved);
  if (!isValidOutletNames(parsed)) {
    throw new Error("Saved outlet settings have an unexpected format.");
  }
  return parsed;
}

export function saveDemoOutlets(outlets: string[]) {
  const names = outlets.map(name => name.trim());
  if (!isValidOutletNames(names)) {
    throw new Error("Outlet names must be non-empty, unique and no longer than 80 characters.");
  }
  localStorage.setItem(OUTLETS_KEY, JSON.stringify(names));
}

function isDemoManagerAccount(value: unknown, outlets: string[]): value is DemoManagerAccount {
  if (typeof value !== "object" || value === null) return false;
  const account = value as Record<string, unknown>;
  return typeof account.email === "string" &&
    account.email.length > 0 &&
    typeof account.outlet === "string" &&
    outlets.includes(account.outlet) &&
    typeof account.salt === "string" &&
    /^[a-f0-9]{32}$/.test(account.salt) &&
    typeof account.passwordHash === "string" &&
    /^[a-f0-9]{64}$/.test(account.passwordHash);
}

export function readDemoManagerAccounts(): DemoManagerAccount[] {
  const saved = localStorage.getItem(MANAGERS_KEY);
  if (!saved) return [];

  const parsed: unknown = JSON.parse(saved);
  const outlets = readDemoOutlets();
  if (
    !Array.isArray(parsed) ||
    !parsed.every(account => isDemoManagerAccount(account, outlets)) ||
    new Set(parsed.map(account => account.email)).size !== parsed.length
  ) {
    throw new Error("Saved manager accounts have an unexpected format.");
  }
  return parsed;
}

function saveDemoManagerAccounts(accounts: DemoManagerAccount[]) {
  localStorage.setItem(MANAGERS_KEY, JSON.stringify(accounts));
}

export function renameDemoOutlet(currentName: string, requestedName: string): string[] {
  const outlets = readDemoOutlets();
  const newName = requestedName.trim();
  if (!outlets.includes(currentName)) throw new Error("The outlet no longer exists.");
  if (!newName || newName.length > 80) throw new Error("Outlet names must be between 1 and 80 characters.");
  if (outlets.some(name => name !== currentName && name.toLocaleLowerCase() === newName.toLocaleLowerCase())) {
    throw new Error("Each outlet must have a unique name.");
  }

  const accounts = readDemoManagerAccounts();
  const session = readDemoSession();
  const updatedOutlets = outlets.map(name => name === currentName ? newName : name);
  localStorage.setItem(OUTLETS_KEY, JSON.stringify(updatedOutlets));
  saveDemoManagerAccounts(accounts.map(account => ({
    ...account,
    outlet: account.outlet === currentName ? newName : account.outlet
  })));
  if (session?.role === "restaurant_manager" && session.outlet === currentName) {
    saveDemoSession({ ...session, outlet: newName });
  }
  return updatedOutlets;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const hash = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: saltBuffer,
    iterations: PASSWORD_ITERATIONS
  }, key, 256);
  return bytesToHex(new Uint8Array(hash));
}

async function createManagerAccount(email: string, outlet: string, password: string): Promise<DemoManagerAccount> {
  const normalizedEmail = email.trim().toLocaleLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Enter a valid manager email address.");
  if (!readDemoOutlets().includes(outlet)) throw new Error("Choose a valid outlet.");
  if (password.length < 8) throw new Error("Manager passwords must be at least 8 characters.");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    email: normalizedEmail,
    outlet,
    salt: bytesToHex(salt),
    passwordHash: await hashPassword(password, salt)
  };
}

export async function addDemoManagerAccount(email: string, outlet: string, password: string): Promise<DemoManagerAccount[]> {
  const accounts = readDemoManagerAccounts();
  const normalizedEmail = email.trim().toLocaleLowerCase();
  if (accounts.some(account => account.email === normalizedEmail)) {
    throw new Error("A manager account already exists for that email.");
  }
  const account = await createManagerAccount(email, outlet, password);
  const updatedAccounts = [...accounts, account];
  saveDemoManagerAccounts(updatedAccounts);
  return updatedAccounts;
}

export async function resetDemoManagerPassword(email: string, password: string): Promise<DemoManagerAccount[]> {
  const accounts = readDemoManagerAccounts();
  const normalizedEmail = email.trim().toLocaleLowerCase();
  const accountIndex = accounts.findIndex(account => account.email === normalizedEmail);
  if (accountIndex < 0) throw new Error("The manager account no longer exists.");
  const updatedAccount = await createManagerAccount(normalizedEmail, accounts[accountIndex].outlet, password);
  const updatedAccounts = accounts.map((account, index) => index === accountIndex ? updatedAccount : account);
  saveDemoManagerAccounts(updatedAccounts);
  return updatedAccounts;
}

export async function authenticateDemoManager(
  email: string,
  password: string,
  fallbackOutlet: string
): Promise<{ outlet: string } | null> {
  const accounts = readDemoManagerAccounts();
  if (accounts.length === 0) return { outlet: fallbackOutlet };

  const account = accounts.find(item => item.email === email.trim().toLocaleLowerCase());
  if (!account) return null;

  const passwordHash = await hashPassword(password, hexToBytes(account.salt));
  return passwordHash === account.passwordHash ? { outlet: account.outlet } : null;
}

export function saveDemoSession(session: DemoSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function readDemoSession(): DemoSession | null {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;

  try {
    const session: unknown = JSON.parse(saved);
    if (
      typeof session === "object" &&
      session !== null &&
      "role" in session &&
      (session.role === "restaurant_manager" ||
        session.role === "it_team" ||
        session.role === "maintenance_team" ||
        session.role === "admin") &&
      "email" in session &&
      typeof session.email === "string" &&
      (session.role !== "restaurant_manager" ||
        ("outlet" in session && typeof session.outlet === "string" && readDemoOutlets().includes(session.outlet)))
    ) {
      return {
        role: session.role,
        email: session.email,
        ...(session.role === "restaurant_manager" && "outlet" in session && typeof session.outlet === "string"
          ? { outlet: session.outlet }
          : {})
      };
    }
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }

  localStorage.removeItem(SESSION_KEY);
  return null;
}

export function clearDemoSession() {
  localStorage.removeItem(SESSION_KEY);
}
