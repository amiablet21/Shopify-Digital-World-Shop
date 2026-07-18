// Usage: npm run create-user -- email@company.com "password" "Contact Name"
import { createUser } from '../accounts.mjs';

const [email, password, name] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run create-user -- <email> <password> [name]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
const user = createUser(email, password, name);
console.log(`Created user ${user.email}${user.name ? ` (${user.name})` : ''}`);
