// Tag all existing customers as approved so current accounts are not locked
// out when the wholesale gate goes live. Usage: node scripts/tag-customers.mjs
import { PrismaClient } from "@prisma/client";

const TAG = "approved";
const prisma = new PrismaClient();
const session = await prisma.session.findFirst({ where: { isOnline: false } });
const gql = async (query, variables = {}) => {
  const res = await fetch(`https://${session.shop}/admin/api/2026-10/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
};

const customers = await gql(`query { customers(first: 100) { nodes { id email tags } } }`);
for (const customer of customers.data.customers.nodes) {
  if (customer.tags.includes(TAG)) {
    console.log(`OK     ${customer.email} (already tagged)`);
    continue;
  }
  const r = await gql(
    `mutation($input: CustomerInput!) {
      customerUpdate(input: $input) { customer { id } userErrors { message } }
    }`,
    { input: { id: customer.id, tags: [...customer.tags, TAG] } },
  );
  const errs = [...(r.errors ?? []), ...(r.data?.customerUpdate?.userErrors ?? [])].map((e) => e.message).join("; ");
  console.log(`${errs ? "FAILED" : "OK    "} ${customer.email}${errs ? `: ${errs}` : ""}`);
}
await prisma.$disconnect();
