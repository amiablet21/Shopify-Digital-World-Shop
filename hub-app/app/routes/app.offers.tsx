import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState } from "react";
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
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  OfferError,
  expireStaleOffers,
  recordDraftOrder,
  sellerAccept,
  sellerCounter,
  sellerDecline,
} from "../offers.server";
import { formatCents } from "../money";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await expireStaleOffers(session.shop);
  const offers = await db.offer.findMany({
    where: { shop: session.shop },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { messages: { orderBy: { createdAt: "asc" } } },
    take: 100,
  });
  return { offers };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const offerId = Number(form.get("offerId"));
  const act = String(form.get("act"));

  try {
    if (act === "counter") {
      const cents = Math.round(Number(form.get("price")) * 100);
      await sellerCounter(session.shop, offerId, cents);
    } else if (act === "decline") {
      await sellerDecline(session.shop, offerId);
    } else if (act === "accept") {
      const offer = await sellerAccept(session.shop, offerId);
      // Create the draft order at the negotiated price. Percentage discount
      // per line derives the negotiated unit price from the list price;
      // rounding can shift the total by at most a cent.
      const pct =
        Math.round((1 - offer.offerCents / offer.listPriceCents) * 10000) / 100;
      const response = await admin.graphql(
        `#graphql
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder { id invoiceUrl }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: {
              email: offer.customerEmail || undefined,
              tags: ["dw-offer", `offer-${offer.id}`],
              note: `Accepted offer #${offer.id}: ${offer.quantity} x ${offer.sku} at ${formatCents(offer.offerCents)} per unit.`,
              lineItems: [
                {
                  variantId: offer.variantId,
                  quantity: offer.quantity,
                  appliedDiscount: {
                    value: pct,
                    valueType: "PERCENTAGE",
                    title: `Negotiated offer #${offer.id}`,
                  },
                },
              ],
            },
          },
        },
      );
      const data = (await response.json()).data?.draftOrderCreate;
      if (data?.draftOrder?.id) {
        await recordDraftOrder(offer.id, data.draftOrder.id, data.draftOrder.invoiceUrl ?? "");
      }
    }
  } catch (error) {
    if (!(error instanceof OfferError)) throw error;
  }
  return null;
};

const STATUS_TONE: Record<string, "attention" | "info" | "success" | "critical" | undefined> = {
  PENDING: "attention",
  COUNTERED: "info",
  ACCEPTED: "success",
  DECLINED: "critical",
};

export default function OffersAdmin() {
  const { offers } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [counterPrices, setCounterPrices] = useState<Record<number, string>>({});

  const act = (offerId: number, actName: string, price?: string) => {
    const data: Record<string, string> = { offerId: String(offerId), act: actName };
    if (price) data.price = price;
    submit(data, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Customer Offers" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {offers.length === 0 && (
              <Card>
                <Text as="p" tone="subdued">
                  No offers yet. Offers made on the storefront appear here.
                </Text>
              </Card>
            )}
            {offers.map((offer) => (
              <Card key={offer.id}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <Text as="h3" variant="headingSm">
                        #{offer.id} · {offer.sku}
                      </Text>
                      <Badge tone={STATUS_TONE[offer.status]}>{offer.status}</Badge>
                    </InlineStack>
                    <Text as="span" tone="subdued">
                      {offer.customerEmail}
                    </Text>
                  </InlineStack>

                  <Text as="p">{offer.productTitle}</Text>
                  <Text as="p">
                    {offer.quantity} units · list {formatCents(offer.listPriceCents)} · offered{" "}
                    <Text as="span" fontWeight="bold">
                      {formatCents(offer.offerCents)}
                    </Text>{" "}
                    per unit ({formatCents(offer.offerCents * offer.quantity)} total)
                  </Text>

                  {offer.invoiceUrl && (
                    <Text as="p">
                      Invoice: <a href={offer.invoiceUrl}>{offer.invoiceUrl}</a>
                    </Text>
                  )}

                  {offer.status === "PENDING" && (
                    <InlineStack gap="300" blockAlign="end" wrap>
                      <div style={{ minWidth: 140 }}>
                        <TextField
                          label="Counter price"
                          labelHidden
                          autoComplete="off"
                          prefix="$"
                          placeholder="Counter price"
                          value={counterPrices[offer.id] ?? ""}
                          onChange={(value) =>
                            setCounterPrices((prev) => ({ ...prev, [offer.id]: value }))
                          }
                        />
                      </div>
                      <ButtonGroup>
                        <Button
                          onClick={() => act(offer.id, "counter", counterPrices[offer.id])}
                          disabled={!counterPrices[offer.id]}
                        >
                          Send counter
                        </Button>
                        <Button variant="primary" onClick={() => act(offer.id, "accept")}>
                          Accept offer
                        </Button>
                        <Button tone="critical" onClick={() => act(offer.id, "decline")}>
                          Decline
                        </Button>
                      </ButtonGroup>
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
