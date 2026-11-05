import { base44 } from '@/api/base44Client';
import { loadStoreSettings } from './storeSettings';

/**
 * After a sale, checks which products dropped below threshold and sends alerts.
 * @param {Array} soldItems - cart items from the transaction
 * @param {Array} products - current product list (pre-sale snapshot)
 */
export async function checkAndSendLowStockAlerts(soldItems, products) {
  const alertProducts = [];

  for (const item of soldItems) {
    const product = products.find(p => p.id === item.product_id);
    if (!product) continue;

    const newQty = Math.max(0, (product.stock_quantity || 0) - item.quantity);
    const threshold = product.low_stock_threshold ?? 10;

    // Only alert if it just crossed the threshold this sale (was above, now below/at)
    const wasAbove = (product.stock_quantity || 0) > threshold;
    const nowBelow = newQty <= threshold;

    if (wasAbove && nowBelow) {
      alertProducts.push({ ...product, newQty, threshold });
    }
  }

  if (alertProducts.length === 0) return;

  // Admin emails. Cashiers can't list users, so fall back to the store's own
  // address rather than letting the alert fail.
  let adminEmails = [];
  try {
    const allUsers = await base44.entities.User.list();
    adminEmails = allUsers.filter(u => u.role === 'admin').map(u => u.email);
  } catch {
    adminEmails = [loadStoreSettings().storeEmail].filter(Boolean);
  }
  if (adminEmails.length === 0) return;

  // Build email for each alerted product group
  const productRows = alertProducts.map(p => `
    <tr>
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#0f172a;">${p.name}</td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;">${p.sku}</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#dc2626;text-align:center;">${p.newQty}</td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;text-align:center;">${p.threshold}</td>
    </tr>
  `).join('');

  const appUrl = window.location.origin + '/admin/products';

  const emailBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#dc2626 0%,#f97316 100%);padding:28px 36px;">
        <div style="font-size:20px;font-weight:800;color:#ffffff;">⚠️ RetailHub</div>
        <div style="font-size:13px;color:#fecaca;margin-top:4px;">Low Stock Alert</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:28px 36px;">
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#0f172a;">
          ${alertProducts.length} product${alertProducts.length > 1 ? 's have' : ' has'} dropped below the minimum stock threshold
        </p>
        <p style="margin:0 0 24px;font-size:13px;color:#64748b;">
          Immediate restocking is recommended to avoid stockouts.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:24px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">Product</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.5px;">SKU</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.5px;">Current Stock</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.5px;">Min. Threshold</th>
            </tr>
          </thead>
          <tbody style="border-top:1px solid #e2e8f0;">
            ${productRows}
          </tbody>
        </table>

        <!-- CTA -->
        <div style="text-align:center;margin-bottom:20px;">
          <a href="${appUrl}"
             style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:13px;font-weight:700;letter-spacing:0.2px;">
            🔄 Update Stock Levels →
          </a>
        </div>

        <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
          This alert was triggered automatically when stock fell below the set threshold.
        </p>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:14px 36px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">RetailHub · Automated Inventory Alert</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
  `.trim();

  const subject = alertProducts.length === 1
    ? `⚠️ Low Stock: "${alertProducts[0].name}" — ${alertProducts[0].newQty} units left`
    : `⚠️ Low Stock Alert: ${alertProducts.length} products need restocking`;

  await Promise.all(
    adminEmails.map(email =>
      base44.integrations.Core.SendEmail({
        to: email,
        subject,
        body: emailBody,
        from_name: 'RetailHub Inventory',
      })
    )
  );

  return alertProducts;
}