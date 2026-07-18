/* One-time dev-store seeding: metafield definitions, sample catalog, pages,
   and the main menu. Every step reports errors instead of throwing so a
   partial seed can be re-run safely (mutations are effectively idempotent:
   existing definitions/pages/products surface as userErrors we report). */

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export type SeedResult = { step: string; ok: boolean; detail: string };

const METAFIELDS = [
  { name: "MOQ", key: "moq", type: "number_integer", description: "Minimum order quantity" },
  { name: "Condition", key: "condition", type: "single_line_text_field", description: "N (new) or R (refurbished)" },
  { name: "Warehouse", key: "warehouse", type: "single_line_text_field", description: "Ships-from warehouse label" },
  { name: "Specs", key: "specs", type: "multi_line_text_field", description: "One Key: Value per line" },
];

const PRODUCTS = [
  { title: 'HP Spectre x360 16-AA0000 2-in-1 Core Ultra 7 155H 1TB SSD 16GB 16" 2.8K Touch WIN11 RTX 4050 Nightfall Black', vendor: "HP", sku: "9V2K8UA#ABA", price: "789.00", compareAt: "845.00", qty: 61, moq: 5, cond: "N", wh: "Miami, FL", tags: [] as string[] },
  { title: 'HP 17-CN4047 Core 7 150U 512GB SSD 16GB 17.3" FHD WIN11 Natural Silver, US Sales Only', vendor: "HP", sku: "A05FXUA#ABA", price: "489.00", compareAt: "519.00", qty: 140, moq: 10, cond: "R", wh: "Miami, FL", tags: [] },
  { title: 'HP OmniBook 3 15-FN0105 AMD Ryzen AI 5 330 512GB SSD 16GB 15.6" FHD Touch WIN11 Glacier Silver FP Reader', vendor: "HP", sku: "C20WBUA#ABA", price: "459.00", compareAt: null, qty: 72, moq: 10, cond: "N", wh: "Miami, FL", tags: ["just-launched"] },
  { title: 'Dell Inspiron 16 5645 Ryzen 7 8840HS 1TB SSD 16GB 16" FHD+ WIN11 Platinum Silver', vendor: "Dell", sku: "I5645-A712SLV", price: "612.00", compareAt: null, qty: 96, moq: 8, cond: "N", wh: "Newark, NJ", tags: [] },
  { title: 'Lenovo IdeaPad Slim 5 16IRL8 Core i7-1355U 512GB SSD 16GB 16" WUXGA WIN11 Cloud Grey', vendor: "Lenovo", sku: "82XF002GUS", price: "438.00", compareAt: "472.00", qty: 34, moq: 12, cond: "R", wh: "Newark, NJ", tags: [] },
  { title: 'Apple MacBook Air 13.6" M3 8-Core 256GB SSD 8GB Midnight, Sealed, US Spec', vendor: "Apple", sku: "MRXV3LL/A", price: "869.00", compareAt: null, qty: 48, moq: 5, cond: "N", wh: "Miami, FL", tags: [] },
  { title: 'Samsung Galaxy Tab A9+ 11" 64GB Wi-Fi Graphite, Retail Packaging', vendor: "Samsung", sku: "SM-X210NZAAXAR", price: "148.00", compareAt: "159.00", qty: 320, moq: 20, cond: "N", wh: "Dallas, TX", tags: [] },
  { title: 'ASUS V16 V3607VM-DS79 Gaming Core 7 240H 1TB SSD 32GB 16" WUXGA 144Hz WIN11 RTX 5060 Black', vendor: "Asus", sku: "V3607VM-DS79", price: "1338.00", compareAt: null, qty: 23, moq: 3, cond: "N", wh: "Miami, FL", tags: ["just-launched"] },
  { title: "MSI Codex R2 AI A2NVM7-469 Gaming Desktop Core Ultra 7 265 2TB 32GB WIN11 RTX 5060 Ti Black", vendor: "MSI", sku: "A2NVM7-469US", price: "1890.00", compareAt: null, qty: 0, moq: 2, cond: "N", wh: "Miami, FL", tags: [] },
  { title: "SanDisk Extreme Portable SSD 2TB USB-C 3.2 Gen 2 IP65, Bulk Brown Box", vendor: "SanDisk", sku: "SDSSDE62-2T00-GAO", price: "118.00", compareAt: "131.00", qty: 410, moq: 25, cond: "N", wh: "Dallas, TX", tags: [] },
  { title: 'Lenovo ThinkPad E16 Gen 2 Core Ultra 5 125U 512GB SSD 16GB 16" WUXGA WIN11 Pro Black', vendor: "Lenovo", sku: "21M5004QUS", price: "724.00", compareAt: null, qty: 12, moq: 6, cond: "N", wh: "Newark, NJ", tags: ["just-launched"] },
  { title: "Apple AirPods Pro 2 USB-C, Master Carton of 10, Sealed", vendor: "Apple", sku: "MTJV3AM/A", price: "168.00", compareAt: "174.00", qty: 8, moq: 10, cond: "N", wh: "Miami, FL", tags: [] },
];

const PAGES = [
  { title: "Past Purchases", handle: "past-purchases", templateSuffix: "past-purchases", body: "" },
  { title: "Price List", handle: "price-list", templateSuffix: "price-list", body: "" },
  { title: "Apply", handle: "apply", templateSuffix: "apply", body: "" },
  { title: "My Offers", handle: "my-offers", templateSuffix: "my-offers", body: "" },
  { title: "Notifications", handle: "notifications", templateSuffix: "notifications", body: "" },
];

async function gql(admin: AdminClient, query: string, variables?: Record<string, unknown>) {
  const response = await admin.graphql(query, { variables });
  const body = await response.json();
  return body as { data?: any; errors?: any };
}

function collectErrors(payload: any): string {
  const userErrors = payload?.userErrors ?? [];
  return userErrors.map((e: any) => e.message).join("; ");
}

export async function seedStore(admin: AdminClient): Promise<SeedResult[]> {
  const results: SeedResult[] = [];

  // 1. Metafield definitions
  for (const def of METAFIELDS) {
    const { data, errors } = await gql(
      admin,
      `#graphql
      mutation($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { message }
        }
      }`,
      {
        definition: {
          name: def.name,
          namespace: "custom",
          key: def.key,
          description: def.description,
          type: def.type,
          ownerType: "PRODUCT",
          pin: true,
        },
      },
    );
    const err = errors ? JSON.stringify(errors) : collectErrors(data?.metafieldDefinitionCreate);
    results.push({
      step: `Metafield custom.${def.key}`,
      ok: Boolean(data?.metafieldDefinitionCreate?.createdDefinition) || err.includes("taken"),
      detail: err || "created",
    });
  }

  // 2. Location for inventory. Must be one that ships inventory and fulfills
  //    online orders, or the storefront treats the stock as unsellable.
  const loc = await gql(admin, `#graphql
    query { locations(first: 10) { nodes { id name fulfillsOnlineOrders shipsInventory } } }`);
  const locNodes = loc.data?.locations?.nodes ?? [];
  const shippingLoc = locNodes.find((l: any) => l.shipsInventory && l.fulfillsOnlineOrders) ?? locNodes[0];
  const locationId = shippingLoc?.id;
  results.push({
    step: "Locate warehouse",
    ok: Boolean(locationId),
    detail: locationId ? shippingLoc.name : "no location found",
  });

  // 3. Products
  for (const p of PRODUCTS) {
    const { data, errors } = await gql(
      admin,
      `#graphql
      mutation($input: ProductSetInput!) {
        productSet(input: $input, synchronous: true) {
          product { id }
          userErrors { field message }
        }
      }`,
      {
        input: {
          title: p.title,
          vendor: p.vendor,
          status: "ACTIVE",
          tags: p.tags,
          productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
          metafields: [
            { namespace: "custom", key: "moq", type: "number_integer", value: String(p.moq) },
            { namespace: "custom", key: "condition", type: "single_line_text_field", value: p.cond },
            { namespace: "custom", key: "warehouse", type: "single_line_text_field", value: p.wh },
          ],
          variants: [
            {
              optionValues: [{ optionName: "Title", name: "Default Title" }],
              price: p.price,
              compareAtPrice: p.compareAt,
              sku: p.sku,
              inventoryPolicy: "DENY",
              inventoryItem: { tracked: true },
              inventoryQuantities: locationId
                ? [{ locationId, name: "available", quantity: p.qty }]
                : [],
            },
          ],
        },
      },
    );
    const err = errors ? JSON.stringify(errors) : collectErrors(data?.productSet);
    results.push({
      step: `Product ${p.sku}`,
      ok: Boolean(data?.productSet?.product),
      detail: err || "created",
    });
  }

  // 4. Pages
  for (const page of PAGES) {
    const { data, errors } = await gql(
      admin,
      `#graphql
      mutation($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page { id }
          userErrors { message }
        }
      }`,
      {
        page: {
          title: page.title,
          handle: page.handle,
          body: page.body,
          isPublished: true,
          ...(page.templateSuffix ? { templateSuffix: page.templateSuffix } : {}),
        },
      },
    );
    const err = errors ? JSON.stringify(errors) : collectErrors(data?.pageCreate);
    results.push({
      step: `Page /${page.handle}`,
      ok: Boolean(data?.pageCreate?.page) || err.includes("taken"),
      detail: err || "created",
    });
  }

  // 5. Main menu
  const menus = await gql(admin, `#graphql
    query { menus(first: 10) { nodes { id handle title } } }`);
  const mainMenu = menus.data?.menus?.nodes?.find((m: any) => m.handle === "main-menu");
  if (mainMenu) {
    const { data, errors } = await gql(
      admin,
      `#graphql
      mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
          menu { id }
          userErrors { message }
        }
      }`,
      {
        id: mainMenu.id,
        title: mainMenu.title,
        handle: mainMenu.handle,
        items: [
          { title: "Shop", type: "HTTP", url: "/collections/all" },
          { title: "Price List", type: "HTTP", url: "/pages/price-list" },
          { title: "Past Purchases", type: "HTTP", url: "/pages/past-purchases" },
          { title: "My Offers", type: "HTTP", url: "/pages/my-offers" },
        ],
      },
    );
    const err = errors ? JSON.stringify(errors) : collectErrors(data?.menuUpdate);
    results.push({ step: "Main menu", ok: Boolean(data?.menuUpdate?.menu), detail: err || "updated" });
  } else {
    results.push({ step: "Main menu", ok: false, detail: "main-menu not found" });
  }

  return results;
}
