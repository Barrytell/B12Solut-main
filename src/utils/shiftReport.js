import { api } from '@/api/client';
import { format, differenceInMinutes } from 'date-fns';
import jsPDF from 'jspdf';
import { loadStoreSettings } from './storeSettings';
import { fromCents, lineAmount, sumMoney, toCents, toMilli } from '@/lib/money';

/**
 * Fetches all transactions for a given shift and computes full report data.
 */
export async function buildShiftReportData(shift) {
  // Preview only: the official PDF and the admin email are produced by the
  // server from database values (POST /api/shifts/:id/report).
  const transactions = await api.entities.Transaction.filter({ shift_id: shift.id }, '-created_date');

  const durationMins = shift.end_time && shift.start_time
    ? differenceInMinutes(new Date(shift.end_time), new Date(shift.start_time))
    : 0;

  // Per-product sales breakdown
  // exact cents (BigInt) while summing; numbers only at the end, for display
  const productMap = {};
  transactions.forEach(tx => {
    tx.items?.forEach(item => {
      if (!productMap[item.product_name]) {
        productMap[item.product_name] = { name: item.product_name, sku: item.sku, qty: 0n, revenue: 0n, cost: 0n };
      }
      productMap[item.product_name].qty += toMilli(item.quantity || 0);
      productMap[item.product_name].revenue += toCents(item.line_total || 0);
      productMap[item.product_name].cost += lineAmount(item.cost_price || 0, item.quantity || 0);
    });
  });
  const topProducts = Object.values(productMap)
    .sort((a, b) => (b.revenue > a.revenue ? 1 : b.revenue < a.revenue ? -1 : 0))
    .map(p => {
      const revenue = fromCents(p.revenue);
      const profit = fromCents(p.revenue - p.cost);
      return { ...p, qty: Number(p.qty) / 1000, revenue, cost: fromCents(p.cost), profit, margin: revenue > 0 ? (profit / revenue * 100) : 0 };
    });

  // Hourly breakdown
  const hourlyMap = {};
  transactions.forEach(tx => {
    const hour = tx.created_date ? format(new Date(tx.created_date), 'h a') : 'Unknown';
    if (!hourlyMap[hour]) hourlyMap[hour] = { hour, revenue: 0, txCount: 0 };
    hourlyMap[hour].revenue = sumMoney([hourlyMap[hour].revenue, tx.grand_total || 0]);
    hourlyMap[hour].txCount += 1;
  });

  // Variance calculations: expected cash vs declared
  const expectedCash = shift.total_cash_sales || 0;
  // We don't have a physical count here, so we record declared = expected (cashier can manually enter in modal)
  const revenue = shift.total_revenue || 0;
  const cost = shift.total_cost || 0;
  const profit = shift.total_profit || 0;
  const margin = revenue > 0 ? (profit / revenue * 100) : 0;
  const avgTransaction = (shift.total_transactions || 0) > 0 ? revenue / shift.total_transactions : 0;

  return {
    shift,
    transactions,
    topProducts,
    hourlyBreakdown: Object.values(hourlyMap),
    summary: {
      cashierName: shift.cashier_name || shift.cashier_email,
      date: shift.start_time ? format(new Date(shift.start_time), 'MMMM d, yyyy') : format(new Date(), 'MMMM d, yyyy'),
      startTime: shift.start_time ? format(new Date(shift.start_time), 'h:mm a') : '-',
      endTime: shift.end_time ? format(new Date(shift.end_time), 'h:mm a') : format(new Date(), 'h:mm a'),
      durationMins,
      revenue,
      cost,
      profit,
      margin,
      avgTransaction,
      totalTransactions: shift.total_transactions || 0,
      cashSales: shift.total_cash_sales || 0,
      cardSales: shift.total_card_sales || 0,
      electronicSales: shift.total_electronic_sales || 0,
      expectedCash,
    },
  };
}

/**
 * Generates a PDF report and returns a Blob.
 */
export function generateShiftPDF(reportData, declaredCash = null) {
  const { summary, topProducts, transactions } = reportData;
  const store = loadStoreSettings();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const margin = 18;
  let y = 0;

  // Helper functions
  const colR = (text, x, cy, opts = {}) => {
    doc.text(String(text), x, cy, { align: 'right', ...opts });
  };
  const line = (cy) => {
    doc.setDrawColor(220, 226, 235);
    doc.line(margin, cy, W - margin, cy);
  };
  const sectionHeader = (text, cy) => {
    doc.setFillColor(245, 247, 251);
    doc.roundedRect(margin, cy - 5, W - margin * 2, 9, 1, 1, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(text.toUpperCase(), margin + 3, cy + 0.5);
    return cy + 9;
  };

  // ── HEADER ────────────────────────────────────────────────────────────
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, W, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(store.storeName || '', margin, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Shift End Report', margin, 20);

  doc.setFontSize(7.5);
  doc.setTextColor(186, 209, 255);
  doc.text(
    [store.storeAddress, store.storePhone ? `Tel: ${store.storePhone}` : '', store.storeEmail, store.storeWebsite]
      .filter(Boolean)
      .join('  ·  '),
    margin, 26
  );

  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, margin, 32);
  colR(`Report #${summary.shift?.id?.slice(-6)?.toUpperCase() || 'N/A'}`, W - margin, 32);

  y = 50;

  // ── CASHIER INFO ──────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(summary.cashierName, margin, y);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`${summary.date}  ·  ${summary.startTime} – ${summary.endTime}  ·  Duration: ${summary.durationMins} min`, margin, y + 6);
  y += 16;

  // ── SUMMARY CARDS (2×3 grid) ──────────────────────────────────────────
  const cards = [
    { label: 'Total Revenue', value: `$${summary.revenue.toFixed(2)}`, color: [30, 64, 175] },
    { label: 'Gross Profit', value: `$${summary.profit.toFixed(2)}`, color: [5, 150, 105] },
    { label: 'Profit Margin', value: `${summary.margin.toFixed(1)}%`, color: [5, 150, 105] },
    { label: 'Total Transactions', value: String(summary.totalTransactions), color: [99, 102, 241] },
    { label: 'Avg. Transaction', value: `$${summary.avgTransaction.toFixed(2)}`, color: [99, 102, 241] },
    { label: 'Total COGS', value: `$${summary.cost.toFixed(2)}`, color: [100, 116, 139] },
  ];

  const cardW = (W - margin * 2 - 10) / 3;
  const cardH = 18;
  cards.forEach((card, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = margin + col * (cardW + 5);
    const cy = y + row * (cardH + 4);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(...card.color, 0.3);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(card.label.toUpperCase(), cx + 4, cy + 5.5);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...card.color);
    doc.text(card.value, cx + 4, cy + 13.5);
  });
  y += 2 * (cardH + 4) + 8;

  // ── PAYMENT BREAKDOWN ─────────────────────────────────────────────────
  y = sectionHeader('Payment Method Breakdown', y);
  y += 4;

  const payRows = [
    ['Cash', `$${summary.cashSales.toFixed(2)}`, summary.revenue > 0 ? `${(summary.cashSales / summary.revenue * 100).toFixed(1)}%` : '0%'],
    ['Card / POS', `$${summary.cardSales.toFixed(2)}`, summary.revenue > 0 ? `${(summary.cardSales / summary.revenue * 100).toFixed(1)}%` : '0%'],
    ['Electronic / E-Pay', `$${summary.electronicSales.toFixed(2)}`, summary.revenue > 0 ? `${(summary.electronicSales / summary.revenue * 100).toFixed(1)}%` : '0%'],
  ];

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Method', margin + 2, y);
  colR('Amount', margin + 70, y);
  colR('% of Revenue', margin + 110, y);
  y += 2;
  line(y); y += 4;

  payRows.forEach(([method, amount, pct]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(method, margin + 2, y);
    colR(amount, margin + 70, y);
    colR(pct, margin + 110, y);
    y += 6;
  });

  // ── CASH VARIANCE ─────────────────────────────────────────────────────
  if (declaredCash !== null) {
    y += 2;
    y = sectionHeader('Cash Variance Analysis', y);
    y += 4;

    const variance = declaredCash - summary.expectedCash;
    const varianceLabel = variance === 0 ? 'Balanced ✓' : variance > 0 ? `Over by $${Math.abs(variance).toFixed(2)}` : `Short by $${Math.abs(variance).toFixed(2)}`;
    const varColor = variance === 0 ? [5, 150, 105] : variance > 0 ? [217, 119, 6] : [220, 38, 38];

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);

    const varRows = [
      ['Expected Cash (from system)', `$${summary.expectedCash.toFixed(2)}`],
      ['Declared Cash (counted)', `$${declaredCash.toFixed(2)}`],
    ];
    varRows.forEach(([label, val]) => {
      doc.text(label, margin + 2, y);
      colR(val, margin + 80, y);
      y += 6;
    });
    line(y - 1); y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...varColor);
    doc.text('Variance', margin + 2, y);
    colR(varianceLabel, margin + 80, y);
    y += 8;
  }

  // ── TOP PRODUCTS ──────────────────────────────────────────────────────
  y = sectionHeader('Top Products by Revenue', y);
  y += 4;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Product', margin + 2, y);
  colR('Qty', margin + 68, y);
  colR('Revenue', margin + 95, y);
  colR('COGS', margin + 120, y);
  colR('Profit', margin + 145, y);
  colR('Margin', margin + 170, y);
  y += 2;
  line(y); y += 4;

  topProducts.slice(0, 10).forEach((p, i) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(p.name.length > 28 ? p.name.slice(0, 27) + '…' : p.name, margin + 2, y);
    colR(String(p.qty), margin + 68, y);
    colR(`$${p.revenue.toFixed(2)}`, margin + 95, y);
    colR(`$${p.cost.toFixed(2)}`, margin + 120, y);
    colR(`$${p.profit.toFixed(2)}`, margin + 145, y);
    const mColor = p.margin >= 30 ? [5, 150, 105] : p.margin >= 15 ? [217, 119, 6] : [220, 38, 38];
    doc.setTextColor(...mColor);
    colR(`${p.margin.toFixed(1)}%`, margin + 170, y);
    doc.setTextColor(15, 23, 42);
    y += 6;
  });

  // ── RECENT TRANSACTIONS ───────────────────────────────────────────────
  y += 4;
  if (y > 240) { doc.addPage(); y = 20; }
  y = sectionHeader('Transaction Log', y);
  y += 4;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('TX #', margin + 2, y);
  doc.text('Time', margin + 45, y);
  doc.text('Method', margin + 80, y);
  doc.text('Items', margin + 110, y);
  colR('Total', margin + 155, y);
  y += 2; line(y); y += 4;

  transactions.slice(0, 20).forEach(tx => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text((tx.transaction_number || '').slice(0, 18), margin + 2, y);
    doc.text(tx.created_date ? format(new Date(tx.created_date), 'h:mm a') : '-', margin + 45, y);
    doc.text(tx.payment_method || '-', margin + 80, y);
    doc.text(String(tx.items?.length || 0), margin + 115, y);
    colR(`$${(tx.grand_total || 0).toFixed(2)}`, margin + 155, y);
    y += 5.5;
  });
  if (transactions.length > 20) {
    doc.setTextColor(100, 116, 139);
    doc.text(`… and ${transactions.length - 20} more transactions`, margin + 2, y + 2);
  }

  // ── FOOTER ────────────────────────────────────────────────────────────
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 284, W, 13, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${store.storeName} · ${store.storeAddress} · Tel: ${store.storePhone} · ${store.storeEmail} · ${store.storeWebsite} · Confidential Shift Report`,
      margin, 291
    );
    colR(`Page ${i} of ${pages}`, W - margin, 291);
  }

  return doc;
}
