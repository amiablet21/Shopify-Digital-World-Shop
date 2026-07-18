import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/** App Proxy: /apps/dw/watches
 *  The notify bells. GET lists the customer's watches; POST upserts or
 *  removes one, or updates its alert toggles. */

function customerFromProxyRequest(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("logged_in_customer_id");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "App not installed" }, 401);
  const customerId = customerFromProxyRequest(request);
  if (!customerId) return json({ error: "Sign in to manage alerts" }, 401);

  const watches = await db.watch.findMany({
    where: { shop: session.shop, customerId },
    orderBy: { createdAt: "desc" },
  });
  return json({ watches });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "App not installed" }, 401);
  const customerId = customerFromProxyRequest(request);
  if (!customerId) return json({ error: "Sign in to manage alerts" }, 401);

  const body = await request.json();
  const variantId = String(body.variantId || "");
  if (!variantId) return json({ error: "variantId required" }, 400);

  switch (body.action) {
    case "watch": {
      const watch = await db.watch.upsert({
        where: { shop_customerId_variantId: { shop: session.shop, customerId, variantId } },
        create: {
          shop: session.shop,
          customerId,
          customerEmail: String(body.email || ""),
          productId: String(body.productId || ""),
          variantId,
          sku: String(body.sku || ""),
          productTitle: String(body.productTitle || ""),
          onPriceDrop: body.onPriceDrop !== false,
          onRestock: body.onRestock !== false,
        },
        update: {
          onPriceDrop: body.onPriceDrop !== false,
          onRestock: body.onRestock !== false,
        },
      });
      return json({ watch });
    }
    case "unwatch": {
      await db.watch.deleteMany({ where: { shop: session.shop, customerId, variantId } });
      return json({ ok: true });
    }
    default:
      return json({ error: "Unknown action" }, 400);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
