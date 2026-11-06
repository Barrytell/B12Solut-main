// Replaces the Base44 SDK client with the same `entities.X.list/filter/get/
// create/update/delete` shape, backed by the Express API (VITE_API_URL).
// Errors throw an Error carrying `message`, `status`, `code` and `details`,
// so existing `err.message` toasts keep working.
import { supabase } from '@/lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

async function request(method, path, { body, raw, contentType } = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = {};
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  if (raw) headers['Content-Type'] = contentType || 'application/octet-stream';
  else if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError(0, { error: { code: 'NETWORK', message: 'Cannot reach the server. Check your connection.' } });
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

function toQuery(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

function entity(name) {
  const base = `/api/entities/${name}`;
  return {
    list: (sort, limit) => request('GET', base + toQuery({ sort, limit })),
    filter: (query = {}, sort, limit) => request('GET', base + toQuery({ ...query, sort, limit })),
    get: (id) => request('GET', `${base}/${encodeURIComponent(id)}`),
    create: (data) => request('POST', base, { body: data }),
    update: (id, data) => request('PATCH', `${base}/${encodeURIComponent(id)}`, { body: data }),
    delete: (id) => request('DELETE', `${base}/${encodeURIComponent(id)}`),
  };
}

const id = (v) => encodeURIComponent(v);

export const api = {
  entities: Object.fromEntries(
    ['User', 'Category', 'Supplier', 'Product', 'Transaction', 'Return', 'Shift', 'StockAdjustment'].map((n) => [n, entity(n)]),
  ),
  auth: { me: () => request('GET', '/api/auth/me') },
  sales: { create: (body) => request('POST', '/api/sales', { body }) },
  returns: { create: (body) => request('POST', '/api/returns', { body }) },
  inventory: {
    update: (body) => request('POST', '/api/inventory/update', { body }),
    bulkStock: (body) => request('POST', '/api/inventory/bulk-stock', { body }),
  },
  shifts: {
    start: () => request('POST', '/api/shifts/start', { body: {} }),
    close: (shiftId, body) => request('POST', `/api/shifts/${id(shiftId)}/close`, { body }),
    report: (shiftId, body) => request('POST', `/api/shifts/${id(shiftId)}/report`, { body }),
    reportUrl: (shiftId) => request('GET', `/api/shifts/${id(shiftId)}/report-url`),
  },
  users: {
    invite: (body) => request('POST', '/api/users/invite', { body }),
    resendInvite: (userId) => request('POST', `/api/users/${id(userId)}/resend-invite`, { body: {} }),
  },
  uploads: {
    productImage: (file) => request('POST', '/api/uploads/product-image', { raw: file, contentType: file.type }),
  },
  advisor: {
    status: () => request('GET', '/api/restock-advisor/status'),
    chat: (messages) => request('POST', '/api/restock-advisor/chat', { body: { messages } }),
  },
};

/** Opens a shift's official PDF through a fresh 10-minute signed link. */
export async function openShiftReport(shiftId) {
  const win = window.open('', '_blank'); // opened synchronously so popup blockers allow it
  try {
    const { url } = await api.shifts.reportUrl(shiftId);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}
