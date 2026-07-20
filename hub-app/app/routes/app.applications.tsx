import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  ApplicationError,
  approveApplication,
  listApplications,
  rejectApplication,
} from "../applications.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const applications = await listApplications(session.shop);
  return { applications };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const act = String(form.get("act"));
  try {
    if (act === "approve") await approveApplication(admin, session.shop, id);
    if (act === "reject") await rejectApplication(session.shop, id);
  } catch (error) {
    if (!(error instanceof ApplicationError)) throw error;
  }
  return null;
};

const STATUS_TONE: Record<string, "attention" | "success" | "critical" | undefined> = {
  PENDING: "attention",
  APPROVED: "success",
  REJECTED: "critical",
};

export default function Applications() {
  const { applications } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  return (
    <Page>
      <TitleBar title="Wholesale Applications" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {applications.length === 0 && (
              <Card>
                <Text as="p" tone="subdued">
                  No applications yet. Storefront visitors apply through the gate page; new
                  applications appear here for approval.
                </Text>
              </Card>
            )}
            {applications.map((application) => (
              <Card key={application.id}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <Text as="h3" variant="headingSm">
                        {application.company}
                      </Text>
                      <Badge tone={STATUS_TONE[application.status]}>{application.status}</Badge>
                    </InlineStack>
                    <Text as="span" tone="subdued">
                      {new Date(application.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </InlineStack>
                  <Text as="p">
                    {application.contact} · {application.email} · {application.phone}
                  </Text>
                  <Text as="p" tone="subdued">
                    EIN {application.ein}
                    {application.resaleCert ? ` · Resale cert ${application.resaleCert}` : ""}
                    {application.businessType ? ` · ${application.businessType}` : ""}
                    {application.volume ? ` · ${application.volume}/mo` : ""}
                  </Text>
                  {application.message && <Text as="p">{application.message}</Text>}
                  {application.status === "PENDING" && (
                    <InlineStack gap="300">
                      <ButtonGroup>
                        <Button
                          variant="primary"
                          onClick={() =>
                            submit({ id: String(application.id), act: "approve" }, { method: "post" })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          onClick={() =>
                            submit({ id: String(application.id), act: "reject" }, { method: "post" })
                          }
                        >
                          Reject
                        </Button>
                      </ButtonGroup>
                      <Text as="span" tone="subdued">
                        Approving tags the customer and unlocks the storefront for them.
                      </Text>
                    </InlineStack>
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
