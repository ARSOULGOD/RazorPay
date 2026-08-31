import { prisma } from "../src/db/prisma";
import fs from "fs";
import path from "path";

async function main() {
  const mapping = JSON.parse(
    fs.readFileSync(path.resolve("../ground-truth/event-mapping.json"), "utf8"),
  );
  const orphans = mapping.events.filter((e: { discrepancyType: string }) => e.discrepancyType === "trueOrphan");
  console.log("=== ORPHANS (" + orphans.length + ") ===");
  for (const o of orphans) {
    if (o.bankTxnIds[0]) {
      console.log(
        "BANK",
        await prisma.bankTransaction.findUnique({ where: { bankTxnId: o.bankTxnIds[0] } }),
      );
    }
    if (o.ledgerEntryIds[0]) {
      console.log(
        "LEDGER",
        await prisma.ledgerEntry.findUnique({ where: { ledgerEntryId: o.ledgerEntryIds[0] } }),
      );
    }
    if (o.settlementIds[0]) {
      console.log(
        "SETTLE",
        await prisma.settlementRecord.findUnique({ where: { settlementId: o.settlementIds[0] } }),
      );
    }
  }

  const fee = mapping.events.find((e: { discrepancyType: string }) => e.discrepancyType === "feeDeduction");
  console.log("\n=== FEE DEDUCTION", fee.eventId, "===");
  console.log(
    "ledger",
    await prisma.ledgerEntry.findUnique({ where: { ledgerEntryId: fee.ledgerEntryIds[0] } }),
  );
  console.log(
    "settlement",
    await prisma.settlementRecord.findUnique({ where: { settlementId: fee.settlementIds[0] } }),
  );
  console.log(
    "bank",
    await prisma.bankTransaction.findUnique({ where: { bankTxnId: fee.bankTxnIds[0] } }),
  );

  const lag = mapping.events.find((e: { discrepancyType: string }) => e.discrepancyType === "settlementLag");
  console.log("\n=== SETTLEMENT LAG", lag.eventId, "===");
  const lLed = await prisma.ledgerEntry.findUnique({ where: { ledgerEntryId: lag.ledgerEntryIds[0] } });
  const lBank = await prisma.bankTransaction.findUnique({ where: { bankTxnId: lag.bankTxnIds[0] } });
  console.log("ledgerDate", lLed?.entryDate?.toISOString());
  console.log("bankDate", lBank?.transactionDate?.toISOString());
  console.log("amounts", String(lLed?.amount), String(lBank?.amount));

  console.log("\n=== TABLE COUNTS ===", {
    bank: await prisma.bankTransaction.count(),
    ledger: await prisma.ledgerEntry.count(),
    settlement: await prisma.settlementRecord.count(),
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
