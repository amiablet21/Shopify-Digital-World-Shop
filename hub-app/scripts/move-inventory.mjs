// Properly stock each seeded SKU at the shipping location using
// inventoryActivate (creates the item-location connection with a quantity),
// then deactivate the non-shipping location so each item has one warehouse.
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

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
const shipping = loc.data.locations.nodes.find((l) => l.shipsInventory && l.fulfillsOnlineOrders);
console.log(`Shipping location: ${shipping.name}`);

for (const [sku, quantity] of Object.entries(QTY)) {
  const found = await gql(
    `query($q: String!) {
      productVariants(first: 1, query: $q) {
        nodes {
          inventoryItem {
            id
            inventoryLevels(first: 5) { nodes { id location { id name } } }
          }
        }
      }
    }`,
    { q: `sku:${JSON.stringify(sku)}` },
  );
  const item = found.data?.productVariants?.nodes?.[0]?.inventoryItem;
  if (!item) { console.log(`FAILED ${sku}: not found`); continue; }

  const act = await gql(
    `mutation($inventoryItemId: ID!, $locationId: ID!, $available: Int, $key: String!) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available) @idempotent(key: $key) {
        inventoryLevel { id }
        userErrors { message }
      }
    }`,
    { inventoryItemId: item.id, locationId: shipping.id, available: quantity, key: randomUUID() },
  );
  const actErrs = [
    ...(act.errors ?? []).map((e) => e.message),
    ...(act.data?.inventoryActivate?.userErrors ?? []).map((e) => e.message),
  ].join("; ");

  let deactErrs = "";
  for (const level of item.inventoryLevels.nodes) {
    if (level.location.id === shipping.id) continue;
    const de = await gql(
      `mutation($id: ID!, $key: String!) { inventoryDeactivate(inventoryLevelId: $id) @idempotent(key: $key) { userErrors { message } } }`,
      { id: level.id, key: randomUUID() },
    );
    deactErrs += [
      ...(de.errors ?? []).map((e) => e.message),
      ...(de.data?.inventoryDeactivate?.userErrors ?? []).map((e) => e.message),
    ].join("; ");
  }

  const errs = [actErrs, deactErrs].filter(Boolean).join(" | ");
  console.log(`${errs ? "FAILED" : "OK    "} ${sku} -> ${quantity} @ ${shipping.name}${errs ? `: ${errs}` : ""}`);
}

await prisma.$disconnect();
console.log("\nDone.");
