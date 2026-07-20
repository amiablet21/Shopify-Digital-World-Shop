import db from "./db.server";
import { formatCents } from "./money";

export { formatCents };

export const OFFER_SLOTS = 3;
const ACTIVE_STATUSES = ["PENDING", "COUNTERED"];
const VALID_DURATION_HOURS = [24, 48, 168];

export async function activeOfferCount(shop: string, customerId: string) {
  return db.offer.count({
    where: { shop, customerId, status: { in: ACTIVE_STATUSES } },
  });
}

export async function listOffersForCustomer(shop: string, customerId: string) {
  return db.offer.findMany({
    where: { shop, customerId },
    orderBy: { createdAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    take: 50,
  });
}

export async function createOffer(input: {
  shop: string;
  customerId: string;
  customerEmail: string;
  productId: string;
  variantId: string;
  sku: string;
  productTitle: string;
  quantity: number;
  listPriceCents: number;
  offerCents: number;
  durationHours: number;
}) {
  const used = await activeOfferCount(input.shop, input.customerId);
  if (used >= OFFER_SLOTS) {
    throw new OfferError(`All ${OFFER_SLOTS} offer slots are in use. Wait for a pending offer to resolve.`);
  }
  if (input.quantity < 1 || input.offerCents < 1) {
    throw new OfferError("Quantity and price must be positive.");
  }
  if (input.offerCents >= input.listPriceCents) {
    throw new OfferError("An offer must be below the list price.");
  }
  const hours = VALID_DURATION_HOURS.includes(input.durationHours) ? input.durationHours : 24;

  return db.offer.create({
    data: {
      shop: input.shop,
      customerId: input.customerId,
      customerEmail: input.customerEmail,
      productId: input.productId,
      variantId: input.variantId,
      sku: input.sku,
      productTitle: input.productTitle,
      quantity: input.quantity,
      listPriceCents: input.listPriceCents,
      offerCents: input.offerCents,
      expiresAt: new Date(Date.now() + hours * 3600 * 1000),
      messages: {
        create: {
          from: "BUYER",
          cents: input.offerCents,
          body: `Offered ${formatCents(input.offerCents)} per unit for ${input.quantity} units.`,
        },
      },
    },
    include: { messages: true },
  });
}

/** Buyer accepts the seller's counter. Draft order is created by the caller
 *  (needs an admin API client) and recorded via recordDraftOrder. */
export async function buyerAcceptCounter(shop: string, customerId: string, offerId: number) {
  const offer = await getOwnOffer(shop, customerId, offerId);
  if (offer.status !== "COUNTERED" || !offer.counterCents) {
    throw new OfferError("There is no counter to accept on this offer.");
  }
  return db.offer.update({
    where: { id: offer.id },
    data: {
      status: "ACCEPTED",
      offerCents: offer.counterCents,
      messages: {
        create: {
          from: "BUYER",
          cents: offer.counterCents,
          body: `Accepted ${formatCents(offer.counterCents)} per unit.`,
        },
      },
    },
  });
}

export async function buyerCounter(shop: string, customerId: string, offerId: number, cents: number) {
  const offer = await getOwnOffer(shop, customerId, offerId);
  if (offer.status !== "COUNTERED") {
    throw new OfferError("You can only counter after the seller has countered.");
  }
  if (cents < 1 || cents >= offer.listPriceCents) {
    throw new OfferError("Counter must be positive and below list price.");
  }
  return db.offer.update({
    where: { id: offer.id },
    data: {
      status: "PENDING",
      offerCents: cents,
      messages: {
        create: { from: "BUYER", cents, body: `Countered at ${formatCents(cents)} per unit.` },
      },
    },
  });
}

export async function buyerWithdraw(shop: string, customerId: string, offerId: number) {
  const offer = await getOwnOffer(shop, customerId, offerId);
  if (!ACTIVE_STATUSES.includes(offer.status)) {
    throw new OfferError("Only active offers can be withdrawn.");
  }
  return db.offer.update({
    where: { id: offer.id },
    data: {
      status: "WITHDRAWN",
      messages: { create: { from: "BUYER", body: "Offer withdrawn." } },
    },
  });
}

// ---------- seller (admin) side ----------

export async function sellerCounter(shop: string, offerId: number, cents: number, note?: string) {
  const offer = await db.offer.findFirst({ where: { id: offerId, shop } });
  if (!offer) throw new OfferError("Offer not found.");
  if (!ACTIVE_STATUSES.includes(offer.status)) {
    throw new OfferError("Only active offers can be countered.");
  }
  if (cents < 1) throw new OfferError("Counter must be positive.");
  return db.offer.update({
    where: { id: offer.id },
    data: {
      status: "COUNTERED",
      counterCents: cents,
      messages: {
        create: {
          from: "SELLER",
          cents,
          body: note || `We can do ${formatCents(cents)} per unit at that quantity.`,
        },
      },
    },
  });
}

/** Plain chat message on an active offer, from either side. */
export async function addMessage(shop: string, offerId: number, from: "BUYER" | "SELLER", body: string, customerId?: string) {
  const where: Record<string, unknown> = { id: offerId, shop };
  if (customerId) where.customerId = customerId;
  const offer = await db.offer.findFirst({ where: where as any });
  if (!offer) throw new OfferError("Offer not found.");
  if (!ACTIVE_STATUSES.includes(offer.status)) {
    throw new OfferError("This offer is closed. Messages can only be added to active offers.");
  }
  const text = body.trim();
  if (!text) throw new OfferError("Message is empty.");
  if (text.length > 1000) throw new OfferError("Message is too long.");
  await db.offerMessage.create({ data: { offerId: offer.id, from, body: text } });
  return db.offer.findFirst({ where: { id: offer.id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
}

export async function sellerDecline(shop: string, offerId: number, note?: string) {
  const offer = await db.offer.findFirst({ where: { id: offerId, shop } });
  if (!offer) throw new OfferError("Offer not found.");
  return db.offer.update({
    where: { id: offer.id },
    data: {
      status: "DECLINED",
      messages: { create: { from: "SELLER", body: note || "We cannot meet this price right now." } },
    },
  });
}

export async function sellerAccept(shop: string, offerId: number) {
  const offer = await db.offer.findFirst({ where: { id: offerId, shop } });
  if (!offer) throw new OfferError("Offer not found.");
  if (offer.status !== "PENDING") throw new OfferError("Only pending offers can be accepted.");
  return db.offer.update({
    where: { id: offer.id },
    data: {
      status: "ACCEPTED",
      messages: {
        create: {
          from: "SELLER",
          cents: offer.offerCents,
          body: `Accepted at ${formatCents(offer.offerCents)}. An invoice is ready, the price is held for 48 hours.`,
        },
      },
    },
  });
}

export async function recordDraftOrder(offerId: number, draftOrderId: string, invoiceUrl: string) {
  return db.offer.update({ where: { id: offerId }, data: { draftOrderId, invoiceUrl } });
}

export async function expireStaleOffers(shop: string) {
  return db.offer.updateMany({
    where: { shop, status: { in: ACTIVE_STATUSES }, expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

// ---------- helpers ----------

export class OfferError extends Error {}

async function getOwnOffer(shop: string, customerId: string, offerId: number) {
  const offer = await db.offer.findFirst({ where: { id: offerId, shop, customerId } });
  if (!offer) throw new OfferError("Offer not found.");
  return offer;
}

