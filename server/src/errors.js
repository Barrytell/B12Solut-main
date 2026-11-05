// One error shape for the whole API: { error: { code, message, details? } }.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (req, res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });

// Postgres errors that are safe to map to client errors.
const PG = {
  '23505': [409, 'CONFLICT', 'A record with this value already exists'],
  '23503': [409, 'REFERENCE_CONFLICT', 'A related record is missing or still in use'],
  '23514': [409, 'CONSTRAINT_VIOLATION', 'The change violates a data rule'],
  '22P02': [400, 'INVALID_INPUT', 'Invalid value'],
};

export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: { code: 'VALIDATION_FAILED', message: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    });
  }
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } });
  if (err?.code && PG[err.code]) {
    const [status, code, message] = PG[err.code];
    return res.status(status).json({ error: { code, message } });
  }
  // Unknown: log internally, reveal nothing (no stack, SQL or driver text).
  req.log?.error({ err }, 'unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
