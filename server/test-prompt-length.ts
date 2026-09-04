import { PrismaClient } from "@prisma/client";
import { buildReconciliationPrompt } from "./src/reconciliation/tier2-llm/buildReconciliationPrompt";

const prisma = new PrismaClient();

async function main() {
  const bank = await prisma.bankTransaction.findFirst();
  const ledger = await prisma.ledgerEntry.findFirst();
  const settlement = await prisma.settlementRecord.findFirst();
  
  const prompt = buildReconciliationPrompt({
    bank: bank as any,
    ledger: ledger as any,
    settlement: settlement as any,
    deferralReason: "Testing",
  });
  console.log("Prompt length in characters:", prompt.length);
  console.log("Prompt sample:", prompt.slice(0, 100));
}
main().catch(console.error).finally(() => prisma.$disconnect());
