// Vercel serverless function — secure Metabase proxy
// GET /api/validation?facility=Well+Living+Medical+Clinic
// GET /api/validation?facility=...&debug=true

const METABASE_URL   = process.env.METABASE_URL
const METABASE_EMAIL = process.env.METABASE_EMAIL
const METABASE_PASS  = process.env.METABASE_PASSWORD

const QID_INVENTORY = 2501  // Pharmacy Inventory  → HMIS stock
const QID_DEMAND    = 2689  // Demand Planning     → ABC class, total demand  ← hits 10k row limit
const QID_SALES     = 2799  // Sales since restock → sales qty, last restock date

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

// Standard saved-question query — works for Q2501 and Q2799 (both under 10k rows)
async function runQuestionRaw(cardId, token) {
  const r = await fetch(`${METABASE_URL}/api/card/${cardId}/query`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
    body:    JSON.stringify({}),
  })
  if (!r.ok) throw new Error(`Card ${cardId} failed: ${r.status}`)
  return r.json()
}

// Q2689 (demand planning) has ~1,600 SKUs × 6 facilities = ~10,000+ rows
// which Metabase hard-caps at exactly 10,000 — cutting off Well Living's data.
// Fix: use /api/dataset with source-table: card__2689 + an org_name filter.
// This applies the filter BEFORE the row cap, returning only ~1,600 rows.
async function runQuestionFiltered(cardId, token, facilityName) {
  // Step 1: get the database ID from the card's metadata
  const metaResp = await fetch(`${METABASE_URL}/api/card/${cardId}`, {
    headers: { 'X-Metabase-Session': token },
  })
  if (!metaResp.ok) throw new Error(`Card ${cardId} meta failed: ${metaResp.status}`)
  const { database_id: dbId } = await metaResp.json()

  // Step 2: run ad-hoc query using the saved card as a nested source with a filter
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
      },
    }),
  })
  if (!r.ok) throw new Error(`Dataset card__${cardId} failed: ${r.status}`)
  return r.json()
}

// Convert Metabase cols/rows → array of objects.
// Stores each value under BOTH field name (c.name) AND display name (c.display_name)
// so pick() always finds columns regardless of which format Metabase uses.
function toRows(json) {
  const cols = json.data?.cols || []
  const rows = json.data?.rows || []
  return rows.map(row => {
    const obj = {}
    cols.forEach((col, i) => {
      const val = row[i]
      if (col.name)         obj[col.name]         = val
      if (col.display_name) obj[col.display_name]  = val
      const norm = (col.name || col.display_name || '')
        .toLowerCase().replace(/[\s_()+]+/g, '')
      if (norm) obj[`__norm__${norm}`] = val
    })
    return obj
  })
}

// Flexible value lookup: exact match → normalised fallback
function pick(obj, ...candidates) {
  for (const key of candidates) {
    if (key in obj && obj[key] !== undefined) return obj[key]
    const norm = `__norm__${key.toLowerCase().replace(/[\s_()+]+/g, '')}`
    if (norm in obj && obj[norm] !== undefined) return obj[norm]
  }
  return null
}

// Handle ISO date strings and Excel serial numbers
function parseDate(val) {
  if (!val && val !== 0) return null
  if (typeof val === 'number') return new Date((val - 25569) * 86400000)
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

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
    const token = await getToken()

    // Inventory and Sales are under 10k rows → normal card query
    // Demand hits the 10k limit → filtered /api/dataset query
    const [rawInv, rawSales, rawDemand] = await Promise.all([
      runQuestionRaw(QID_INVENTORY, token),
      runQuestionRaw(QID_SALES,     token),
      runQuestionFiltered(QID_DEMAND, token, facility),
    ])

    // Debug mode — shows raw column + filtered row data for the facility
    if (debug === 'true') {
      const inventory = toRows(rawInv)
      const demand    = toRows(rawDemand)
      const sales     = toRows(rawSales)

      const facInv    = inventory.filter(r => pick(r, 'organization_name') === facility).slice(0, 5)
      const facDemand = demand.filter(r =>   pick(r, 'organization_name') === facility).slice(0, 5)
      const facSales  = sales.filter(r =>    pick(r, 'organization_name') === facility).slice(0, 5)

      return res.json({
        note: `Debug for facility: ${facility}`,
        inventory: {
          cols: (rawInv.data?.cols || []).map(c => ({ name: c.name, display_name: c.display_name })),
          facility_rows: facInv,
          total_rows: (rawInv.data?.rows || []).length,
          facility_count: inventory.filter(r => pick(r, 'organization_name') === facility).length,
        },
        demand: {
          cols: (rawDemand.data?.cols || []).map(c => ({ name: c.name, display_name: c.display_name })),
          facility_rows: facDemand,
          total_rows: (rawDemand.data?.rows || []).length,
          facility_count: demand.filter(r => pick(r, 'organization_name') === facility).length,
        },
        sales: {
          cols: (rawSales.data?.cols || []).map(c => ({ name: c.name, display_name: c.display_name })),
          facility_rows: facSales,
          total_rows: (rawSales.data?.rows || []).length,
          facility_count: sales.filter(r => pick(r, 'organization_name') === facility).length,
        },
      })
    }

    const inventory = toRows(rawInv)
    const demand    = toRows(rawDemand)
    const sales     = toRows(rawSales)

    // ── Build per-SKU maps ─────────────────────────────────────────────────────

    const invMap    = {}
    const demandMap = {}
    const salesMap  = {}

    for (const row of inventory) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (org === facility && sku) {
        const qty = pick(row,
          'sum',                    // Metabase field name for Sum of supply_quantity
          'Sum of supply_quantity',
          'supply_pack_quantity',
          'stock_available', 'quantity'
        )
        invMap[sku] = (qty !== null && qty !== undefined) ? parseFloat(qty) : 0
      }
    }

    // Demand rows are already pre-filtered to this facility by runQuestionFiltered
    // but we check org anyway for safety
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
          'total_demand', 'sum_of_total_demand', 'Total Demand'
        )
        demandMap[sku] = {
          abcClass:    abc   !== null ? String(abc)       : null,
          totalDemand: total !== null ? parseFloat(total) : 0,
        }
      }
    }

    for (const row of sales) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (org === facility && sku) {
        const restockRaw = pick(row,
          'last_movement_date',   // Metabase field name
          'last restock date',
          'last_restock_date', 'Last Restock Date'
        )
        const restockDate = parseDate(restockRaw)
        const today = new Date()
        const daysSince = restockDate
          ? Math.max(1, Math.floor((today - restockDate) / 86400000))
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

    // ── Merge into per-SKU result ──────────────────────────────────────────────
    const allSkus = new Set([
      ...Object.keys(invMap),
      ...Object.keys(demandMap),
      ...Object.keys(salesMap),
    ])

    const items = {}
    for (const sku of allSkus) {
      items[sku] = {
        hmisStock:           sku in invMap ? invMap[sku] : null,
        abcClass:            demandMap[sku]?.abcClass    ?? null,
        demandPlanningTotal: demandMap[sku]?.totalDemand ?? 0,
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
