// POST /api/uploads/product-image (admin). The browser sends the file as the
// raw request body; the type is decided by its magic bytes, never by the header or name.
import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Returns { mime, ext } for PNG, JPEG, WebP or GIF, otherwise null. SVG is never accepted. */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG' && buf[4] === 0x0d && buf[5] === 0x0a) return { mime: 'image/png', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (/^GIF8[79]a$/.test(buf.toString('latin1', 0, 6))) return { mime: 'image/gif', ext: 'gif' };
  return null;
}

export function uploadsRouter({ storage, config }) {
  const router = Router();

  router.post('/product-image',
    express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
    async (req, res, next) => {
      try {
        const kind = Buffer.isBuffer(req.body) ? sniffImage(req.body) : null;
        if (!kind) throw new ApiError(400, 'UNSUPPORTED_IMAGE', 'Upload a PNG, JPEG, WebP or GIF image');
        const path = `${randomUUID()}.${kind.ext}`;
        await storage.upload(config.storage.productImages, path, req.body, kind.mime);
        res.status(201).json({ file_url: storage.publicUrl(config.storage.productImages, path) });
      } catch (e) { next(e); }
    });

  return router;
}
