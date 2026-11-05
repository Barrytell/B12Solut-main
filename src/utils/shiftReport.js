import { base44 } from '@/api/base44Client';
import { format, differenceInMinutes } from 'date-fns';
import jsPDF from 'jspdf';
import { loadStoreSettings } from './storeSettings';

/**
 * Fetches all transactions for a given shift and computes full report data.
 */
export async function buildShiftReportData(shift) {
  const transactions = await base44.entities.Transaction.filter({ shift_id: shift.id }, '-created_date');

  // Admin users are the recipients. A cashier is not allowed to list users, so
  // fall back to the store's own address instead of failing the whole report.
  let adminEmails = [];
  try {
    const allUsers = await base44.entities.User.list();
    adminEmails = allUsers.filter(u => u.role === 'admin').map(u => u.email);
  } catch {
    adminEmails = [loadStoreSettings().storeEmail].filter(Boolean);
  }

  const durationMins = shift.end_time && shift.start_time
    ? differenceInMinutes(new Date(shift.end_time), new Date(shift.start_time))
    : 0;

  // Per-product sales breakdown
  const productMap = {};
  transactions.forEach(tx => {
    tx.items?.forEach(item => {
      if (!productMap[item.product_name]) {
        productMap[item.product_name] = { name: item.product_name, sku: item.sku, qty: 0, revenue: 0, cost: 0 };
      }
      productMap[item.product_name].qty += item.quantity || 0;
      productMap[item.product_name].revenue += item.line_total || 0;
      productMap[item.product_name].cost += (item.cost_price || 0) * (item.quantity || 0);
    });
  });
  const topProducts = Object.values(productMap)
    .map(p => ({ ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // Hourly breakdown
  const hourlyMap = {};
  transactions.forEach(tx => {
    const hour = tx.created_date ? format(new Date(tx.created_date), 'h a') : 'Unknown';
    if (!hourlyMap[hour]) hourlyMap[hour] = { hour, revenue: 0, txCount: 0 };
    hourlyMap[hour].revenue += tx.grand_total || 0;
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
    adminEmails,
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

/**
 * Generates the PDF, uploads it, and sends admin email.
 * Returns { pdfUrl }
 */
export async function generateAndSendReport(reportData, declaredCash) {
  const { summary, adminEmails } = reportData;
  const store = loadStoreSettings();

  // 1. Generate PDF
  const doc = generateShiftPDF(reportData, declaredCash);
  const pdfBlob = doc.output('blob');
  const pdfFile = new File([pdfBlob], `shift-report-${summary.shift?.id}.pdf`, { type: 'application/pdf' });

  // 2. Upload PDF
  const { file_url: pdfUrl } = await base44.integrations.Core.UploadPublicFile({ file: pdfFile });

  // 3. Send email to each admin
  const variance = declaredCash !== null ? (declaredCash - summary.expectedCash) : null;
  const varianceText = variance === null ? 'N/A' : variance === 0 ? 'Balanced ✓' : variance > 0 ? `+$${Math.abs(variance).toFixed(2)} over` : `-$${Math.abs(variance).toFixed(2)} short`;

  const emailBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:32px 40px;">
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${store.storeName || ''}</div>
        <div style="font-size:12px;color:#bfdbfe;margin-top:4px;">${[store.storeAddress, store.storePhone ? `Tel: ${store.storePhone}` : '', store.storeEmail, store.storeWebsite].filter(Boolean).join(' · ')}</div>
        <div style="font-size:13px;color:#bfdbfe;margin-top:6px;">Shift End Report</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#0f172a;">Shift Closed: ${summary.cashierName}</p>
        <p style="margin:0 0 24px;font-size:13px;color:#64748b;">${summary.date} · ${summary.startTime} – ${summary.endTime} (${summary.durationMins} min)</p>

        <!-- Stats grid -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="50%" style="padding:0 8px 12px 0;">
              <div style="background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #e2e8f0;">
                <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Total Revenue</div>
                <div style="font-size:22px;font-weight:800;color:#1e40af;">$${summary.revenue.toFixed(2)}</div>
              </div>
            </td>
            <td width="50%" style="padding:0 0 12px 8px;">
              <div style="background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #e2e8f0;">
                <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Gross Profit</div>
                <div style="font-size:22px;font-weight:800;color:#059669;">$${summary.profit.toFixed(2)} <span style="font-size:13px;color:#94a3b8;">(${summary.margin.toFixed(1)}%)</span></div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 8px 0 0;">
              <div style="background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #e2e8f0;">
                <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Transactions</div>
                <div style="font-size:22px;font-weight:800;color:#6366f1;">${summary.totalTransactions}</div>
              </div>
            </td>
            <td style="padding:0 0 0 8px;">
              <div style="background:${variance !== null && variance !== 0 ? (variance < 0 ? '#fef2f2' : '#fffbeb') : '#f0fdf4'};border-radius:12px;padding:16px;border:1px solid ${variance !== null && variance !== 0 ? (variance < 0 ? '#fecaca' : '#fde68a') : '#bbf7d0'};">
                <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Cash Variance</div>
                <div style="font-size:18px;font-weight:800;color:${variance !== null && variance !== 0 ? (variance < 0 ? '#dc2626' : '#d97706') : '#059669'};">${varianceText}</div>
              </div>
            </td>
          </tr>
        </table>

        <!-- Payment breakdown -->
        <div style="margin-bottom:24px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Payment Breakdown</div>
          <table width="100%" style="border-collapse:collapse;">
            <tr style="background:#f8fafc;">
              <td style="padding:8px 12px;font-size:12px;color:#64748b;border-radius:6px 0 0 6px;">Cash</td>
              <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">$${summary.cashSales.toFixed(2)}</td>
              <td style="padding:8px 12px;font-size:11px;color:#94a3b8;text-align:right;border-radius:0 6px 6px 0;">${summary.revenue > 0 ? (summary.cashSales / summary.revenue * 100).toFixed(1) : 0}%</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;font-size:12px;color:#64748b;">Card / POS</td>
              <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">$${summary.cardSales.toFixed(2)}</td>
              <td style="padding:8px 12px;font-size:11px;color:#94a3b8;text-align:right;">${summary.revenue > 0 ? (summary.cardSales / summary.revenue * 100).toFixed(1) : 0}%</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:8px 12px;font-size:12px;color:#64748b;border-radius:6px 0 0 6px;">Electronic / E-Pay</td>
              <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">$${summary.electronicSales.toFixed(2)}</td>
              <td style="padding:8px 12px;font-size:11px;color:#94a3b8;text-align:right;border-radius:0 6px 6px 0;">${summary.revenue > 0 ? (summary.electronicSales / summary.revenue * 100).toFixed(1) : 0}%</td>
            </tr>
          </table>
        </div>

        <!-- PDF link -->
        <div style="background:#eff6ff;border-radius:12px;padding:16px 20px;border:1px solid #bfdbfe;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1e40af;">📎 Full PDF Report Attached</p>
          <p style="margin:0 0 12px;font-size:12px;color:#3b82f6;">The complete shift report including transaction log and product breakdown is available below.</p>
          <a href="${pdfUrl}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:12px;font-weight:600;">Download PDF Report →</a>
        </div>

        <p style="margin:0;font-size:12px;color:#94a3b8;">This report was automatically generated by ${store.storeName || ''} when ${summary.cashierName} closed their shift.</p>
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">${store.storeName || ''} · ${store.storeAddress} · Tel: ${store.storePhone} · ${store.storeEmail} · ${store.storeWebsite}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-align:center;">Automated Shift Report · ${summary.date}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
  `.trim();

  // Send to all admins
  await Promise.all(
    adminEmails.map(email =>
      base44.integrations.Core.SendEmail({
        to: email,
        subject: `Shift Report — ${summary.cashierName} · ${summary.date}`,
        body: emailBody,
        from_name: `${store.storeName} Reports`,
      })
    )
  );

  return { pdfUrl };
}