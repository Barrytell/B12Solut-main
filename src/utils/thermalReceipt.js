import { DEFAULT_STORE_SETTINGS } from './storeSettings';

/**
 * Generates and opens a thermal receipt print window.
 * Formatted for 80mm (302px) thermal printers with proper @page rules.
 */
export function printThermalReceipt({ transaction, storeSettings }) {
  const {
    transaction_number = '',
    cashier_name = '',
    items = [],
    subtotal = 0,
    tax_total = 0,
    discount_amount = 0,
    grand_total = 0,
    payment_method = '',
    amount_paid = 0,
    change_given = 0,
    created_date,
    sale_type = 'retail',
    customer_name = '',
  } = transaction;

  const {
    storeName = DEFAULT_STORE_SETTINGS.storeName,
    storeAddress = DEFAULT_STORE_SETTINGS.storeAddress,
    storePhone = DEFAULT_STORE_SETTINGS.storePhone,
    storeEmail = DEFAULT_STORE_SETTINGS.storeEmail,
    storeWebsite = DEFAULT_STORE_SETTINGS.storeWebsite,
    storeLogo = '',
    footerText = DEFAULT_STORE_SETTINGS.footerText,
    taxLabel = 'Tax',
    showItemTax = true,
  } = storeSettings || {};

  const date = created_date
    ? new Date(created_date).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : new Date().toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });

  const logoHtml = storeLogo
    ? `<img src="${storeLogo}" alt="Store Logo" style="max-width:140px;max-height:72px;object-fit:contain;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" onerror="this.style.display='none'" />`
    : '';

  const itemRows = items.map(item => {
    const qty = item.quantity;
    const unitPrice = (item.unit_price || 0).toFixed(2);
    const lineTotal = (item.line_total || 0).toFixed(2);
    const taxLine = (showItemTax !== false) && item.tax_rate > 0
      ? `<tr><td colspan="4" class="item-tax">  incl. ${taxLabel} (${item.tax_rate}%): $${(item.tax_amount || 0).toFixed(2)}</td></tr>`
      : '';
    return `
      <tr class="item-row">
        <td class="item-name">${escapeHtml(item.product_name || '')}</td>
        <td class="item-qty">${qty}</td>
        <td class="item-price">$${unitPrice}</td>
        <td class="item-total">$${lineTotal}</td>
      </tr>
      ${taxLine}
    `;
  }).join('');

  const footerLines = footerText
    .split('\n')
    .map(l => `<div>${escapeHtml(l)}</div>`)
    .join('');

  // Simple barcode-style representation using | characters
  const barcodeChars = transaction_number.replace(/[^A-Z0-9]/g, '');
  const barcodeBar = barcodeChars.split('').map(c => {
    const code = c.charCodeAt(0);
    return (code % 2 === 0) ? '||' : '| ';
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Receipt — ${escapeHtml(transaction_number)}</title>
  <style>
    /* ── Reset ── */
    * { margin: 0; padding: 0; box-sizing: border-box; }

    /* ── Thermal body: 80mm = 302px ── */
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11.5px;
      line-height: 1.45;
      width: 302px;
      margin: 0 auto;
      padding: 14px 12px 20px;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Layout helpers ── */
    .center { text-align: center; }
    .right   { text-align: right; }
    .bold    { font-weight: bold; }
    .small   { font-size: 9.5px; }
    .mt2     { margin-top: 2px; }
    .mt4     { margin-top: 4px; }

    /* ── Dividers ── */
    .divider-dashed {
      border: none;
      border-top: 1px dashed #000;
      margin: 7px 0;
    }
    .divider-solid {
      border: none;
      border-top: 1px solid #000;
      margin: 7px 0;
    }
    .divider-double {
      border: none;
      border-top: 3px double #000;
      margin: 7px 0;
    }

    /* ── Header ── */
    .store-name {
      font-size: 16px;
      font-weight: bold;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    .store-meta {
      font-size: 10px;
      color: #333;
      line-height: 1.5;
    }

    /* ── Transaction info ── */
    .tx-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      margin: 1px 0;
    }
    .tx-number {
      font-weight: bold;
      font-size: 10.5px;
    }

    /* ── Items table ── */
    table.items {
      width: 100%;
      border-collapse: collapse;
    }
    table.items thead tr th {
      font-size: 9.5px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 2px 0;
      border-bottom: 1px solid #000;
    }
    table.items thead th:first-child  { text-align: left; }
    table.items thead th.item-qty     { text-align: center; width: 28px; }
    table.items thead th.item-price   { text-align: right;  width: 52px; }
    table.items thead th.item-total   { text-align: right;  width: 52px; }

    tr.item-row td { padding: 3px 0; vertical-align: top; }
    .item-name  { max-width: 120px; word-break: break-word; }
    .item-qty   { text-align: center; width: 28px; }
    .item-price { text-align: right;  width: 52px; }
    .item-total { text-align: right;  width: 52px; font-weight: bold; }
    .item-tax   { font-size: 9px; color: #555; padding-bottom: 2px; }

    /* ── Totals table ── */
    table.totals { width: 100%; border-collapse: collapse; }
    table.totals td { padding: 2px 0; }
    table.totals td:last-child { text-align: right; }
    .row-subtotal td  { font-size: 10.5px; }
    .row-tax td       { font-size: 10.5px; }
    .row-discount td  { font-size: 10.5px; }
    .row-total td     { font-size: 14px; font-weight: bold; padding-top: 5px; padding-bottom: 3px; }
    .row-paid td      { font-size: 10px; color: #333; }
    .row-change td    { font-size: 10px; color: #333; }

    /* ── Barcode strip ── */
    .barcode-strip {
      font-family: 'Courier New', monospace;
      font-size: 18px;
      letter-spacing: 2px;
      text-align: center;
      line-height: 1;
      margin: 4px 0 2px;
      overflow: hidden;
      white-space: nowrap;
    }
    .barcode-label {
      font-size: 8.5px;
      letter-spacing: 3px;
      text-align: center;
      color: #222;
    }

    /* ── Footer ── */
    .footer {
      font-size: 10px;
      text-align: center;
      line-height: 1.65;
      color: #222;
    }
    .footer-thank {
      font-size: 12px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 3px;
    }

    /* ── Print rules ── */
    @media print {
      html {
        width: 100%;
        display: flex;
        justify-content: center;
      }
      body {
        width: 302px;
        margin: 0 auto;
      }
      @page {
        size: 80mm auto;
        margin: 0;
      }
    }
  </style>
</head>
<body>

  <!-- ══ STORE HEADER ══ -->
  <div class="center">
    ${logoHtml}
    <div class="store-name">${escapeHtml(storeName)}</div>
    <div class="store-meta">
      ${storeAddress ? `<div>${escapeHtml(storeAddress)}</div>` : ''}
      ${storePhone ? `<div>Tel: ${escapeHtml(storePhone)}</div>` : ''}
      ${storeEmail ? `<div>${escapeHtml(storeEmail)}</div>` : ''}
      ${storeWebsite ? `<div>${escapeHtml(storeWebsite)}</div>` : ''}
    </div>
  </div>

  <hr class="divider-solid" />

  <!-- ══ TRANSACTION META ══ -->
  <div class="tx-row">
    <span>${date}</span>
    <span class="tx-number">${escapeHtml(transaction_number)}</span>
  </div>
  <div class="tx-row">
    <span>Cashier:</span>
    <span>${escapeHtml(cashier_name || '—')}</span>
  </div>
  <div class="tx-row">
    <span>Payment:</span>
    <span class="bold">${escapeHtml((payment_method || '').toUpperCase())}</span>
  </div>
  ${sale_type === 'wholesale' ? `
  <div class="tx-row">
    <span>Order Type:</span>
    <span class="bold">WHOLESALE</span>
  </div>` : ''}
  ${customer_name ? `
  <div class="tx-row">
    <span>Customer:</span>
    <span>${escapeHtml(customer_name)}</span>
  </div>` : ''}

  <hr class="divider-dashed" />

  <!-- ══ ITEMS ══ -->
  <table class="items">
    <thead>
      <tr>
        <th>Item</th>
        <th class="item-qty">Qty</th>
        <th class="item-price">Unit</th>
        <th class="item-total">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <hr class="divider-dashed" />

  <!-- ══ TOTALS ══ -->
  <table class="totals">
    <tr class="row-subtotal">
      <td>Subtotal</td>
      <td>$${subtotal.toFixed(2)}</td>
    </tr>
    ${tax_total > 0 ? `
    <tr class="row-tax">
      <td>${escapeHtml(taxLabel)}</td>
      <td>$${tax_total.toFixed(2)}</td>
    </tr>` : ''}
    ${discount_amount > 0 ? `
    <tr class="row-discount">
      <td>Discount</td>
      <td>-$${discount_amount.toFixed(2)}</td>
    </tr>` : ''}
  </table>

  <hr class="divider-double" />

  <table class="totals">
    <tr class="row-total">
      <td>TOTAL</td>
      <td>$${grand_total.toFixed(2)}</td>
    </tr>
    <tr class="row-paid">
      <td>Amount Paid</td>
      <td>$${amount_paid.toFixed(2)}</td>
    </tr>
    ${change_given > 0 ? `
    <tr class="row-change">
      <td>Change</td>
      <td>$${change_given.toFixed(2)}</td>
    </tr>` : ''}
  </table>

  <hr class="divider-dashed" />

  <!-- ══ BARCODE STRIP ══ -->
  <div class="barcode-strip" aria-hidden="true">
    ${barcodeBar.substring(0, 36)}
  </div>
  <div class="barcode-label">${escapeHtml(transaction_number)}</div>

  <hr class="divider-dashed" />

  <!-- ══ FOOTER ══ -->
  <div class="footer">
    ${footerLines}
  </div>

  <div style="margin-top:16px;"></div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=380,height=680,menubar=no,toolbar=no');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Auto-print after fonts/images load
  setTimeout(() => {
    win.print();
    // Close after print dialog is dismissed (non-blocking)
    win.onafterprint = () => win.close();
  }, 600);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}