-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('PAYMENT', 'REFUND', 'PARTIAL_PAYMENT', 'PAYOUT');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'PARTIAL_MATCH', 'EXCEPTION');

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "bankTxnId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "linkedLedgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "invoiceOrOrderId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "entryDate" TIMESTAMP(3) NOT NULL,
    "entryType" "EntryType" NOT NULL,
    "linkedBankTxnId" TEXT,
    "linkedSettlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRecord" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "utr" TEXT,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "fee" DECIMAL(65,30) NOT NULL,
    "tax" DECIMAL(65,30) NOT NULL,
    "netAmount" DECIMAL(65,30) NOT NULL,
    "settlementDate" TIMESTAMP(3) NOT NULL,
    "linkedLedgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationResult" (
    "id" TEXT NOT NULL,
    "bankTxnId" TEXT,
    "ledgerEntryId" TEXT,
    "settlementId" TEXT,
    "status" "ReconciliationStatus" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "discrepancyType" TEXT,
    "reasoning" TEXT NOT NULL,
    "resolvedByLLM" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_bankTxnId_key" ON "BankTransaction"("bankTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_ledgerEntryId_key" ON "LedgerEntry"("ledgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRecord_settlementId_key" ON "SettlementRecord"("settlementId");
