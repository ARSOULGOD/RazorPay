import { Router } from "express";
import { prisma } from "../db/prisma";
import { getGroqClient, getGroqModelName } from "../reconciliation/tier2-llm/groqClient";

export const qnaRouter = Router();

qnaRouter.post("/ask", async (req, res) => {
  try {
    const { settlementId, question } = req.body;
    
    // 1. Fetch full context
    const settlement = await prisma.settlementRecord.findUnique({
      where: { settlementId }
    });
    
    const result = await prisma.reconciliationResult.findFirst({
      where: { settlementId }
    });
    
    if (!settlement) {
      return res.status(404).json({ error: "Settlement not found" });
    }

    // 2. Build Prompt
    const prompt = `You are a finance AI assistant answering a question about a payment settlement.
Settlement Data: ${JSON.stringify(settlement)}
Agent's Reconciliation Reasoning: ${result?.reasoning ?? 'None'}
User Question: ${question}
Provide a concise, helpful answer explaining the numbers or discrepancy.`;

    // 3. Query LLM
    const completion = await getGroqClient().chat.completions.create({
      model: getGroqModelName(),
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    res.json({ answer: completion.choices[0]?.message?.content });
  } catch (err) {
    console.error("QnA Error:", err);
    res.status(500).json({ error: String(err) });
  }
});

qnaRouter.get("/settlements", async (req, res) => {
  try {
    const results = await prisma.reconciliationResult.findMany({
      where: { settlementId: { not: null } },
      select: { settlementId: true, status: true },
      distinct: ['settlementId'],
      take: 50
    });
    res.json({ settlements: results });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
