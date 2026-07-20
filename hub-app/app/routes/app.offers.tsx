import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Divider,
  EmptyState,
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
  addMessage,
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
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
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
      const note = String(form.get("note") || "").trim();
      await sellerCounter(session.shop, offerId, cents, note || undefined);
    } else if (act === "message") {
      await addMessage(session.shop, offerId, "SELLER", String(form.get("note") || ""));
    } else if (act === "decline") {
      await sellerDecline(session.shop, offerId);
    } else if (act === "accept") {
      const offer = await sellerAccept(session.shop, offerId);
      const pct = Math.round((1 - offer.offerCents / offer.listPriceCents) * 10000) / 100;
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

const STATUS_TONE: Record<string, "attention" | "info" | "success" | undefined> = {
  PENDING: "attention",
  COUNTERED: "info",
  ACCEPTED: "success",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting your reply",
  COUNTERED: "You countered",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn by buyer",
};

type OfferWithMessages = {
  id: number;
  sku: string;
  status: string;
  customerEmail: string;
  productTitle: string;
  quantity: number;
  listPriceCents: number;
  offerCents: number;
  counterCents: number | null;
  invoiceUrl: string | null;
  messages: { id: number; from: string; body: string; createdAt: string | Date }[];
};

function Thread({ messages }: { messages: OfferWithMessages["messages"] }) {
  return (
    <BlockStack gap="200">
      {messages.map((message) => {
        const isSeller = message.from === "SELLER";
        return (
          <InlineStack key={message.id} align={isSeller ? "end" : "start"}>
            <Box
              background={isSeller ? "bg-surface-brand-selected" : "bg-surface-secondary"}
              borderRadius="200"
              padding="300"
              maxWidth="70%"
            >
              <BlockStack gap="050">
                <Text as="span" variant="bodySm" tone="subdued">
                  {isSeller ? "You" : "Buyer"} ·{" "}
                  {new Date(message.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                <Text as="p">{message.body}</Text>
              </BlockStack>
            </Box>
          </InlineStack>
        );
      })}
    </BlockStack>
  );
}

function OfferCard({ offer }: { offer: OfferWithMessages }) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const active = offer.status === "PENDING" || offer.status === "COUNTERED";

  const act = (name: string) => {
    submit({ offerId: String(offer.id), act: name, price, note }, { method: "post" });
    setPrice("");
    setNote("");
  };

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <Text as="h3" variant="headingSm">
              Offer #{offer.id} · {offer.sku}
            </Text>
            <Badge tone={STATUS_TONE[offer.status]}>{STATUS_LABEL[offer.status] || offer.status}</Badge>
          </InlineStack>
          <Text as="span" tone="subdued">
            {offer.customerEmail}
          </Text>
        </InlineStack>

        <Text as="p" tone="subdued">
          {offer.productTitle}
        </Text>
        <InlineStack gap="400">
          <Text as="span">
            <Text as="span" fontWeight="semibold">{offer.quantity}</Text> units
          </Text>
          <Text as="span">
            List <Text as="span" fontWeight="semibold">{formatCents(offer.listPriceCents)}</Text>
          </Text>
          <Text as="span">
            Buyer offer <Text as="span" fontWeight="semibold">{formatCents(offer.offerCents)}</Text>
          </Text>
          {offer.counterCents ? (
            <Text as="span">
              Your counter <Text as="span" fontWeight="semibold">{formatCents(offer.counterCents)}</Text>
            </Text>
          ) : null}
          <Text as="span">
            Total <Text as="span" fontWeight="semibold">{formatCents((offer.counterCents || offer.offerCents) * offer.quantity)}</Text>
          </Text>
        </InlineStack>

        <Divider />
        <Thread messages={offer.messages} />

        {offer.invoiceUrl && (
          <Text as="p">
            Invoice: <a href={offer.invoiceUrl} target="_blank" rel="noreferrer">{offer.invoiceUrl}</a>
          </Text>
        )}

        {active && (
          <BlockStack gap="200">
            <Divider />
            <TextField
              label="Message"
              labelHidden
              placeholder="Write a message to the buyer"
              autoComplete="off"
              multiline={2}
              value={note}
              onChange={setNote}
            />
            <InlineStack gap="300" blockAlign="end" wrap>
              <div style={{ maxWidth: 160 }}>
                <TextField
                  label="Counter price"
                  labelHidden
                  autoComplete="off"
                  prefix="$"
                  placeholder="Unit price"
                  value={price}
                  onChange={setPrice}
                />
              </div>
              <ButtonGroup>
                <Button onClick={() => act("counter")} disabled={!price || busy}>
                  {offer.status === "COUNTERED" ? "Update counter" : "Send counter"}
                </Button>
                <Button onClick={() => act("message")} disabled={!note.trim() || busy}>
                  Send message
                </Button>
                <Button variant="primary" onClick={() => act("accept")} disabled={busy}>
                  Accept {formatCents(offer.offerCents)}
                </Button>
                <Button onClick={() => act("decline")} disabled={busy}>
                  Decline
                </Button>
              </ButtonGroup>
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodySm">
              Counter as many times as you need. Accepting the buyer price creates the draft order
              invoice at {formatCents(offer.offerCents)} per unit.
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

export default function OffersAdmin() {
  const { offers } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Customer Offers" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {offers.length === 0 && (
              <Card>
                <EmptyState
                  heading="No offers yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    When buyers press Make Offer on the storefront, their offers appear here as
                    conversations you can counter, message, accept or decline.
                  </p>
                </EmptyState>
              </Card>
            )}
            {(offers as OfferWithMessages[]).map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
