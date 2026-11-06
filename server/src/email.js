// Transactional email through Resend. Recipients always come from the
// database (admins), never from the browser. Every value in a template is escaped.
import { Resend } from 'resend';
import { esc } from './lib/format.js';

export function createMailer({ apiKey, from }) {
  const resend = new Resend(apiKey);
  return async function send({ to, subject, html, attachments }) {
    const results = await Promise.allSettled(to.map((address) =>
      resend.emails.send({ from, to: [address], subject, html, attachments }).then(({ error }) => {
        if (error) throw new Error(`Resend: ${error.name ?? 'error'} ${error.message ?? ''}`.trim());
      })));
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) throw new Error(`${failed.length} of ${to.length} emails failed: ${failed[0].reason.message}`);
  };
}

export async function adminEmails(db) {
  const { rows } = await db.query("SELECT email FROM public.app_users WHERE role = 'admin' ORDER BY email");
  return rows.map((r) => r.email);
}

/** Low-stock alert, same content as utils/stockAlerts.js, escaped. */
export function lowStockEmail(alerts, appUrl) {
  const rows = alerts.map((p) => `
    <tr>
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#0f172a;">${esc(p.name)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;">${esc(p.sku)}</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#dc2626;text-align:center;">${esc(p.newQty)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;text-align:center;">${esc(p.threshold)}</td>
    </tr>`).join('');
  const n = alerts.length;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#dc2626 0%,#f97316 100%);padding:28px 36px;">
    <div style="font-size:20px;font-weight:800;color:#ffffff;">⚠️ RetailHub</div>
    <div style="font-size:13px;color:#fecaca;margin-top:4px;">Low Stock Alert</div>
  </td></tr>
  <tr><td style="padding:28px 36px;">
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#0f172a;">${n} product${n > 1 ? 's have' : ' has'} dropped below the minimum stock threshold</p>
    <p style="margin:0 0 24px;font-size:13px;color:#64748b;">Immediate restocking is recommended to avoid stockouts.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <thead><tr style="background:#f8fafc;">
        <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Product</th>
        <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">SKU</th>
        <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.5px;">Current Stock</th>
        <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.5px;">Min. Threshold</th>
      </tr></thead>
      <tbody style="border-top:1px solid #e2e8f0;">${rows}</tbody>
    </table>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${esc(appUrl)}/admin/products" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:13px;font-weight:700;letter-spacing:0.2px;">🔄 Update Stock Levels →</a>
    </div>
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">This alert was triggered automatically when stock fell below the set threshold.</p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:14px 36px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">RetailHub · Automated Inventory Alert</p>
  </td></tr>
</table></td></tr></table></body></html>`;
  const subject = n === 1
    ? `⚠️ Low Stock: "${alerts[0].name}" — ${alerts[0].newQty} units left`
    : `⚠️ Low Stock Alert: ${n} products need restocking`;
  return { subject, html };
}
