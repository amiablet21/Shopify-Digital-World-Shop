import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const session = await prisma.session.findFirst({ where: { isOnline: false } });
const res = await fetch(`https://${session.shop}/admin/api/2026-10/graphql.json`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
  body: JSON.stringify({ query: `query {
    products(first: 20, query: "snowboard") {
      nodes {
        title
        variants(first: 1) {
          nodes {
            availableForSale
            inventoryItem {
              tracked requiresShipping
              inventoryLevels(first: 5) {
                nodes { location { name } quantities(names: ["available"]) { quantity } }
              }
            }
          }
        }
      }
    }
  }` }),
});
const data = (await res.json()).data;
for (const p of data.products.nodes) {
  const v = p.variants.nodes[0];
  const levels = v.inventoryItem.inventoryLevels.nodes.map(l => `${l.location.name}=${l.quantities[0]?.quantity}`).join(", ");
  console.log(`${p.title} | avail:${v.availableForSale} tracked:${v.inventoryItem.tracked} | ${levels || "no levels"}`);
}
await prisma.$disconnect();
