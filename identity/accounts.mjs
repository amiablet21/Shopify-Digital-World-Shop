// Simple file-backed user store for development.
// Swap the internals for Postgres before production; the exported
// interface is all the rest of the service knows about.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), 'data', 'users.json');

function load() {
  if (!existsSync(DATA_FILE)) return {};
  return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
}

function save(users) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

export function createUser(email, password, name) {
  const users = load();
  const id = email.trim().toLowerCase();
  if (users[id]) throw new Error(`User ${id} already exists`);
  users[id] = {
    id,
    email: id,
    name: name || '',
    hash: bcrypt.hashSync(password, 12),
    createdAt: new Date().toISOString(),
  };
  save(users);
  return users[id];
}

export function findUser(email) {
  const users = load();
  return users[String(email).trim().toLowerCase()] || null;
}

export function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.hash);
}

// oidc-provider hook: resolves an account id (we use the email) into claims.
// email_verified is always true because accounts are created only through
// the approved wholesale-application flow, never open self-signup.
export async function findAccount(ctx, id) {
  const user = findUser(id);
  if (!user) return undefined;
  return {
    accountId: user.id,
    async claims() {
      return {
        sub: user.id,
        email: user.email,
        email_verified: true,
        name: user.name,
      };
    },
  };
}
