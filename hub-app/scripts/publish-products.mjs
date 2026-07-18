// Publish the seeded products to the Online Store sales channel.
// API-created products are unpublished by default. Usage: node scripts/publish-products.mjs
import { PrismaClient } from "@prisma/client";

const SKUS = [
  "9V2K8UA#ABA", "A05FXUA#ABA", "C20WBUA#ABA", "I5645-A712SLV", "82XF002GUS",
  "MRXV3LL/A", "SM-X210NZAAXAR", "V3607VM-DS79", "A2NVM7-469US",
  "SDSSDE62-2T00-GAO", "21M5004QUS", "MTJV3AM/A",
];

const prisma = new PrismaClient();
const session = await prisma.session.findFirst({ where: { isOnline: false } });
if (!session) {
  console.error("No offline session found.");
  process.exit(1);
}

const gql = async (query, variables = {}) => {
  const res = await fetch(`https://${session.shop}/admin/api/2026-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
};

const pubs = await gql(`query { publications(first: 10) { nodes { id catalog { title } } } }`);
const nodes = pubs.data?.publications?.nodes ?? [];
const online = nodes.find((p) => (p.catalog?.title || "").toLowerCase().includes("online store")) ?? nodes[0];
if (!online) {
  console.error("No publication found:", JSON.stringify(pubs));
  process.exit(1);
}
console.log(`Publishing to: ${online.catalog?.title ?? online.id}`);

let ok = 0;
for (const sku of SKUS) {
  const found = await gql(
    `query($q: String!) { productVariants(first: 1, query: $q) { nodes { product { id title } } } }`,
    { q: `sku:${JSON.stringify(sku)}` },
  );
  const product = found.data?.productVariants?.nodes?.[0]?.product;
  if (!product) {
    console.log(`FAILED ${sku}: product not found`);
    continue;
  }
  const pub = await gql(
    `mutation($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { message }
      }
    }`,
    { id: product.id, input: [{ publicationId: online.id }] },
  );
  const errs = (pub.data?.publishablePublish?.userErrors ?? []).map((e) => e.message).join("; ");
  console.log(`${errs ? "FAILED" : "OK    "} ${sku}${errs ? `: ${errs}` : ""}`);
  if (!errs) ok++;
}
console.log(`\n${ok}/${SKUS.length} published`);
await prisma.$disconnect();
