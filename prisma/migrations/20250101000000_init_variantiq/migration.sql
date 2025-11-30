CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL DEFAULT '',
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "optionsJson" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "parentFieldId" TEXT NOT NULL,
    "parentValue" TEXT NOT NULL,
    "childFieldId" TEXT NOT NULL,
    "childOptionsJson" JSONB,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTemplateLink" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTemplateLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE INDEX "Template_shop_idx" ON "Template"("shop");

-- CreateIndex
CREATE INDEX "Field_templateId_idx" ON "Field"("templateId");

-- CreateIndex
CREATE INDEX "Rule_templateId_idx" ON "Rule"("templateId");

-- CreateIndex
CREATE INDEX "Rule_parentFieldId_idx" ON "Rule"("parentFieldId");

-- CreateIndex
CREATE INDEX "Rule_childFieldId_idx" ON "Rule"("childFieldId");

-- CreateIndex
CREATE INDEX "ProductTemplateLink_shop_idx" ON "ProductTemplateLink"("shop");

-- CreateIndex
CREATE INDEX "ProductTemplateLink_productGid_idx" ON "ProductTemplateLink"("productGid");

-- CreateIndex
CREATE INDEX "ProductTemplateLink_templateId_idx" ON "ProductTemplateLink"("templateId");

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplateLink" ADD CONSTRAINT "ProductTemplateLink_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
