import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ApplicationError, submitApplication } from "../applications.server";

/** App Proxy: /apps/dw/apply
 *  Public application form from the storefront gate. No customer session
 *  required (applicants are not customers yet); Shopify still signs the
 *  request so it can only arrive through the shop's own domain. */

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "App not installed" }, 401);

  const body = await request.json();
  try {
    await submitApplication({
      shop: session.shop,
      company: String(body.company || ""),
      contact: String(body.contact || ""),
      email: String(body.email || ""),
      phone: String(body.phone || ""),
      ein: String(body.ein || ""),
      resaleCert: String(body.resaleCert || ""),
      businessType: String(body.businessType || ""),
      volume: String(body.volume || ""),
      message: String(body.message || ""),
    });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof ApplicationError) return json({ error: error.message }, 422);
    throw error;
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
