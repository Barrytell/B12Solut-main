import { Router } from 'express';
import { ApiError } from '../errors.js';
import { DEDICATED } from '../entities.js';
import { withTransaction } from '../db.js';
import { serializeOne, serializeResult } from '../lib/serialize.js';
import { applyStockChange, lockProducts } from '../services/stock.js';
import { toMilli } from '../lib/money.js';

const PLATFORM_KEYS = ['id', 'created_date', 'updated_date', 'created_by_id'];

function stripPlatform(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_BODY', 'Expected a JSON object');
  const copy = { ...body };
  for (const k of PLATFORM_KEYS) delete copy[k];
  return copy;
}

/** Builds WHERE / ORDER BY / LIMIT from the whitelisted query string. */
export function buildListQuery(entity, query, user) {
  const where = [];
  const params = [];
  const add = (column, value) => { params.push(value); where.push(`${column} = $${params.length}`); };

  let sort = 'created_date';
  let dir = 'DESC';
  let limit = entity.defaultLimit;
  let skip = 0;

  for (const [key, raw] of Object.entries(query)) {
    if (Array.isArray(raw)) throw new ApiError(400, 'INVALID_QUERY', `Repeated parameter: ${key}`);
    if (key === 'sort') {
      const field = raw.startsWith('-') ? raw.slice(1) : raw;
      if (!entity.sorts.includes(field)) throw new ApiError(400, 'INVALID_QUERY', `Cannot sort by ${field}`);
      sort = field;
      dir = raw.startsWith('-') ? 'DESC' : 'ASC';
    } else if (key === 'limit' || key === 'skip') {
      if (!/^\d{1,6}$/.test(raw)) throw new ApiError(400, 'INVALID_QUERY', `${key} must be a non-negative integer`);
      if (key === 'limit') limit = Math.min(Number(raw), entity.maxLimit);
      else skip = Number(raw);
    } else if (entity.filters[key]) {
      if (entity.filters[key] === 'bool') {
        if (raw !== 'true' && raw !== 'false') throw new ApiError(400, 'INVALID_QUERY', `${key} must be true or false`);
        add(key, raw === 'true');
      } else {
        add(key, String(raw).slice(0, 500));
      }
    } else {
      throw new ApiError(400, 'INVALID_QUERY', `Unknown parameter: ${key}`);
    }
  }

  const scope = entity.scope(user);
  if (scope) add(scope.column, scope.value);

  params.push(limit, skip);
  const sql = `SELECT * FROM public.${entity.table}`
    + (where.length ? ` WHERE ${where.join(' AND ')}` : '')
    + ` ORDER BY ${sort} ${dir}, id ${dir} LIMIT $${params.length - 1} OFFSET $${params.length}`;
  return { sql, params };
}

/** Rebuilds the original `items: [...]` array for transactions and returns. */
async function attachItems(db, entity, records) {
  if (!entity.items || records.length === 0) return records;
  const result = await db.query(
    `SELECT * FROM public.${entity.items} WHERE ${entity.itemsKey} = ANY($1::text[]) ORDER BY ${entity.itemsKey}, line_no`,
    [records.map((r) => r.id)],
  );
  const byParent = new Map();
  for (const item of serializeResult(result)) {
    const parent = item[entity.itemsKey];
    delete item[entity.itemsKey];
    delete item.line_no;
    delete item.id;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(item);
  }
  return records.map((r) => ({ ...r, items: byParent.get(r.id) ?? [] }));
}

export function entityRouter({ db, entities }) {
  const router = Router();

  const resolve = (req) => {
    const entity = entities[req.params.entity];
    if (!entity) throw new ApiError(404, 'NOT_FOUND', 'Unknown entity');
    if (entity.adminOnlyRead && req.user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Administrator access required');
    return entity;
  };

  const writable = (req, op) => {
    const entity = resolve(req);
    if (req.user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Administrator access required');
    const schema = entity.writes[op];
    if (!schema) {
      const where = DEDICATED[req.params.entity];
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', where ? `Use ${where}` : 'This operation is not available');
    }
    return { entity, schema };
  };

  router.get('/:entity', async (req, res, next) => {
    try {
      const entity = resolve(req);
      const { sql, params } = buildListQuery(entity, req.query, req.user);
      const records = serializeResult(await db.query(sql, params));
      res.json(await attachItems(db, entity, records));
    } catch (e) { next(e); }
  });

  router.get('/:entity/:id', async (req, res, next) => {
    try {
      const entity = resolve(req);
      const scope = entity.scope(req.user);
      const params = [req.params.id];
      let sql = `SELECT * FROM public.${entity.table} WHERE id = $1`;
      if (scope) { params.push(scope.value); sql += ` AND ${scope.column} = $2`; }
      const record = serializeOne(await db.query(sql, params));
      if (!record) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
      res.json((await attachItems(db, entity, [record]))[0]);
    } catch (e) { next(e); }
  });

  router.post('/:entity', async (req, res, next) => {
    try {
      const { entity, schema } = writable(req, 'create');
      const data = schema.parse(stripPlatform(req.body));
      const created = await withTransaction(db, async (client) => {
        if (req.params.entity === 'Product') await assertCategoryExists(client, data.category);
        const stock = data.stock_quantity;
        if (req.params.entity === 'Product') delete data.stock_quantity; // set through the audited path below
        const cols = Object.keys(data).filter((k) => data[k] !== undefined);
        const values = cols.map((k) => data[k]);
        cols.push('created_by_id');
        values.push(req.user.id);
        const result = await client.query(
          `INSERT INTO public.${entity.table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
          values,
        );
        const row = result.rows[0];
        if (req.params.entity === 'Product' && stock !== undefined && toMilli(stock) > 0n) {
          await applyStockChange(client, row, stock, { reason: 'Initial stock (product created)', user: req.user });
          return serializeOne(await client.query('SELECT * FROM public.products WHERE id = $1', [row.id]));
        }
        return serializeOne(result);
      });
      res.status(201).json(created);
    } catch (e) { next(e); }
  });

  router.patch('/:entity/:id', async (req, res, next) => {
    try {
      const { entity, schema } = writable(req, 'update');
      const data = schema.parse(stripPlatform(req.body));
      const name = req.params.entity;

      if (name === 'User' && req.params.id === req.user.id && data.role && data.role !== 'admin') {
        throw new ApiError(409, 'CANNOT_DEMOTE_SELF', 'You cannot remove your own administrator role');
      }

      const updated = await withTransaction(db, async (client) => {
        let current;
        if (name === 'Product') {
          current = (await lockProducts(client, [req.params.id])).get(req.params.id);
          if (!current) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
          if (data.category !== undefined) await assertCategoryExists(client, data.category);
        }
        const stock = name === 'Product' ? data.stock_quantity : undefined;
        if (name === 'Product') delete data.stock_quantity;

        const cols = Object.keys(data).filter((k) => data[k] !== undefined);
        let result;
        if (cols.length) {
          result = await client.query(
            `UPDATE public.${entity.table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
            [req.params.id, ...cols.map((c) => data[c])],
          );
          if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
        }
        if (stock !== undefined) {
          await applyStockChange(client, { ...current, ...(result?.rows[0] ?? {}) }, stock, {
            reason: 'Stock edited in product form',
            user: req.user,
          });
        }
        result = await client.query(`SELECT * FROM public.${entity.table} WHERE id = $1`, [req.params.id]);
        if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
        return serializeOne(result);
      });
      res.json(updated);
    } catch (e) { next(e); }
  });

  router.delete('/:entity/:id', async (req, res, next) => {
    try {
      const { entity } = writable(req, 'delete');
      await withTransaction(db, async (client) => {
        if (req.params.entity === 'Category') {
          const cat = await client.query('SELECT name FROM public.categories WHERE id = $1 FOR UPDATE', [req.params.id]);
          if (!cat.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
          const used = await client.query('SELECT count(*)::int AS n FROM public.products WHERE category = $1', [cat.rows[0].name]);
          if (used.rows[0].n > 0) throw new ApiError(409, 'CATEGORY_IN_USE', `This category is used by ${used.rows[0].n} product(s)`);
        }
        const result = await client.query(`DELETE FROM public.${entity.table} WHERE id = $1`, [req.params.id]);
        if (result.rowCount === 0) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
      });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}

async function assertCategoryExists(client, category) {
  if (category == null) return;
  const { rowCount } = await client.query('SELECT 1 FROM public.categories WHERE name = $1', [category]);
  if (!rowCount) throw new ApiError(400, 'UNKNOWN_CATEGORY', `Category "${category}" does not exist`);
}
