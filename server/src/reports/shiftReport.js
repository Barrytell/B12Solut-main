// Official shift report, built ONLY from database values (correction C3).
// The PDF layout is ported from src/utils/shiftReport.js; amounts are exact
// decimal strings and all arithmetic is integer cents.
import { jsPDF } from 'jspdf';
import { centsToString, divRound, milliToString, toCents, toMilli } from '../lib/money.js';
import { esc, percent, percentTenths } from '../lib/format.js';

export async function loadReportData(db, money, shiftId) {
  const shift = (await db.query('SELECT * FROM public.shifts WHERE id = $1', [shiftId])).rows[0];
  const transactions = (await db.query(
    'SELECT * FROM public.transactions WHERE shift_id = $1 ORDER BY created_date DESC, id DESC', [shiftId],
  )).rows;
  const items = (await db.query(
    `SELECT i.* FROM public.transaction_items i JOIN public.transactions t ON t.id = i.transaction_id
      WHERE t.shift_id = $1 ORDER BY i.transaction_id, i.line_no`, [shiftId],
  )).rows;
  return buildReportData(money, shift, transactions, items);
}

/** Pure: shift + transactions + items -> report figures (exported for tests). */
export function buildReportData(money, shift, transactions, items) {
  const itemCount = new Map();
  const products = new Map();
  for (const it of items) {
    itemCount.set(it.transaction_id, (itemCount.get(it.transaction_id) ?? 0) + 1);
    const p = products.get(it.product_name) ?? { name: it.product_name, sku: it.sku, qty: 0n, revenue: 0n, cost: 0n };
    p.qty += toMilli(it.quantity);
    p.revenue += toCents(it.line_total);
    p.cost += money.lineAmount(toCents(it.cost_price), toMilli(it.quantity));
    products.set(it.product_name, p);
  }
  const topProducts = [...products.values()]
    .sort((a, b) => (b.revenue > a.revenue ? 1 : b.revenue < a.revenue ? -1 : 0))
    .map((p) => {
      const revenue = centsToString(p.revenue);
      const profit = centsToString(p.revenue - p.cost);
      return {
        name: p.name, sku: p.sku, qty: milliToString(p.qty).replace(/\.?0+$/, ''), revenue,
        cost: centsToString(p.cost), profit, margin: percent(profit, revenue), marginTenths: percentTenths(profit, revenue),
      };
    });

  const revenue = toCents(shift.total_revenue);
  const count = BigInt(shift.total_transactions);
  const expectedCash = toCents(shift.total_cash_sales);
  const declared = shift.declared_cash === null ? null : toCents(shift.declared_cash);
  const minutes = shift.end_time ? Math.round((new Date(shift.end_time) - new Date(shift.start_time)) / 60000) : 0;

  return {
    shift,
    transactions: transactions.map((t) => ({ ...t, itemCount: itemCount.get(t.id) ?? 0 })),
    topProducts,
    summary: {
      cashierName: shift.cashier_name || shift.cashier_email,
      durationMins: minutes,
      revenue: shift.total_revenue,
      cost: shift.total_cost,
      profit: shift.total_profit,
      margin: percent(shift.total_profit, shift.total_revenue),
      avgTransaction: count > 0n ? centsToString(divRound(revenue, count)) : '0.00',
      totalTransactions: Number(count),
      cashSales: shift.total_cash_sales,
      cardSales: shift.total_card_sales,
      electronicSales: shift.total_electronic_sales,
      expectedCash: centsToString(expectedCash),
      declaredCash: declared === null ? null : centsToString(declared),
      variance: declared === null ? null : centsToString(declared - expectedCash),
    },
  };
}

function varianceText(variance, fmt, { short }) {
  if (variance === null) return 'N/A';
  const v = toCents(variance);
  const abs = fmt.money(centsToString(v < 0n ? -v : v));
  if (v === 0n) return 'Balanced ✓';
  if (short) return v > 0n ? `+${abs} over` : `-${abs} short`;
  return v > 0n ? `Over by ${abs}` : `Short by ${abs}`;
}

const storeLine = (store) => [store.storeAddress, store.storePhone ? `Tel: ${store.storePhone}` : '', store.storeEmail, store.storeWebsite]
  .filter(Boolean).join('  ·  ');

/** Returns the PDF as a Buffer. Same layout as the original browser report. */
export function renderShiftPdf(data, store, fmt, now = new Date()) {
  const { summary, topProducts, transactions, shift } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 18;
  let y;
  const colR = (t, x, cy) => doc.text(String(t), x, cy, { align: 'right' });
  const line = (cy) => { doc.setDrawColor(220, 226, 235); doc.line(margin, cy, W - margin, cy); };
  const sectionHeader = (t, cy) => {
    doc.setFillColor(245, 247, 251);
    doc.roundedRect(margin, cy - 5, W - margin * 2, 9, 1, 1, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(71, 85, 105);
    doc.text(t.toUpperCase(), margin + 3, cy + 0.5);
    return cy + 9;
  };
  const pct = (part) => percent(part, summary.revenue);

  doc.setFillColor(30, 64, 175); doc.rect(0, 0, W, 38, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(store.storeName || '', margin, 14);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('Shift End Report', margin, 20);
  doc.setFontSize(7.5); doc.setTextColor(186, 209, 255); doc.text(storeLine(store), margin, 26);
  doc.text(`Generated: ${fmt.dateTime(now)}`, margin, 32);
  colR(`Report #${shift.id.slice(-6).toUpperCase()}`, W - margin, 32);

  y = 50;
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text(summary.cashierName, margin, y);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  const end = shift.end_time ?? now;
  doc.text(`${fmt.date(shift.start_time)}  ·  ${fmt.time(shift.start_time)} – ${fmt.time(end)}  ·  Duration: ${summary.durationMins} min`, margin, y + 6);
  y += 16;

  const cards = [
    ['Total Revenue', fmt.money(summary.revenue), [30, 64, 175]],
    ['Gross Profit', fmt.money(summary.profit), [5, 150, 105]],
    ['Profit Margin', summary.margin, [5, 150, 105]],
    ['Total Transactions', String(summary.totalTransactions), [99, 102, 241]],
    ['Avg. Transaction', fmt.money(summary.avgTransaction), [99, 102, 241]],
    ['Total COGS', fmt.money(summary.cost), [100, 116, 139]],
  ];
  const cardW = (W - margin * 2 - 10) / 3;
  const cardH = 18;
  cards.forEach(([label, value, color], i) => {
    const cx = margin + (i % 3) * (cardW + 5);
    const cy = y + Math.floor(i / 3) * (cardH + 4);
    doc.setFillColor(248, 250, 252); doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), cx + 4, cy + 5.5);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...color);
    doc.text(value, cx + 4, cy + 13.5);
  });
  y += 2 * (cardH + 4) + 8;

  y = sectionHeader('Payment Method Breakdown', y) + 4;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(71, 85, 105);
  doc.text('Method', margin + 2, y); colR('Amount', margin + 70, y); colR('% of Revenue', margin + 110, y);
  y += 2; line(y); y += 4;
  for (const [method, amount] of [['Cash', summary.cashSales], ['Card / POS', summary.cardSales], ['Electronic / E-Pay', summary.electronicSales]]) {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42);
    doc.text(method, margin + 2, y); colR(fmt.money(amount), margin + 70, y); colR(pct(amount), margin + 110, y);
    y += 6;
  }

  if (summary.declaredCash !== null) {
    y += 2;
    y = sectionHeader('Cash Variance Analysis', y) + 4;
    const v = toCents(summary.variance);
    const varColor = v === 0n ? [5, 150, 105] : v > 0n ? [217, 119, 6] : [220, 38, 38];
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42);
    for (const [label, val] of [['Expected Cash (from system)', summary.expectedCash], ['Declared Cash (counted)', summary.declaredCash]]) {
      doc.text(label, margin + 2, y); colR(fmt.money(val), margin + 80, y); y += 6;
    }
    line(y - 1); y += 3;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...varColor);
    doc.text('Variance', margin + 2, y); colR(varianceText(summary.variance, fmt, { short: false }), margin + 80, y);
    y += 8;
  }

  y = sectionHeader('Top Products by Revenue', y) + 4;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(71, 85, 105);
  doc.text('Product', margin + 2, y); colR('Qty', margin + 68, y); colR('Revenue', margin + 95, y);
  colR('COGS', margin + 120, y); colR('Profit', margin + 145, y); colR('Margin', margin + 170, y);
  y += 2; line(y); y += 4;
  topProducts.slice(0, 10).forEach((p, i) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.setTextColor(15, 23, 42);
    doc.text(p.name.length > 28 ? `${p.name.slice(0, 27)}…` : p.name, margin + 2, y);
    colR(p.qty, margin + 68, y); colR(fmt.money(p.revenue), margin + 95, y);
    colR(fmt.money(p.cost), margin + 120, y); colR(fmt.money(p.profit), margin + 145, y);
    doc.setTextColor(...(p.marginTenths >= 300n ? [5, 150, 105] : p.marginTenths >= 150n ? [217, 119, 6] : [220, 38, 38]));
    colR(p.margin, margin + 170, y);
    doc.setTextColor(15, 23, 42);
    y += 6;
  });

  y += 4;
  if (y > 240) { doc.addPage(); y = 20; }
  y = sectionHeader('Transaction Log', y) + 4;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(71, 85, 105);
  doc.text('TX #', margin + 2, y); doc.text('Time', margin + 45, y); doc.text('Method', margin + 80, y);
  doc.text('Items', margin + 110, y); colR('Total', margin + 155, y);
  y += 2; line(y); y += 4;
  transactions.slice(0, 20).forEach((tx) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42);
    doc.text((tx.transaction_number || '').slice(0, 18), margin + 2, y);
    doc.text(fmt.time(tx.created_date), margin + 45, y);
    doc.text(tx.payment_method || '-', margin + 80, y);
    doc.text(String(tx.itemCount), margin + 115, y);
    colR(fmt.money(tx.grand_total), margin + 155, y);
    y += 5.5;
  });
  if (transactions.length > 20) {
    doc.setTextColor(100, 116, 139);
    doc.text(`… and ${transactions.length - 20} more transactions`, margin + 2, y + 2);
  }

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(248, 250, 252); doc.rect(0, 284, W, 13, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
    doc.text([store.storeName, store.storeAddress, store.storePhone && `Tel: ${store.storePhone}`, store.storeEmail, store.storeWebsite, 'Confidential Shift Report']
      .filter(Boolean).join(' · '), margin, 291);
    colR(`Page ${i} of ${pages}`, W - margin, 291);
  }
  return Buffer.from(doc.output('arraybuffer'));
}

/** Report email (figures from the database, every value escaped). */
export function shiftReportEmail(data, store, fmt, appUrl) {
  const { summary, shift } = data;
  const v = summary.variance === null ? null : toCents(summary.variance);
  const vBg = v !== null && v !== 0n ? (v < 0n ? '#fef2f2' : '#fffbeb') : '#f0fdf4';
  const vBorder = v !== null && v !== 0n ? (v < 0n ? '#fecaca' : '#fde68a') : '#bbf7d0';
  const vColor = v !== null && v !== 0n ? (v < 0n ? '#dc2626' : '#d97706') : '#059669';
  const pct = (part) => percent(part, summary.revenue);
  const end = shift.end_time ?? new Date();
  const payRow = (label, amount, shaded) => `
    <tr${shaded ? ' style="background:#f8fafc;"' : ''}>
      <td style="padding:8px 12px;font-size:12px;color:#64748b;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${esc(fmt.money(amount))}</td>
      <td style="padding:8px 12px;font-size:11px;color:#94a3b8;text-align:right;">${esc(pct(amount))}</td>
    </tr>`;
  const footer = [store.storeName, store.storeAddress, store.storePhone && `Tel: ${store.storePhone}`, store.storeEmail, store.storeWebsite]
    .filter(Boolean).map(esc).join(' · ');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:32px 40px;">
    <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${esc(store.storeName)}</div>
    <div style="font-size:12px;color:#bfdbfe;margin-top:4px;">${esc(storeLine(store))}</div>
    <div style="font-size:13px;color:#bfdbfe;margin-top:6px;">Shift End Report</div>
  </td></tr>
  <tr><td style="padding:32px 40px;">
    <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#0f172a;">Shift Closed: ${esc(summary.cashierName)}</p>
    <p style="margin:0 0 24px;font-size:13px;color:#64748b;">${esc(fmt.date(shift.start_time))} · ${esc(fmt.time(shift.start_time))} – ${esc(fmt.time(end))} (${summary.durationMins} min)</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="50%" style="padding:0 8px 12px 0;"><div style="background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #e2e8f0;">
          <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Total Revenue</div>
          <div style="font-size:22px;font-weight:800;color:#1e40af;">${esc(fmt.money(summary.revenue))}</div></div></td>
        <td width="50%" style="padding:0 0 12px 8px;"><div style="background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #e2e8f0;">
          <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Gross Profit</div>
          <div style="font-size:22px;font-weight:800;color:#059669;">${esc(fmt.money(summary.profit))} <span style="font-size:13px;color:#94a3b8;">(${esc(summary.margin)})</span></div></div></td>
      </tr>
      <tr>
        <td style="padding:0 8px 0 0;"><div style="background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #e2e8f0;">
          <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Transactions</div>
          <div style="font-size:22px;font-weight:800;color:#6366f1;">${summary.totalTransactions}</div></div></td>
        <td style="padding:0 0 0 8px;"><div style="background:${vBg};border-radius:12px;padding:16px;border:1px solid ${vBorder};">
          <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Cash Variance</div>
          <div style="font-size:18px;font-weight:800;color:${vColor};">${esc(varianceText(summary.variance, fmt, { short: true }))}</div></div></td>
      </tr>
    </table>
    <div style="margin-bottom:24px;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Payment Breakdown</div>
      <table width="100%" style="border-collapse:collapse;">
        ${payRow('Cash', summary.cashSales, true)}${payRow('Card / POS', summary.cardSales, false)}${payRow('Electronic / E-Pay', summary.electronicSales, true)}
      </table>
    </div>
    <div style="background:#eff6ff;border-radius:12px;padding:16px 20px;border:1px solid #bfdbfe;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1e40af;">📎 Full PDF Report Attached</p>
      <p style="margin:0 0 12px;font-size:12px;color:#3b82f6;">The complete shift report is attached. It is also available in the app (sign-in required).</p>
      <a href="${esc(appUrl)}/admin/shifts" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:12px;font-weight:600;">Open Shifts in the app →</a>
    </div>
    <p style="margin:0;font-size:12px;color:#94a3b8;">This report was automatically generated by ${esc(store.storeName)} when ${esc(summary.cashierName)} closed their shift.</p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">${footer}</p>
    <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-align:center;">Automated Shift Report · ${esc(fmt.date(shift.start_time))}</p>
  </td></tr>
</table></td></tr></table></body></html>`;
  return { subject: `Shift Report — ${summary.cashierName} · ${fmt.date(shift.start_time)}`, html };
}
