-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "paymentSettledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "balancePaisa" INTEGER NOT NULL DEFAULT 0;
