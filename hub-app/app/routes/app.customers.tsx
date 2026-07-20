import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useState } from "react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  CompanyError,
  addAddress,
  addContact,
  createCompany,
  listCompanies,
} from "../companies.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const companies = await listCompanies(session.shop);
  return { companies };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const act = String(form.get("act"));
  try {
    if (act === "create") {
      await createCompany(admin, session.shop, JSON.parse(String(form.get("payload"))));
    } else if (act === "addContact") {
      await addContact(admin, session.shop, Number(form.get("companyId")), JSON.parse(String(form.get("payload"))));
    } else if (act === "addAddress") {
      await addAddress(admin, session.shop, Number(form.get("companyId")), JSON.parse(String(form.get("payload"))));
    }
    return { error: null };
  } catch (error) {
    if (error instanceof CompanyError) return { error: error.message };
    throw error;
  }
};

type Contact = { name: string; email: string; phone: string };
type Address = {
  label: string;
  address1: string;
  address2: string;
  city: string;
  provinceCode: string;
  zip: string;
  countryCode: string;
  phone: string;
};

const emptyContact = (): Contact => ({ name: "", email: "", phone: "" });
const emptyAddress = (): Address => ({
  label: "",
  address1: "",
  address2: "",
  city: "",
  provinceCode: "",
  zip: "",
  countryCode: "US",
  phone: "",
});

function ContactFields({
  contact,
  onChange,
  label,
}: {
  contact: Contact;
  onChange: (next: Contact) => void;
  label: string;
}) {
  return (
    <BlockStack gap="200">
      <Text as="h4" variant="headingSm">
        {label}
      </Text>
      <InlineStack gap="300" wrap>
        <div style={{ minWidth: 180 }}>
          <TextField
            label="Name"
            autoComplete="off"
            value={contact.name}
            onChange={(value) => onChange({ ...contact, name: value })}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <TextField
            label="Email (their login)"
            autoComplete="off"
            value={contact.email}
            onChange={(value) => onChange({ ...contact, email: value })}
          />
        </div>
        <div style={{ minWidth: 150 }}>
          <TextField
            label="Phone"
            autoComplete="off"
            value={contact.phone}
            onChange={(value) => onChange({ ...contact, phone: value })}
          />
        </div>
      </InlineStack>
    </BlockStack>
  );
}

function AddressFields({
  address,
  onChange,
  label,
}: {
  address: Address;
  onChange: (next: Address) => void;
  label: string;
}) {
  return (
    <BlockStack gap="200">
      <Text as="h4" variant="headingSm">
        {label}
      </Text>
      <InlineStack gap="300" wrap>
        <div style={{ minWidth: 160 }}>
          <TextField
            label="Label"
            placeholder="Main warehouse"
            autoComplete="off"
            value={address.label}
            onChange={(value) => onChange({ ...address, label: value })}
          />
        </div>
        <div style={{ minWidth: 240 }}>
          <TextField
            label="Address"
            autoComplete="off"
            value={address.address1}
            onChange={(value) => onChange({ ...address, address1: value })}
          />
        </div>
        <div style={{ minWidth: 140 }}>
          <TextField
            label="Suite / unit"
            autoComplete="off"
            value={address.address2}
            onChange={(value) => onChange({ ...address, address2: value })}
          />
        </div>
        <div style={{ minWidth: 140 }}>
          <TextField
            label="City"
            autoComplete="off"
            value={address.city}
            onChange={(value) => onChange({ ...address, city: value })}
          />
        </div>
        <div style={{ minWidth: 90 }}>
          <TextField
            label="State"
            placeholder="FL"
            autoComplete="off"
            value={address.provinceCode}
            onChange={(value) => onChange({ ...address, provinceCode: value })}
          />
        </div>
        <div style={{ minWidth: 110 }}>
          <TextField
            label="ZIP"
            autoComplete="off"
            value={address.zip}
            onChange={(value) => onChange({ ...address, zip: value })}
          />
        </div>
        <div style={{ minWidth: 90 }}>
          <TextField
            label="Country"
            autoComplete="off"
            value={address.countryCode}
            onChange={(value) => onChange({ ...address, countryCode: value })}
          />
        </div>
      </InlineStack>
    </BlockStack>
  );
}

export default function Customers() {
  const { companies } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const [name, setName] = useState("");
  const [ein, setEin] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([emptyContact()]);
  const [addresses, setAddresses] = useState<Address[]>([emptyAddress()]);

  const create = () => {
    submit(
      {
        act: "create",
        payload: JSON.stringify({
          name,
          ein,
          contacts: contacts.map((contact, index) => ({ ...contact, isMain: index === 0 })),
          addresses,
        }),
      },
      { method: "post" },
    );
    setName("");
    setEin("");
    setContacts([emptyContact()]);
    setAddresses([emptyAddress()]);
  };

  return (
    <Page>
      <TitleBar title="Customers" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Create a company
                </Text>
                <Text as="p" tone="subdued">
                  Each contact becomes an approved login on the storefront. Every contact gets the
                  full company address book to choose from at checkout. The first contact is the
                  main point of contact.
                </Text>
                <InlineStack gap="300" wrap>
                  <div style={{ minWidth: 240 }}>
                    <TextField label="Company name" autoComplete="off" value={name} onChange={setName} />
                  </div>
                  <div style={{ minWidth: 160 }}>
                    <TextField label="EIN (optional)" autoComplete="off" value={ein} onChange={setEin} />
                  </div>
                </InlineStack>
                <Divider />
                {contacts.map((contact, index) => (
                  <ContactFields
                    key={index}
                    contact={contact}
                    label={index === 0 ? "Main point of contact" : `Contact ${index + 1}`}
                    onChange={(next) =>
                      setContacts(contacts.map((c, i) => (i === index ? next : c)))
                    }
                  />
                ))}
                <InlineStack>
                  <Button onClick={() => setContacts([...contacts, emptyContact()])}>
                    Add another contact
                  </Button>
                </InlineStack>
                <Divider />
                {addresses.map((address, index) => (
                  <AddressFields
                    key={index}
                    address={address}
                    label={index === 0 ? "Shipping address" : `Shipping address ${index + 1}`}
                    onChange={(next) =>
                      setAddresses(addresses.map((a, i) => (i === index ? next : a)))
                    }
                  />
                ))}
                <InlineStack>
                  <Button onClick={() => setAddresses([...addresses, emptyAddress()])}>
                    Add another address
                  </Button>
                </InlineStack>
                <InlineStack>
                  <Button variant="primary" loading={busy} onClick={create} disabled={!name.trim()}>
                    Create company
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {companies.map((company) => (
              <Card key={company.id}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">
                      {company.name}
                    </Text>
                    {company.ein && (
                      <Text as="span" tone="subdued">
                        EIN {company.ein}
                      </Text>
                    )}
                  </InlineStack>
                  <BlockStack gap="150">
                    {company.contacts.map((contact) => (
                      <InlineStack key={contact.id} gap="200" blockAlign="center">
                        {contact.isMain && <Badge tone="info">Main</Badge>}
                        <Text as="span">
                          {contact.name} · {contact.email}
                          {contact.phone ? ` · ${contact.phone}` : ""}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                  {company.addresses.length > 0 && (
                    <BlockStack gap="100">
                      {company.addresses.map((address) => (
                        <Text as="p" tone="subdued" key={address.id}>
                          {address.label ? `${address.label}: ` : ""}
                          {address.address1}
                          {address.address2 ? `, ${address.address2}` : ""}, {address.city}
                          {address.provinceCode ? ` ${address.provinceCode}` : ""} {address.zip},{" "}
                          {address.countryCode}
                        </Text>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
