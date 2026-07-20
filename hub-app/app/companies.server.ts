import db from "./db.server";

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export class CompanyError extends Error {}

export type ContactInput = { name: string; email: string; phone?: string; isMain?: boolean };
export type AddressInput = {
  label?: string;
  address1: string;
  address2?: string;
  city: string;
  provinceCode?: string;
  zip: string;
  countryCode?: string;
  phone?: string;
};

const APPROVED_TAG = "approved";

function companyTag(name: string) {
  return `company:${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function toMailingAddress(company: string, contactName: string, address: AddressInput) {
  const [firstName, ...rest] = contactName.split(" ");
  return {
    address1: address.address1,
    address2: address.address2 || undefined,
    city: address.city,
    provinceCode: address.provinceCode || undefined,
    zip: address.zip,
    countryCode: address.countryCode || "US",
    phone: address.phone || undefined,
    company,
    firstName: firstName || contactName,
    lastName: rest.join(" ") || company,
  };
}

/** Create or update the Shopify customer for a contact: approved tag, company
 *  tag, and the company's full address book (first address as default). */
async function upsertContactCustomer(
  admin: AdminClient,
  companyName: string,
  contact: ContactInput,
  addresses: AddressInput[],
) {
  const email = contact.email.trim().toLowerCase();
  const mailingAddresses = addresses.map((address) => toMailingAddress(companyName, contact.name, address));

  const foundResponse = await admin.graphql(
    `#graphql
    query($q: String!) { customers(first: 1, query: $q) { nodes { id tags } } }`,
    { variables: { q: `email:${JSON.stringify(email)}` } },
  );
  const found = (await foundResponse.json()).data?.customers?.nodes?.[0];

  const [firstName, ...rest] = contact.name.split(" ");
  const base = {
    email,
    firstName: firstName || contact.name,
    lastName: rest.join(" ") || companyName,
    phone: contact.phone || undefined,
    addresses: mailingAddresses.length ? mailingAddresses : undefined,
  };

  if (found) {
    const tags = new Set<string>([...(found.tags ?? []), APPROVED_TAG, companyTag(companyName)]);
    const response = await admin.graphql(
      `#graphql
      mutation($input: CustomerInput!) {
        customerUpdate(input: $input) { customer { id } userErrors { message } }
      }`,
      { variables: { input: { id: found.id, ...base, tags: Array.from(tags) } } },
    );
    const payload = (await response.json()).data?.customerUpdate;
    const errors = payload?.userErrors ?? [];
    if (errors.length) throw new CompanyError(`${email}: ${errors.map((e: any) => e.message).join("; ")}`);
    return found.id as string;
  }

  const response = await admin.graphql(
    `#graphql
    mutation($input: CustomerInput!) {
      customerCreate(input: $input) { customer { id } userErrors { message } }
    }`,
    {
      variables: {
        input: { ...base, tags: [APPROVED_TAG, companyTag(companyName)], note: `Contact at ${companyName}` },
      },
    },
  );
  const payload = (await response.json()).data?.customerCreate;
  const errors = payload?.userErrors ?? [];
  if (errors.length) throw new CompanyError(`${email}: ${errors.map((e: any) => e.message).join("; ")}`);
  return payload.customer.id as string;
}

export async function createCompany(
  admin: AdminClient,
  shop: string,
  input: {
    name: string;
    ein?: string;
    note?: string;
    contacts: ContactInput[];
    addresses: AddressInput[];
  },
) {
  if (!input.name.trim()) throw new CompanyError("Company name is required.");
  const contacts = input.contacts.filter((c) => c.name.trim() && c.email.trim());
  if (contacts.length === 0) throw new CompanyError("At least one contact with a name and email is required.");
  if (!contacts.some((c) => c.isMain)) contacts[0].isMain = true;
  const addresses = input.addresses.filter((a) => a.address1.trim() && a.city.trim() && a.zip.trim());

  const contactRows = [];
  for (const contact of contacts) {
    const customerId = await upsertContactCustomer(admin, input.name, contact, addresses);
    contactRows.push({
      name: contact.name.trim(),
      email: contact.email.trim().toLowerCase(),
      phone: (contact.phone || "").trim(),
      customerId,
      isMain: Boolean(contact.isMain),
    });
  }

  return db.company.create({
    data: {
      shop,
      name: input.name.trim(),
      ein: (input.ein || "").trim(),
      note: (input.note || "").trim(),
      contacts: { create: contactRows },
      addresses: {
        create: addresses.map((address) => ({
          label: (address.label || "").trim(),
          address1: address.address1.trim(),
          address2: (address.address2 || "").trim(),
          city: address.city.trim(),
          provinceCode: (address.provinceCode || "").trim().toUpperCase(),
          zip: address.zip.trim(),
          countryCode: (address.countryCode || "US").trim().toUpperCase(),
          phone: (address.phone || "").trim(),
        })),
      },
    },
    include: { contacts: true, addresses: true },
  });
}

export async function listCompanies(shop: string) {
  return db.company.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    include: { contacts: { orderBy: { isMain: "desc" } }, addresses: true },
    take: 200,
  });
}

/** Add a contact to an existing company; they get the full company address book. */
export async function addContact(admin: AdminClient, shop: string, companyId: number, contact: ContactInput) {
  const company = await db.company.findFirst({
    where: { id: companyId, shop },
    include: { addresses: true },
  });
  if (!company) throw new CompanyError("Company not found.");
  const customerId = await upsertContactCustomer(admin, company.name, contact, company.addresses);
  return db.companyContact.create({
    data: {
      companyId: company.id,
      name: contact.name.trim(),
      email: contact.email.trim().toLowerCase(),
      phone: (contact.phone || "").trim(),
      customerId,
      isMain: false,
    },
  });
}

/** Add an address to an existing company and push the refreshed address book
 *  to every contact's Shopify customer. */
export async function addAddress(admin: AdminClient, shop: string, companyId: number, address: AddressInput) {
  const company = await db.company.findFirst({
    where: { id: companyId, shop },
    include: { contacts: true, addresses: true },
  });
  if (!company) throw new CompanyError("Company not found.");
  if (!address.address1.trim() || !address.city.trim() || !address.zip.trim()) {
    throw new CompanyError("Address, city and ZIP are required.");
  }

  const created = await db.companyAddress.create({
    data: {
      companyId: company.id,
      label: (address.label || "").trim(),
      address1: address.address1.trim(),
      address2: (address.address2 || "").trim(),
      city: address.city.trim(),
      provinceCode: (address.provinceCode || "").trim().toUpperCase(),
      zip: address.zip.trim(),
      countryCode: (address.countryCode || "US").trim().toUpperCase(),
      phone: (address.phone || "").trim(),
    },
  });

  const allAddresses = [...company.addresses, created];
  for (const contact of company.contacts) {
    if (!contact.customerId) continue;
    const response = await admin.graphql(
      `#graphql
      mutation($input: CustomerInput!) {
        customerUpdate(input: $input) { customer { id } userErrors { message } }
      }`,
      {
        variables: {
          input: {
            id: contact.customerId,
            addresses: allAddresses.map((a) => toMailingAddress(company.name, contact.name, a)),
          },
        },
      },
    );
    const errors = (await response.json()).data?.customerUpdate?.userErrors ?? [];
    if (errors.length) throw new CompanyError(`${contact.email}: ${errors.map((e: any) => e.message).join("; ")}`);
  }
  return created;
}
