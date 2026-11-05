import React from 'react';
import { Printer, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { printThermalReceipt } from '@/utils/thermalReceipt';
import { generateSaleInvoicePDF } from '@/utils/saleInvoicePDF';
import { loadStoreSettings } from '@/utils/storeSettings';

export default function TransactionPrintActions({ transaction, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => printThermalReceipt({ transaction, storeSettings: loadStoreSettings() })}
      >
        <Printer className="w-3.5 h-3.5" /> Print Receipt
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => generateSaleInvoicePDF(transaction)}
      >
        <FileText className="w-3.5 h-3.5" /> PDF Invoice
      </Button>
    </div>
  );
}