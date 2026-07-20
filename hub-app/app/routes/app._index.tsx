import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCents } from "../money";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [
    pendingApplications,
    activeOffers,
    acceptedOffers,
    companies,
    watches,
    recentApplications,
    offersNeedingReply,
  ] = await Promise.all([
    db.application.count({ where: { shop, status: "PENDING" } }),
    db.offer.count({ where: { shop, status: { in: ["PENDING", "COUNTERED"] } } }),
    db.offer.count({ where: { shop, status: "ACCEPTED" } }),
    db.company.count({ where: { shop } }),
    db.watch.count({ where: { shop } }),
    db.application.findMany({
      where: { shop, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.offer.findMany({
      where: { shop, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    stats: { pendingApplications, activeOffers, acceptedOffers, companies, watches },
    recentApplications,
    offersNeedingReply,
  };
};

function Stat({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: number;
  to: string;
  tone?: "attention";
}) {
  return (
    <Link to={to} style={{ textDecoration: "none" }}>
      <Card>
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="p" variant="heading2xl">
              {value}
            </Text>
            {tone === "attention" && value > 0 && <Badge tone="attention">Action needed</Badge>}
          </InlineStack>
          <Text as="p" tone="subdued">
            {label}
          </Text>
        </BlockStack>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { stats, recentApplications, offersNeedingReply } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Digital World Hub" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <InlineGrid columns={{ xs: 2, md: 5 }} gap="300">
              <Stat
                label="Pending applications"
                value={stats.pendingApplications}
                to="/app/applications"
                tone="attention"
              />
              <Stat
                label="Offers awaiting reply"
                value={stats.activeOffers}
                to="/app/offers"
                tone="attention"
              />
              <Stat label="Accepted offers" value={stats.acceptedOffers} to="/app/offers" />
              <Stat label="Companies" value={stats.companies} to="/app/customers" />
              <Stat label="Watched items" value={stats.watches} to="/app/setup" />
            </InlineGrid>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Applications to review
                    </Text>
                    <Link to="/app/applications">View all</Link>
                  </InlineStack>
                  {recentApplications.length === 0 && (
                    <Text as="p" tone="subdued">
                      Nothing waiting. New storefront applications land here.
                    </Text>
                  )}
                  {recentApplications.map((application) => (
                    <Box
                      key={application.id}
                      borderBlockStartWidth="025"
                      borderColor="border"
                      paddingBlockStart="200"
                    >
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">
                          {application.company}
                        </Text>
                        <Text as="p" tone="subdued">
                          {application.contact} · {application.email}
                          {application.volume ? ` · ${application.volume}/mo` : ""}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Offers to answer
                    </Text>
                    <Link to="/app/offers">View all</Link>
                  </InlineStack>
                  {offersNeedingReply.length === 0 && (
                    <Text as="p" tone="subdued">
                      No open offers. Buyer offers from the storefront appear here.
                    </Text>
                  )}
                  {offersNeedingReply.map((offer) => (
                    <Box
                      key={offer.id}
                      borderBlockStartWidth="025"
                      borderColor="border"
                      paddingBlockStart="200"
                    >
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">
                          #{offer.id} · {offer.sku} · {offer.quantity} units at{" "}
                          {formatCents(offer.offerCents)}
                        </Text>
                        <Text as="p" tone="subdued">
                          {offer.customerEmail} · list {formatCents(offer.listPriceCents)} · total{" "}
                          {formatCents(offer.offerCents * offer.quantity)}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
