import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
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
const found = await gql(
  `query($q: String!) { productVariants(first: 1, query: $q) { nodes { inventoryItem { id } } } }`,
  { q: 'sku:"9V2K8UA#ABA"' },
);
const itemId = found.data.productVariants.nodes[0].inventoryItem.id;
const act = await gql(
  `mutation($inventoryItemId: ID!, $locationId: ID!, $available: Int, $key: String!) {
    inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available) @idempotent(key: $key) {
      inventoryLevel { id quantities(names: ["available"]) { quantity } }
      userErrors { field message }
    }
  }`,
  { inventoryItemId: itemId, locationId: "gid://shopify/Location/88347476199", available: 61, key: randomUUID() },
);
console.log(JSON.stringify(act, null, 1));
await prisma.$disconnect();
