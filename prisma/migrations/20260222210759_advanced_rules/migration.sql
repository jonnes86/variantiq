/*
  Warnings:

  - You are about to drop the column `childFieldId` on the `Rule` table. All the data in the column will be lost.
  - You are about to drop the column `childOptionsJson` on the `Rule` table. All the data in the column will be lost.
  - You are about to drop the column `parentFieldId` on the `Rule` table. All the data in the column will be lost.
  - You are about to drop the column `parentValue` on the `Rule` table. All the data in the column will be lost.
  - Added the required column `conditionsJson` to the `Rule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetFieldId` to the `Rule` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Rule_childFieldId_idx";

-- DropIndex
DROP INDEX "Rule_parentFieldId_idx";

-- AlterTable
ALTER TABLE "Rule" DROP COLUMN "childFieldId",
DROP COLUMN "childOptionsJson",
DROP COLUMN "parentFieldId",
DROP COLUMN "parentValue",
ADD COLUMN     "actionType" TEXT NOT NULL DEFAULT 'SHOW',
ADD COLUMN     "conditionsJson" JSONB NOT NULL,
ADD COLUMN     "targetFieldId" TEXT NOT NULL,
ADD COLUMN     "targetOptionsJson" JSONB;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "backgroundColor" TEXT,
ADD COLUMN     "borderColor" TEXT,
ADD COLUMN     "borderRadius" TEXT,
ADD COLUMN     "fontFamily" TEXT,
ADD COLUMN     "fontSize" TEXT,
ADD COLUMN     "fontWeight" TEXT,
ADD COLUMN     "hoverBackgroundColor" TEXT,
ADD COLUMN     "hoverTextColor" TEXT,
ADD COLUMN     "padding" TEXT,
ADD COLUMN     "textColor" TEXT;

-- CreateIndex
CREATE INDEX "Rule_targetFieldId_idx" ON "Rule"("targetFieldId");
