import { PrismaClient } from "@prisma/client";
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
const r = await gql(`query {
  products(first: 3, query: "title:'Complete Snowboard' OR title:'Multi-managed'") {
    nodes {
      title
      variants(first: 1) {
        nodes {
          sku
          availableForSale
          inventoryItem {
            tracked
            requiresShipping
            inventoryLevels(first: 5) {
              nodes { location { name } quantities(names: ["available"]) { quantity } }
            }
          }
        }
      }
    }
  }
}`);
console.log(JSON.stringify(r.data, null, 1));
await prisma.$disconnect();
