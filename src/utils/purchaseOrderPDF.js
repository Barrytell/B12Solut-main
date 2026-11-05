import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { loadStoreSettings } from './storeSettings';

export function generatePurchaseOrderPDF(order) {
  const doc = new jsPDF();
  const today = format(new Date(), 'MMMM d, yyyy');
  const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
  const store = loadStoreSettings();

  // Header
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('PURCHASE ORDER', 14, 22);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`PO Number: ${poNumber}`, 14, 30);
  doc.text(`Date: ${today}`, 14, 36);

  // Store details (same on every document the system generates)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
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

  // Supplier info
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Supplier:', 14, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const supplier = order.supplier;
  if (supplier) {
    doc.text(supplier.name, 14, 57);
    if (supplier.contact_name) doc.text(supplier.contact_name, 14, 63);
    if (supplier.email) doc.text(supplier.email, 14, 69);
    if (supplier.phone) doc.text(supplier.phone, 14, 75);
    if (supplier.address) doc.text(supplier.address, 14, 81);
  } else {
    doc.setTextColor(150, 150, 150);
    doc.text('No supplier assigned', 14, 57);
    doc.setTextColor(0, 0, 0);
  }

  // Table header
  const tableTop = 95;
  doc.setFillColor(240, 244, 255);
  doc.rect(14, tableTop - 6, 182, 10, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text('Product', 16, tableTop);
  doc.text('SKU', 80, tableTop);
  doc.text('Stock', 108, tableTop, { align: 'right' });
  doc.text('Order Qty', 136, tableTop, { align: 'right' });
  doc.text('Unit Cost', 162, tableTop, { align: 'right' });
  doc.text('Total', 194, tableTop, { align: 'right' });

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  let y = tableTop + 10;

  order.items.forEach((item, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 252);
      doc.rect(14, y - 5, 182, 9, 'F');
    }
    doc.setFontSize(9);
    const name = item.name.length > 30 ? item.name.substring(0, 28) + '…' : item.name;
    doc.text(name, 16, y);
    doc.text(item.sku || '-', 80, y);
    doc.text(String(item.stock_quantity || 0), 108, y, { align: 'right' });
    doc.setTextColor(37, 99, 235);
    doc.text(String(item.reorderQty), 136, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.text(`$${(item.cost_price || 0).toFixed(2)}`, 162, y, { align: 'right' });
    doc.text(`$${item.lineTotal.toFixed(2)}`, 194, y, { align: 'right' });
    y += 10;
  });

  // Total row
  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, 196, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', 14, y);
  doc.text(`$${order.totalCost.toFixed(2)}`, 194, y, { align: 'right' });

  // Footer
  y += 20;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const contactLine = [store.storeAddress, store.storePhone, store.storeEmail, store.storeWebsite].filter(Boolean).join(' · ');
  doc.text(`${store.storeName} · ${contactLine}`, 14, y);
  doc.text('Generated ' + today, 14, y + 4);

  const supplierName = supplier?.name?.replace(/\s+/g, '_') || 'Unassigned';
  doc.save(`PO_${supplierName}_${poNumber}.pdf`);
}