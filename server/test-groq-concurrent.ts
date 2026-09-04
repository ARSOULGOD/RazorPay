import "dotenv/config";
import Groq from "groq-sdk";
import { PrismaClient } from "@prisma/client";
import { buildReconciliationPrompt } from "./src/reconciliation/tier2-llm/buildReconciliationPrompt";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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

  const promises = [];
  for (let i = 0; i < 3; i++) {
    promises.push(
      groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a finance-operations reconciliation agent. Reply with a single JSON object only." },
          { role: "user", content: prompt }
        ]
      }).then(r => `SUCCESS ${i}`).catch((err: any) => `ERROR ${i}: ${err.message}`)
    );
  }
  
  const results = await Promise.all(promises);
  console.log(results);
}
main().catch(console.error).finally(() => prisma.$disconnect());
