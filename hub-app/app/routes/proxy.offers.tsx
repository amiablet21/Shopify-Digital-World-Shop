import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  OFFER_SLOTS,
  OfferError,
  activeOfferCount,
  addMessage,
  buyerAcceptCounter,
  buyerCounter,
  buyerWithdraw,
  createOffer,
  expireStaleOffers,
  listOffersForCustomer,
} from "../offers.server";

/** App Proxy: /apps/dw/offers
 *  Storefront-facing JSON API for the My Offers page. Shopify signs every
 *  proxy request and passes the logged-in customer id, so buyers can only
 *  ever see and act on their own offers. */

function customerFromProxyRequest(request: Request) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("logged_in_customer_id");
  if (!customerId) return null;
  return customerId;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "App not installed" }, 401);
  const customerId = customerFromProxyRequest(request);
  if (!customerId) return json({ error: "Sign in to see your offers" }, 401);

  await expireStaleOffers(session.shop);
  const offers = await listOffersForCustomer(session.shop, customerId);
  const used = await activeOfferCount(session.shop, customerId);
  return json({ offers, slots: { total: OFFER_SLOTS, used } });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "App not installed" }, 401);
  const customerId = customerFromProxyRequest(request);
  if (!customerId) return json({ error: "Sign in to make an offer" }, 401);

  const body = await request.json();
  try {
    switch (body.action) {
      case "create": {
        const offer = await createOffer({
          shop: session.shop,
          customerId,
          customerEmail: String(body.email || ""),
          productId: String(body.productId || ""),
          variantId: String(body.variantId || ""),
          sku: String(body.sku || ""),
          productTitle: String(body.productTitle || ""),
          quantity: Number(body.quantity),
          listPriceCents: Number(body.listPriceCents),
          offerCents: Number(body.offerCents),
          durationHours: Number(body.durationHours || 24),
        });
        return json({ offer });
      }
      case "accept":
        return json({ offer: await buyerAcceptCounter(session.shop, customerId, Number(body.offerId)) });
      case "counter":
        return json({ offer: await buyerCounter(session.shop, customerId, Number(body.offerId), Number(body.cents)) });
      case "withdraw":
        return json({ offer: await buyerWithdraw(session.shop, customerId, Number(body.offerId)) });
      case "message":
        return json({
          offer: await addMessage(session.shop, Number(body.offerId), "BUYER", String(body.body || ""), customerId),
        });
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    if (error instanceof OfferError) return json({ error: error.message }, 422);
    throw error;
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
