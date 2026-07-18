// Point the My Offers page at its theme template and create the
// Notifications page. Usage: node scripts/fix-pages.mjs
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

// 1. set templateSuffix on the existing my-offers page
const pages = await gql(`query { pages(first: 20) { nodes { id handle templateSuffix } } }`);
const myOffers = pages.data.pages.nodes.find((p) => p.handle === "my-offers");
if (myOffers && myOffers.templateSuffix !== "my-offers") {
  const r = await gql(
    `mutation($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) { userErrors { message } }
    }`,
    { id: myOffers.id, page: { templateSuffix: "my-offers" } },
  );
  const errs = [...(r.errors ?? []), ...(r.data?.pageUpdate?.userErrors ?? [])].map((e) => e.message).join("; ");
  console.log(`${errs ? "FAILED" : "OK    "} my-offers template${errs ? `: ${errs}` : ""}`);
} else {
  console.log(`OK     my-offers template (already set or missing: ${Boolean(myOffers)})`);
}

// 2. create the notifications page
const existing = pages.data.pages.nodes.find((p) => p.handle === "notifications");
if (!existing) {
  const r = await gql(
    `mutation($page: PageCreateInput!) {
      pageCreate(page: $page) { page { id } userErrors { message } }
    }`,
    { page: { title: "Notifications", handle: "notifications", body: "", isPublished: true, templateSuffix: "notifications" } },
  );
  const errs = [...(r.errors ?? []), ...(r.data?.pageCreate?.userErrors ?? [])].map((e) => e.message).join("; ");
  console.log(`${errs ? "FAILED" : "OK    "} notifications page${errs ? `: ${errs}` : ""}`);
} else {
  console.log("OK     notifications page (exists)");
}

await prisma.$disconnect();
