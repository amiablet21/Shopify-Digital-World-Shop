-- CreateTable
CREATE TABLE "Offer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "listPriceCents" INTEGER NOT NULL,
    "offerCents" INTEGER NOT NULL,
    "counterCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "draftOrderId" TEXT,
    "invoiceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OfferMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "offerId" INTEGER NOT NULL,
    "from" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferMessage_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Watch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "onPriceDrop" BOOLEAN NOT NULL DEFAULT true,
    "onRestock" BOOLEAN NOT NULL DEFAULT true,
    "lastPriceCents" INTEGER,
    "lastAvailable" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Offer_shop_customerId_status_idx" ON "Offer"("shop", "customerId", "status");

-- CreateIndex
CREATE INDEX "Offer_shop_status_idx" ON "Offer"("shop", "status");

-- CreateIndex
CREATE INDEX "OfferMessage_offerId_idx" ON "OfferMessage"("offerId");

-- CreateIndex
CREATE INDEX "Watch_shop_variantId_idx" ON "Watch"("shop", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Watch_shop_customerId_variantId_key" ON "Watch"("shop", "customerId", "variantId");
