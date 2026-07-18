// Run the store seeding from the command line, using the offline access
// token the dev server stored after installing on the dev store.
// Usage: node scripts/seed-cli.mjs
import { PrismaClient } from "@prisma/client";
import { seedStore } from "../app/seed.server.ts";

const prisma = new PrismaClient();
const session = await prisma.session.findFirst({ where: { isOnline: false } });
if (!session) {
  console.error("No offline session found. Run `npm run dev` and open the app once first.");
  process.exit(1);
}

const API_VERSION = "2026-10";
const admin = {
  graphql: async (query, options = {}) =>
    fetch(`https://${session.shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables: options.variables ?? {} }),
    }),
};

console.log(`Seeding ${session.shop} ...`);
const results = await seedStore(admin);
for (const r of results) {
  console.log(`${r.ok ? "OK    " : "FAILED"} ${r.step}: ${r.detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} steps succeeded`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
