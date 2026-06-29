// Vercel serverless function — secure Metabase proxy
// GET /api/validation?facility=Well+Living+Medical+Clinic
// GET /api/validation?facility=...&debug=true

const METABASE_URL   = process.env.METABASE_URL
const METABASE_EMAIL = process.env.METABASE_EMAIL
const METABASE_PASS  = process.env.METABASE_PASSWORD

const QID_INVENTORY = 2501  // Pharmacy Inventory  → HMIS stock per facility/SKU
const QID_DEMAND    = 2689  // Demand Planning     → ABC class, total demand
const QID_SALES     = 2799  // Sales since restock → sales qty, last restock date

// ── Auth ──────────────────────────────────────────────────────────────────────
async function getToken() {
  const r = await fetch(`${METABASE_URL}/api/session`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: METABASE_EMAIL, password: METABASE_PASS }),
  })
  if (!r.ok) throw new Error(`Metabase auth failed: ${r.status}`)
  const { id } = await r.json()
  return id
}

// ── Get database ID from any card (one call, reused for all three queries) ────
async function getDbId(cardId, token) {
  const r = await fetch(`${METABASE_URL}/api/card/${cardId}`, {
    headers: { 'X-Metabase-Session': token },
  })
  if (!r.ok) throw new Error(`Card ${cardId} meta failed: ${r.status}`)
  const { database_id } = await r.json()
  return database_id
}

// ── Facility-filtered query ───────────────────────────────────────────────────
// Uses /api/dataset with source-table: card__N + organization_name filter.
// This applies the WHERE clause at database level before any row limit is counted,
// so it returns only ~5,000–7,000 rows per facility regardless of how many
// facilities or SKUs exist — permanently safe for 100 facilities × 7,000 SKUs.
async function runFiltered(cardId, dbId, token, facilityName) {
  const r = await fetch(`${METABASE_URL}/api/dataset`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
    body: JSON.stringify({
      database: dbId,
      type:     'query',
      query: {
        'source-table': `card__${cardId}`,
        filter: [
          '=',
          ['field', 'organization_name', { 'base-type': 'type/Text' }],
          facilityName,
        ],
        limit: 10000,   // generous headroom: 10k per-facility SKUs before revisit
      },
    }),
  })
  if (!r.ok) throw new Error(`Dataset card__${cardId} failed: ${r.status}`)
  return r.json()
}

// ── Convert Metabase cols/rows → array of objects ────────────────────────────
// Stores each value under BOTH the field name (c.name) and display name
// (c.display_name) so pick() finds columns regardless of Metabase version.
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

// ── Date parsing — handles ISO strings and Excel serial numbers ───────────────
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

  if (!METABASE_URL || !METABASE_EMAIL || !METABASE_PASS) {
    return res.status(503).json({ error: 'Metabase credentials not configured in Vercel environment variables.' })
  }

  try {
    // Step 1: authenticate
    const token = await getToken()

    // Step 2: get database ID once — all three questions share the same database
    const dbId = await getDbId(QID_INVENTORY, token)

    // Step 3: run all three filtered queries in parallel
    // Each returns only rows for the requested facility, making this permanently
    // safe regardless of total facilities or SKU count.
    const [rawInv, rawDemand, rawSales] = await Promise.all([
      runFiltered(QID_INVENTORY, dbId, token, facility),
      runFiltered(QID_DEMAND,    dbId, token, facility),
      runFiltered(QID_SALES,     dbId, token, facility),
    ])

    // ── Debug mode ────────────────────────────────────────────────────────────
    if (debug === 'true') {
      const inv    = toRows(rawInv)
      const demand = toRows(rawDemand)
      const sales  = toRows(rawSales)
      return res.json({
        note: `Debug for facility: ${facility}`,
        inventory: {
          cols:           (rawInv.data?.cols    || []).map(c => ({ name: c.name, display_name: c.display_name })),
          facility_rows:  inv.slice(0, 5),
          total_rows:     inv.length,
        },
        demand: {
          cols:           (rawDemand.data?.cols || []).map(c => ({ name: c.name, display_name: c.display_name })),
          facility_rows:  demand.slice(0, 5),
          total_rows:     demand.length,
        },
        sales: {
          cols:           (rawSales.data?.cols  || []).map(c => ({ name: c.name, display_name: c.display_name })),
          facility_rows:  sales.slice(0, 5),
          total_rows:     sales.length,
        },
      })
    }

    const inventory = toRows(rawInv)
    const demand    = toRows(rawDemand)
    const sales     = toRows(rawSales)

    // ── Build per-SKU maps ────────────────────────────────────────────────────
    // Rows are already facility-filtered by the query, but we keep the org check
    // as a safety guard against stray rows.
    const invMap    = {}
    const demandMap = {}
    const salesMap  = {}

    for (const row of inventory) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (sku && (org === facility || org === null)) {
        const qty = pick(row,
          'sum',                   // Metabase field name (aggregated SUM)
          'Sum of supply_quantity',
          'supply_pack_quantity',
          'stock_available', 'quantity'
        )
        invMap[sku] = (qty !== null && qty !== undefined) ? parseFloat(qty) : 0
      }
    }

    for (const row of demand) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (sku && (org === facility || org === null)) {
        const abc = pick(row,
          'ABC_category', 'ABC Category', 'abc_category',
          'ABC class', 'abc_class', 'Class'
        )
        const total = pick(row,
          'Sum of total_demand', 'sum_3',
          'total_demand', 'Total Demand'
        )
        const l90day = pick(row,
          'sum',                          // field name in Q2689 for L90Day aggregation
          'Sum of L90Day_monthly_demand',
          'l90day_monthly_demand'
        )
        demandMap[sku] = {
          abcClass:     abc    !== null ? String(abc)        : null,
          totalDemand:  total  !== null ? parseFloat(total)  : 0,
          l90DayDemand: l90day !== null ? parseFloat(l90day) : null,
        }
      }
    }

    for (const row of sales) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (sku && (org === facility || org === null)) {
        const restockRaw = pick(row,
          'last_movement_date',   // Metabase field name
          'last restock date', 'Last Restock Date', 'last_restock_date'
        )
        const restockDate = parseDate(restockRaw)
        const daysSince   = restockDate
          ? Math.max(1, Math.floor((new Date() - restockDate) / 86400000))
          : 30

        const salesQty = pick(row,
          'Sales since last restock date',
          'sales_since_last_restock', 'sales'
        )
        salesMap[sku] = {
          salesSinceRestock: salesQty !== null ? parseFloat(salesQty) || 0 : 0,
          daysSinceRestock:  daysSince,
        }
      }
    }

    // ── Merge into per-SKU result ─────────────────────────────────────────────
    const allSkus = new Set([
      ...Object.keys(invMap),
      ...Object.keys(demandMap),
      ...Object.keys(salesMap),
    ])

    const items = {}
    for (const sku of allSkus) {
      items[sku] = {
        // null means "not in Q2501" — treated as 0 in calculateMaxQty
        hmisStock:           sku in invMap ? invMap[sku] : null,
        abcClass:            demandMap[sku]?.abcClass     ?? null,
        demandPlanningTotal: demandMap[sku]?.totalDemand  ?? 0,
        l90DayDemand:        demandMap[sku]?.l90DayDemand ?? null,
        salesSinceRestock:   salesMap[sku]?.salesSinceRestock ?? 0,
        daysSinceRestock:    salesMap[sku]?.daysSinceRestock  ?? 30,
      }
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
    return res.json({ facility, items, sku_count: allSkus.size })

  } catch (err) {
    console.error('[validation]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
