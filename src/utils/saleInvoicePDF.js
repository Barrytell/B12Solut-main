import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { loadStoreSettings } from './storeSettings';

/**
 * Builds a full-page PDF invoice for a completed sale and saves it.
 * Uses the same store letterhead as the purchase order and shift report PDFs.
 */
export function generateSaleInvoicePDF(transaction) {
  const doc = new jsPDF();
  const store = loadStoreSettings();
  const isWholesale = transaction.sale_type === 'wholesale';
  const invoiceDate = transaction.created_date
    ? format(new Date(transaction.created_date), 'MMMM d, yyyy')
    : format(new Date(), 'MMMM d, yyyy');

  // ── Store letterhead (top right) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(store.storeName || '', 196, 20, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  [
    store.storeAddress,
    store.storePhone ? `Tel: ${store.storePhone}` : '',
    store.storeEmail,
    store.storeWebsite,
  ].filter(Boolean).forEach((line, i) => {
    doc.text(line, 196, 26 + i * 4.5, { align: 'right' });
  });
  doc.setTextColor(0, 0, 0);

  // ── Title & invoice meta ──
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(isWholesale ? 'WHOLESALE INVOICE' : 'INVOICE', 14, 22);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Invoice No: ${transaction.transaction_number || '—'}`, 14, 30);
  doc.text(`Date: ${invoiceDate}`, 14, 36);
  doc.text(`Cashier: ${transaction.cashier_name || '—'}`, 14, 42);
  doc.setTextColor(0, 0, 0);

  // ── Billed to ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Billed To:', 14, 58);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(transaction.customer_name || 'Walk-in Customer', 14, 65);

  // ── Items table ──
  const tableTop = 80;
  doc.setFillColor(240, 244, 255);
  doc.rect(14, tableTop - 6, 182, 10, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text('Item', 16, tableTop);
  doc.text('SKU', 92, tableTop);
  doc.text('Qty', 122, tableTop, { align: 'right' });
  doc.text('Unit Price', 158, tableTop, { align: 'right' });
  doc.text('Total', 194, tableTop, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  let y = tableTop + 10;

  const items = transaction.items || [];
  items.forEach((item, i) => {
    if (y > 250) {
      doc.addPage();
      y = 25;
    }
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 252);
      doc.rect(14, y - 5, 182, 9, 'F');
    }
    doc.setFontSize(9);
    const rawName = item.product_name || '';
    const name = rawName.length > 40 ? rawName.substring(0, 38) + '…' : rawName;
    doc.text(name, 16, y);
    doc.text(item.sku || '-', 92, y);
    doc.text(String(item.quantity ?? ''), 122, y, { align: 'right' });
    doc.text(`$${(item.unit_price || 0).toFixed(2)}`, 158, y, { align: 'right' });
    doc.text(`$${(item.line_total || 0).toFixed(2)}`, 194, y, { align: 'right' });
    y += 10;
  });

  // ── Totals ──
  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, 196, y);
  y += 8;

  const totalRows = [['Subtotal', transaction.subtotal || 0]];
  if (transaction.tax_total > 0) totalRows.push([store.taxLabel || 'Tax', transaction.tax_total]);
  if (transaction.discount_amount > 0) totalRows.push(['Discount', -transaction.discount_amount]);

  doc.setFontSize(10);
  totalRows.forEach(([label, value]) => {
    doc.text(label, 140, y);
    doc.text(`${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}`, 194, y, { align: 'right' });
    y += 6;
  });

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', 140, y);
  doc.text(`$${(transaction.grand_total || 0).toFixed(2)}`, 194, y, { align: 'right' });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Payment: ${(transaction.payment_method || '—').toUpperCase()}`, 140, y);
  y += 5;
  if (transaction.amount_paid) {
    doc.text(`Amount Paid: $${(transaction.amount_paid || 0).toFixed(2)}`, 140, y);
    y += 5;
  }
  if (transaction.change_given > 0) {
    doc.text(`Change: $${(transaction.change_given || 0).toFixed(2)}`, 140, y);
    y += 5;
  }

  // ── Footer ──
  const contactLine = [store.storeAddress, store.storePhone, store.storeEmail, store.storeWebsite]
    .filter(Boolean)
    .join(' · ');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`${store.storeName} · ${contactLine}`, 14, 282);
  if (store.footerText) {
    doc.text(store.footerText.replace(/\n+/g, ' · '), 14, 287);
  }

  doc.save(`Invoice_${transaction.transaction_number || 'sale'}.pdf`);
}