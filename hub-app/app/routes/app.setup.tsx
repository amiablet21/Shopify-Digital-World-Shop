import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { seedStore, type SeedResult } from "../seed.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const results = await seedStore(admin);
  return { results };
};

export default function Setup() {
  const actionData = useActionData<{ results: SeedResult[] }>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const seeding = navigation.state === "submitting";

  return (
    <Page>
      <TitleBar title="Store Setup" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Seed the development store
                </Text>
                <Text as="p" tone="subdued">
                  One click creates the B2B metafield definitions (MOQ, condition, warehouse,
                  specs), 12 sample products with SKUs, inventory and pricing, the Past
                  Purchases, Price List, Apply and My Offers pages wired to their theme
                  templates, and the main menu. Safe to run again: existing items are skipped.
                </Text>
                <InlineStack>
                  <Button variant="primary" loading={seeding} onClick={() => submit({}, { method: "post" })}>
                    Seed store
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {actionData?.results && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    Results
                  </Text>
                  <List type="bullet">
                    {actionData.results.map((r) => (
                      <List.Item key={r.step}>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={r.ok ? "success" : "critical"}>{r.ok ? "OK" : "Failed"}</Badge>
                          <Text as="span">
                            {r.step}: {r.detail}
                          </Text>
                        </InlineStack>
                      </List.Item>
                    ))}
                  </List>
                  <Text as="p" tone="subdued">
                    Still manual, once: install the free Search & Discovery app and add filters
                    for Availability, Vendor and the Condition metafield, then publish the
                    Digital World Shop B2B theme.
                  </Text>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
