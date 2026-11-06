// Shift lifecycle and the official report (design §3.3, corrections C3 and R2).
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../errors.js';
import { withTransaction } from '../db.js';
import { moneyField } from '../lib/fields.js';
import { serializeOne } from '../lib/serialize.js';
import { userName } from '../services/stock.js';
import { adminEmails, } from '../email.js';
import { loadReportData, renderShiftPdf, shiftReportEmail } from '../reports/shiftReport.js';

export const REPORT_URL_TTL_SECONDS = 600; // 10 minutes (requirement R2)

const storeText = z.string().trim().max(200).optional();
const reportSchema = z.strictObject({
  store: z.strictObject({
    storeName: storeText, storeAddress: storeText, storePhone: storeText, storeEmail: storeText, storeWebsite: storeText,
  }).optional(),
});

/** Owner or admin; anyone else gets 404 so shift ids are not confirmed. */
async function visibleShift(db, id, user, { lock = false } = {}) {
  const shift = (await db.query(`SELECT * FROM public.shifts WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id])).rows[0];
  if (!shift || (user.role !== 'admin' && shift.cashier_email !== user.email)) throw new ApiError(404, 'NOT_FOUND', 'Shift not found');
  return shift;
}

export function shiftsRouter({ db, money, storage, sendMail, fmt, config }) {
  const router = Router();
  const closeSchema = z.strictObject({ declared_cash: moneyField(money).optional() });

  router.post('/start', async (req, res, next) => {
    try {
      const result = await db.query(
        `INSERT INTO public.shifts (cashier_email, cashier_name, start_time, status, created_by_id)
         VALUES ($1, $2, now(), 'open', $3) RETURNING *`,
        [req.user.email, userName(req.user), req.user.id],
      ).catch(async (err) => {
        if (err?.code === '23505' && err?.constraint === 'uq_shifts_one_open_per_cashier') {
          const open = serializeOne(await db.query("SELECT * FROM public.shifts WHERE cashier_email = $1 AND status = 'open'", [req.user.email]));
          throw new ApiError(409, 'SHIFT_ALREADY_OPEN', 'You already have an open shift', { shift: open });
        }
        throw err;
      });
      res.status(201).json({ shift: serializeOne(result) });
    } catch (e) { next(e); }
  });

  router.post('/:id/close', async (req, res, next) => {
    try {
      const body = closeSchema.parse(req.body ?? {});
      const shift = await withTransaction(db, async (client) => {
        const current = await visibleShift(client, req.params.id, req.user, { lock: true });
        if (current.status !== 'open') throw new ApiError(409, 'SHIFT_NOT_OPEN', 'This shift is already closed');
        return serializeOne(await client.query(
          "UPDATE public.shifts SET status = 'closed', end_time = now(), declared_cash = $2 WHERE id = $1 RETURNING *",
          [req.params.id, body.declared_cash ?? null],
        ));
      });
      res.json({ shift });
    } catch (e) { next(e); }
  });

  router.post('/:id/report',
    rateLimit({
      windowMs: 60 * 60_000, limit: 5, keyGenerator: (req) => `report:${req.params.id}`,
      handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many report requests for this shift' } }),
    }),
    async (req, res, next) => {
      try {
        const body = reportSchema.parse(req.body ?? {});
        const shift = await visibleShift(db, req.params.id, req.user);
        if (shift.status !== 'closed') throw new ApiError(409, 'SHIFT_NOT_CLOSED', 'Close the shift before generating its report');

        const store = body.store ?? {};
        const data = await loadReportData(db, money, shift.id);
        const pdf = renderShiftPdf(data, store, fmt);
        const path = `${shift.id}/${Date.now()}.pdf`;
        await storage.upload(config.storage.shiftReports, path, pdf, 'application/pdf');
        await db.query('UPDATE public.shifts SET report_path = $2 WHERE id = $1', [shift.id, path]);

        let emailSent = false;
        try {
          const to = await adminEmails(db);
          if (to.length) {
            const { subject, html } = shiftReportEmail(data, store, fmt, config.appUrl);
            await sendMail({ to, subject, html, attachments: [{ filename: `shift-report-${shift.id}.pdf`, content: pdf }] });
            emailSent = true;
          }
        } catch (err) {
          req.log?.error({ err }, 'shift report email failed'); // the stored report is kept either way
        }
        res.status(201).json({ report_path: path, email_sent: emailSent });
      } catch (e) { next(e); }
    });

  router.get('/:id/report-url', async (req, res, next) => {
    try {
      const shift = await visibleShift(db, req.params.id, req.user);
      if (!shift.report_path) throw new ApiError(404, 'NO_REPORT', 'No report has been generated for this shift');
      const url = await storage.signedUrl(config.storage.shiftReports, shift.report_path, REPORT_URL_TTL_SECONDS);
      res.json({ url, expires_in: REPORT_URL_TTL_SECONDS });
    } catch (e) { next(e); }
  });

  return router;
}
