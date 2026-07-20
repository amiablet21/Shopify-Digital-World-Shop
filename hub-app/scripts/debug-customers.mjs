import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const session = await prisma.session.findFirst({ where: { isOnline: false } });
const res = await fetch(`https://${session.shop}/admin/api/2026-10/graphql.json`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
  body: JSON.stringify({ query: `query { customers(first: 5) { nodes { id email tags } } }` }),
});
console.log(JSON.stringify(await res.json(), null, 1));
await prisma.$disconnect();
