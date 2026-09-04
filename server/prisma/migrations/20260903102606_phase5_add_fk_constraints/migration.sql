-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_linkedLedgerId_fkey" FOREIGN KEY ("linkedLedgerId") REFERENCES "LedgerEntry"("ledgerEntryId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_linkedBankTxnId_fkey" FOREIGN KEY ("linkedBankTxnId") REFERENCES "BankTransaction"("bankTxnId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_linkedSettlementId_fkey" FOREIGN KEY ("linkedSettlementId") REFERENCES "SettlementRecord"("settlementId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRecord" ADD CONSTRAINT "SettlementRecord_linkedLedgerId_fkey" FOREIGN KEY ("linkedLedgerId") REFERENCES "LedgerEntry"("ledgerEntryId") ON DELETE SET NULL ON UPDATE CASCADE;
