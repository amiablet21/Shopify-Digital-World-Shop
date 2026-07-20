import db from "./db.server";

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export class ApplicationError extends Error {}

export async function submitApplication(input: {
  shop: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  ein: string;
  resaleCert?: string;
  businessType?: string;
  volume?: string;
  message?: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (!input.company.trim() || !input.contact.trim() || !email || !input.phone.trim() || !input.ein.trim()) {
    throw new ApplicationError("Company, contact name, email, phone and EIN are required.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ApplicationError("Enter a valid work email.");
  }
  const existing = await db.application.findUnique({
    where: { shop_email: { shop: input.shop, email } },
  });
  if (existing) {
    if (existing.status === "REJECTED") {
      return db.application.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          company: input.company.trim(),
          contact: input.contact.trim(),
          phone: input.phone.trim(),
          ein: input.ein.trim(),
          resaleCert: (input.resaleCert || "").trim(),
          businessType: (input.businessType || "").trim(),
          volume: (input.volume || "").trim(),
          message: (input.message || "").trim(),
        },
      });
    }
    // Pending or approved already: treat resubmission as a no-op success.
    return existing;
  }
  return db.application.create({
    data: {
      shop: input.shop,
      company: input.company.trim(),
      contact: input.contact.trim(),
      email,
      phone: input.phone.trim(),
      ein: input.ein.trim(),
      resaleCert: (input.resaleCert || "").trim(),
      businessType: (input.businessType || "").trim(),
      volume: (input.volume || "").trim(),
      message: (input.message || "").trim(),
    },
  });
}

export async function listApplications(shop: string) {
  return db.application.findMany({
    where: { shop },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
}

/** Approve: create the Shopify customer (or find the existing one by email),
 *  add the approved tag, and record it on the application. */
export async function approveApplication(admin: AdminClient, shop: string, id: number, approvedTag = "approved") {
  const application = await db.application.findFirst({ where: { id, shop } });
  if (!application) throw new ApplicationError("Application not found.");

  // Find existing customer by email.
  const foundResponse = await admin.graphql(
    `#graphql
    query($q: String!) {
      customers(first: 1, query: $q) { nodes { id tags } }
    }`,
    { variables: { q: `email:${JSON.stringify(application.email)}` } },
  );
  const found = (await foundResponse.json()).data?.customers?.nodes?.[0];

  let customerId: string;
  if (found) {
    customerId = found.id;
    const tags = new Set<string>([...(found.tags ?? []), approvedTag]);
    const updateResponse = await admin.graphql(
      `#graphql
      mutation($input: CustomerInput!) {
        customerUpdate(input: $input) { customer { id } userErrors { message } }
      }`,
      { variables: { input: { id: customerId, tags: Array.from(tags) } } },
    );
    const errors = (await updateResponse.json()).data?.customerUpdate?.userErrors ?? [];
    if (errors.length) throw new ApplicationError(errors.map((e: any) => e.message).join("; "));
  } else {
    const [firstName, ...rest] = application.contact.split(" ");
    const createResponse = await admin.graphql(
      `#graphql
      mutation($input: CustomerInput!) {
        customerCreate(input: $input) { customer { id } userErrors { message } }
      }`,
      {
        variables: {
          input: {
            email: application.email,
            firstName: firstName || application.contact,
            lastName: rest.join(" ") || application.company,
            tags: [approvedTag],
            note: `Wholesale application #${application.id}: ${application.company}, EIN ${application.ein}`,
          },
        },
      },
    );
    const payload = (await createResponse.json()).data?.customerCreate;
    const errors = payload?.userErrors ?? [];
    if (errors.length) throw new ApplicationError(errors.map((e: any) => e.message).join("; "));
    customerId = payload.customer.id;
  }

  return db.application.update({
    where: { id: application.id },
    data: { status: "APPROVED", customerId },
  });
}

export async function rejectApplication(shop: string, id: number) {
  const application = await db.application.findFirst({ where: { id, shop } });
  if (!application) throw new ApplicationError("Application not found.");
  return db.application.update({ where: { id: application.id }, data: { status: "REJECTED" } });
}
