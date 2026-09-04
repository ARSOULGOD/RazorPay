import "dotenv/config";
import Groq from "groq-sdk";
import { PrismaClient } from "@prisma/client";
import { buildReconciliationPrompt } from "./src/reconciliation/tier2-llm/buildReconciliationPrompt";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const prisma = new PrismaClient();

async function main() {
  const banks = await prisma.bankTransaction.findMany();
  const ledgers = await prisma.ledgerEntry.findMany();
  const settlements = await prisma.settlementRecord.findMany();
  
  const candidates: any[] = [];
  for (const l of ledgers) {
    const b = banks.find(b => b.linkedLedgerId === l.ledgerEntryId);
    const s = settlements.find(s => s.linkedLedgerId === l.ledgerEntryId);
    candidates.push({ bank: b || null, ledger: l, settlement: s || null, deferralReason: "Test" });
  }

  let failed = 0;
  for (let i = 0; i < candidates.length; i++) {
    const prompt = buildReconciliationPrompt(candidates[i]);
    try {
      await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a finance-operations reconciliation agent. Reply with a single JSON object only." },
          { role: "user", content: prompt }
        ]
      });
      console.log(`Candidate ${i} SUCCESS`);
    } catch (err: any) {
      console.log(`Candidate ${i} ERROR:`, err.message);
      failed++;
    }
  }
  console.log(`Total failed: ${failed}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
