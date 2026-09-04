import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { buildReconciliationPrompt } from "./src/reconciliation/tier2-llm/buildReconciliationPrompt";

const prisma = new PrismaClient();

async function main() {
  const banks = await prisma.bankTransaction.findMany();
  const ledgers = await prisma.ledgerEntry.findMany();
  const settlements = await prisma.settlementRecord.findMany();
  
  let maxLength = 0;
  for (const b of banks) {
    for (const l of ledgers) {
      if (b.linkedLedgerId !== l.ledgerEntryId) continue;
      const prompt = buildReconciliationPrompt({ bank: b as any, ledger: l as any, settlement: null, deferralReason: "Test" });
      if (prompt.length > maxLength) maxLength = prompt.length;
    }
  }
  console.log("Max prompt length:", maxLength);
}
main().catch(console.error).finally(() => prisma.$disconnect());
