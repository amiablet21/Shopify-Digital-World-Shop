import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const session = await prisma.session.findFirst({ where: { isOnline: false } });
const res = await fetch(`https://${session.shop}/admin/api/2026-10/graphql.json`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
  body: JSON.stringify({
    query: `query($q: String!) {
      productVariants(first: 5, query: $q) {
        nodes {
          sku
          availableForSale
          inventoryQuantity
          inventoryPolicy
          product { status publishedAt }
          inventoryItem {
            tracked
            inventoryLevels(first: 3) {
              nodes { location { name } quantities(names: ["available"]) { name quantity } }
            }
          }
        }
      }
    }`,
    variables: { q: 'sku:"9V2K8UA#ABA" OR sku:"MTJV3AM/A"' },
  }),
});
console.log(JSON.stringify(await res.json(), null, 1));
await prisma.$disconnect();
