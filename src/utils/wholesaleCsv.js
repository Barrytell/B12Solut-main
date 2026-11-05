import { format } from 'date-fns';
import { supplierNameForItem } from '@/utils/wholesale';
import { loadStoreSettings } from '@/utils/storeSettings';

const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/**
 * One row per order line, so the file reads as an itemised list a supplier can use.
 * Cost and profit figures are deliberately left out.
 */
export function buildWholesaleOrdersCsv(orders = [], supplierIndex = {}) {
  const store = loadStoreSettings();
  const rows = [
    // Store letterhead, so the export carries the same header as every other document
    [
      store.storeName,
      store.storeAddress,
      store.storePhone ? `Tel: ${store.storePhone}` : '',
      store.storeEmail,
      store.storeWebsite,
    ],
    [
      'Order #', 'Date', 'Customer', 'Product', 'SKU', 'Supplier',
      'Quantity', 'Unit Price', 'Line Total', 'Order Total', 'Payment Method',
    ],
  ];

  orders.forEach(order => {
    (order.items || []).forEach(item => {
      rows.push([
        order.transaction_number || '',
        order.created_date ? format(new Date(order.created_date), 'yyyy-MM-dd HH:mm') : '',
        order.customer_name || 'Walk-in',
        item.product_name || '',
        item.sku || '',
        supplierNameForItem(item, supplierIndex),
        item.quantity ?? '',
        (item.unit_price || 0).toFixed(2),
        (item.line_total || 0).toFixed(2),
        (order.grand_total || 0).toFixed(2),
        order.payment_method || '',
      ]);
    });
  });

  return rows.map(row => row.map(cell).join(',')).join('\n');
}

export function downloadCsv(filename, csv) {
  // Leading BOM so Excel opens the file as UTF-8
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}