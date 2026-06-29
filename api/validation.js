// Vercel serverless function — secure Metabase proxy
// GET /api/validation?facility=Well+Living+Medical+Clinic
// GET /api/validation?facility=...&debug=true

const METABASE_URL   = process.env.METABASE_URL
const METABASE_EMAIL = process.env.METABASE_EMAIL
const METABASE_PASS  = process.env.METABASE_PASSWORD

const QID_INVENTORY    = 2501  // Pharmacy Inventory  → HMIS stock
const QID_DEMAND       = 2689  // Demand Planning     → ABC class, total demand
const QID_SALES        = 2799  // Sales since restock → sales qty, last restock date
const QID_MISSED_SALES = 2692  // Missed sales (last 30 days) → missed events per SKU
const QID_CLASS_D      = 3203  // Class D (non-moving) stock  → available qty per batch

// ── Auth ──────────────────────────────────────────────────────────────────────
async function getToken() {
  const r = await fetch(`${METABASE_URL}/api/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: METABASE_EMAIL, password: METABASE_PASS }),
  })
  if (!r.ok) throw new Error(`Metabase auth failed: ${r.status}`)
  return (await r.json()).id
}

// ── Get database ID (one call, shared by all questions) ───────────────────────
async function getDbId(cardId, token) {
  const r = await fetch(`${METABASE_URL}/api/card/${cardId}`, {
    headers: { 'X-Metabase-Session': token },
  })
  if (!r.ok) throw new Error(`Card ${cardId} meta failed: ${r.status}`)
  return (await r.json()).database_id
}

// ── Facility-filtered dataset query (inventory, sales, missed sales, class D) ─
async function runFiltered(cardId, dbId, token, facilityName) {
  const r = await fetch(`${METABASE_URL}/api/dataset`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
    body: JSON.stringify({
      database: dbId, type: 'query',
      query: {
        'source-table': `card__${cardId}`,
        filter: ['=', ['field', 'organization_name', { 'base-type': 'type/Text' }], facilityName],
        limit: 10000,
      },
      constraints: { 'max-results': 10000, 'max-results-bare-rows': 10000 },
    }),
  })
  if (!r.ok) throw new Error(`Dataset card__${cardId} failed: ${r.status}`)
  return r.json()
}

// ── Demand planning — also filters total_demand > 0 to stay under row limits ──
// Q2689 returns ALL ~5,400 SKUs per facility (including 0-demand rows), which
// hits the 2,000-row API cap. Filtering to sum_3 > 0 shrinks this to ~300–500.
// Missing products get 0-default treatment in calculateMaxQty.
async function runDemandFiltered(cardId, dbId, token, facilityName) {
  const r = await fetch(`${METABASE_URL}/api/dataset`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
    body: JSON.stringify({
      database: dbId, type: 'query',
      query: {
        'source-table': `card__${cardId}`,
        filter: ['and',
          ['=', ['field', 'organization_name', { 'base-type': 'type/Text' }], facilityName],
          ['>', ['field', 'sum_3',             { 'base-type': 'type/Float' }], 0],
        ],
        limit: 10000,
      },
      constraints: { 'max-results': 10000, 'max-results-bare-rows': 10000 },
    }),
  })
  if (!r.ok) throw new Error(`Demand dataset card__${cardId} failed: ${r.status}`)
  return r.json()
}

// ── Simple raw question fetch (no filter) ────────────────────────────────────
// Used for questions that are global (no facility dimension) or small enough
// to fetch entirely and filter client-side.
async function runRaw(cardId, token) {
  const r = await fetch(`${METABASE_URL}/api/card/${cardId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
    body: JSON.stringify({}),
  })
  if (!r.ok) throw new Error(`Card ${cardId} raw query failed: ${r.status}`)
  return r.json()
}

// ── Row converter: Metabase cols/rows → array of objects ─────────────────────
// Stores each value under BOTH field name and display name so pick() is robust.
function toRows(json) {
  const cols = json.data?.cols || []
  const rows = json.data?.rows || []
  return rows.map(row => {
    const obj = {}
    cols.forEach((col, i) => {
      const val = row[i]
      if (col.name)         obj[col.name]        = val
      if (col.display_name) obj[col.display_name] = val
      const norm = (col.name || col.display_name || '').toLowerCase().replace(/[\s_()+]+/g, '')
      if (norm) obj[`__norm__${norm}`] = val
    })
    return obj
  })
}

// ── Flexible column lookup ────────────────────────────────────────────────────
function pick(obj, ...candidates) {
  for (const key of candidates) {
    if (key in obj && obj[key] !== undefined) return obj[key]
    const norm = `__norm__${key.toLowerCase().replace(/[\s_()+]+/g, '')}`
    if (norm in obj && obj[norm] !== undefined) return obj[norm]
  }
  return null
}

// ── Date parsing ──────────────────────────────────────────────────────────────
function parseDate(val) {
  if (!val && val !== 0) return null
  if (typeof val === 'number') return new Date((val - 25569) * 86400000)
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'GET only' })

  const { facility, debug } = req.query
  if (!facility) return res.status(400).json({ error: 'facility param required' })
  if (!METABASE_URL || !METABASE_EMAIL || !METABASE_PASS)
    return res.status(503).json({ error: 'Metabase credentials not configured in Vercel environment variables.' })

  try {
    const token = await getToken()
    const dbId  = await getDbId(QID_INVENTORY, token)

    // Fetch all 5 questions in parallel (3 existing + missed sales + class D)
    const [rawInv, rawDemand, rawSales, rawMissed, rawClassD] = await Promise.all([
      runFiltered(QID_INVENTORY,    dbId, token, facility),
      runDemandFiltered(QID_DEMAND, dbId, token, facility),
      runFiltered(QID_SALES,        dbId, token, facility),
      runRaw(QID_MISSED_SALES, token),  // small table, filter client-side (Pharmacy Name col)
      runRaw(QID_CLASS_D,      token),  // global warehouse table, no facility col
    ])

    // ── Debug mode ────────────────────────────────────────────────────────────
    if (debug === 'true') {
      const toDebug = (raw) => ({
        cols:       (raw.data?.cols || []).map(c => ({ name: c.name, display_name: c.display_name })),
        sample:     toRows(raw).slice(0, 3),
        total_rows: toRows(raw).length,
      })
      return res.json({
        note: `Debug for facility: ${facility}`,
        inventory:    toDebug(rawInv),
        demand:       toDebug(rawDemand),
        sales:        toDebug(rawSales),
        missed_sales: toDebug(rawMissed),
        class_d:      toDebug(rawClassD),
      })
    }

    const inventory  = toRows(rawInv)
    const demand     = toRows(rawDemand)
    const sales      = toRows(rawSales)
    const missed     = toRows(rawMissed)
    const classD     = toRows(rawClassD)

    // ── Per-SKU maps ──────────────────────────────────────────────────────────
    const invMap    = {}
    const demandMap = {}
    const salesMap  = {}
    const missedMap = {}
    const classDMap = {}

    for (const row of inventory) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (sku && (org === facility || org === null)) {
        const qty = pick(row, 'sum', 'Sum of supply_quantity', 'supply_pack_quantity', 'stock_available', 'quantity')
        invMap[sku] = (qty !== null && qty !== undefined) ? parseFloat(qty) : 0
      }
    }

    for (const row of demand) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (sku && (org === facility || org === null)) {
        const abc   = pick(row, 'ABC_category', 'ABC Category', 'abc_category', 'Class')
        const total = pick(row, 'Sum of total_demand', 'sum_3', 'total_demand')
        const l90   = pick(row, 'sum', 'Sum of L90Day_monthly_demand', 'l90day_monthly_demand')
        demandMap[sku] = {
          abcClass:     abc   !== null ? String(abc)       : null,
          totalDemand:  total !== null ? parseFloat(total) : 0,
          l90DayDemand: l90   !== null ? parseFloat(l90)   : null,
        }
      }
    }

    for (const row of sales) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (sku && (org === facility || org === null)) {
        const restockRaw = pick(row, 'last_movement_date', 'last restock date', 'last_restock_date')
        const restockDate = parseDate(restockRaw)
        const daysSince   = restockDate
          ? Math.max(1, Math.floor((new Date() - restockDate) / 86400000))
          : 30
        const salesQty = pick(row, 'Sales since last restock date', 'sales_since_last_restock', 'sales')
        salesMap[sku] = {
          salesSinceRestock: salesQty !== null ? parseFloat(salesQty) || 0 : 0,
          daysSinceRestock:  daysSince,
        }
      }
    }

    // Missed sales (Q2692): each row = one missed sales event.
    // Facility column: "Pharmacy Name" (not organization_name).
    // Exclude Reason = "Price" (price objections are not stock-related missed sales).
    // Skip rows where SKU is "#N/A" (products not yet in the catalogue).
    for (const row of missed) {
      const facilityName = pick(row, 'Pharmacy Name', 'pharmacy_name', 'Pharmacy_Name', 'organization_name')
      const sku          = pick(row, 'Sku', 'sku', 'SKU')
      const reason       = pick(row, 'Reason', 'reason')
      if (
        facilityName === facility &&
        sku && sku !== '#N/A' && sku.trim() !== '' &&
        reason !== 'Price'
      ) {
        missedMap[sku] = (missedMap[sku] || 0) + 1
      }
    }

    // Class D stock (Q3203): global central warehouse — no facility column.
    // SKU is "product_code". Sum "available_quantity" across batches per SKU.
    for (const row of classD) {
      const sku = pick(row, 'product_code', 'Universal Skus - product_code → Sku', 'sku', 'SKU')
      if (sku && sku.trim()) {
        const qty = pick(row, 'available_quantity', 'Available Quantity', 'quantity', 'qty')
        classDMap[sku] = (classDMap[sku] || 0) + (qty !== null ? parseFloat(qty) || 0 : 0)
      }
    }

    // ── Merge into per-SKU result ─────────────────────────────────────────────
    const allSkus = new Set([
      ...Object.keys(invMap), ...Object.keys(demandMap), ...Object.keys(salesMap),
      ...Object.keys(missedMap), ...Object.keys(classDMap),
    ])

    const items = {}
    for (const sku of allSkus) {
      items[sku] = {
        hmisStock:           sku in invMap ? invMap[sku] : null,
        abcClass:            demandMap[sku]?.abcClass     ?? null,
        demandPlanningTotal: demandMap[sku]?.totalDemand  ?? 0,
        l90DayDemand:        demandMap[sku]?.l90DayDemand ?? null,
        salesSinceRestock:   salesMap[sku]?.salesSinceRestock ?? 0,
        daysSinceRestock:    salesMap[sku]?.daysSinceRestock  ?? 30,
        missedSalesL30D:     missedMap[sku]  ?? 0,
        classDStock:         classDMap[sku]  ?? 0,
      }
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
    return res.json({ facility, items, sku_count: allSkus.size })

  } catch (err) {
    console.error('[validation]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
