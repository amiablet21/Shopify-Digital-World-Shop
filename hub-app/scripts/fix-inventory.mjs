// 1. Force-set available quantities for the seeded SKUs (productSet's
//    inventoryQuantities did not stick), and 2. unpublish the dev store's
//    generated test products so the grid is pure B2B catalog.
// Usage: node scripts/fix-inventory.mjs
import { PrismaClient } from "@prisma/client";

const QTY = {
  "9V2K8UA#ABA": 61, "A05FXUA#ABA": 140, "C20WBUA#ABA": 72, "I5645-A712SLV": 96,
  "82XF002GUS": 34, "MRXV3LL/A": 48, "SM-X210NZAAXAR": 320, "V3607VM-DS79": 23,
  "A2NVM7-469US": 0, "SDSSDE62-2T00-GAO": 410, "21M5004QUS": 12, "MTJV3AM/A": 8,
};

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

const loc = await gql(
  `query { locations(first: 10) { nodes { id name fulfillsOnlineOrders shipsInventory } } }`,
);
const nodes = loc.data.locations.nodes;
const shipping = nodes.find((l) => l.shipsInventory && l.fulfillsOnlineOrders) ?? nodes[0];
const nonShipping = nodes.filter((l) => l.id !== shipping.id);
console.log(`Stocking at: ${shipping.name}`);
const locationId = shipping.id;

// --- set quantities ---
for (const [sku, quantity] of Object.entries(QTY)) {
  const found = await gql(
    `query($q: String!) { productVariants(first: 1, query: $q) { nodes { id inventoryItem { id } product { id } } } }`,
    { q: `sku:${JSON.stringify(sku)}` },
  );
  const variant = found.data?.productVariants?.nodes?.[0];
  if (!variant) { console.log(`FAILED ${sku}: not found`); continue; }

  // ensure tracking is on
  await gql(
    `mutation($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) { userErrors { message } }
    }`,
    { id: variant.inventoryItem.id, input: { tracked: true } },
  );

  const set = await gql(
    `mutation($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) { userErrors { field message } }
    }`,
    {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [
          { inventoryItemId: variant.inventoryItem.id, locationId, quantity },
          ...nonShipping.map((l) => ({
            inventoryItemId: variant.inventoryItem.id,
            locationId: l.id,
            quantity: 0,
          })),
        ],
      },
    },
  );
  const errs = (set.data?.inventorySetQuantities?.userErrors ?? []).map((e) => e.message).join("; ");
  console.log(`${errs ? "FAILED" : "OK    "} ${sku} -> ${quantity}${errs ? `: ${errs}` : ""}`);
}

// --- unpublish test products ---
const ours = new Set(Object.keys(QTY));
const all = await gql(
  `query { products(first: 100) { nodes { id title publishedAt variants(first: 5) { nodes { sku } } } } }`,
);
const pubs = await gql(`query { publications(first: 10) { nodes { id catalog { title } } } }`);
const online = pubs.data.publications.nodes.find((p) => (p.catalog?.title || "").toLowerCase().includes("online store"));

for (const product of all.data.products.nodes) {
  const isOurs = product.variants.nodes.some((v) => ours.has(v.sku));
  if (isOurs || !product.publishedAt) continue;
  const res = await gql(
    `mutation($id: ID!, $input: [PublicationInput!]!) {
      publishableUnpublish(id: $id, input: $input) { userErrors { message } }
    }`,
    { id: product.id, input: [{ publicationId: online.id }] },
  );
  const errs = (res.data?.publishableUnpublish?.userErrors ?? []).map((e) => e.message).join("; ");
  console.log(`${errs ? "FAILED" : "HIDDEN"} ${product.title}${errs ? `: ${errs}` : ""}`);
}

await prisma.$disconnect();
console.log("\nDone.");
