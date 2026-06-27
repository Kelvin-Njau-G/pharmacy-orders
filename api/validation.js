// Vercel serverless function — secure Metabase proxy
// GET /api/validation?facility=Well+Living+Medical+Clinic
// GET /api/validation?facility=...&debug=true   ← shows raw column names

const METABASE_URL   = process.env.METABASE_URL
const METABASE_EMAIL = process.env.METABASE_EMAIL
const METABASE_PASS  = process.env.METABASE_PASSWORD

const QID_INVENTORY = 2501  // Pharmacy Inventory → HMIS stock per facility/SKU
const QID_DEMAND    = 2689  // Demand Planning    → ABC class, total demand
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

// Returns raw Metabase query response (for debug and for dual-key processing)
async function runQuestionRaw(cardId, token) {
  const r = await fetch(`${METABASE_URL}/api/card/${cardId}/query`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
    body: JSON.stringify({
      // Override Metabase's default 10,000-row limit.
      // Demand planning (Q2689) has 6+ facilities × ~1,600 SKUs = ~10,000+ rows
      // which causes Well Living's data to be silently truncated at the default limit.
      constraints: {
        'max-results':          50000,
        'max-results-bare-rows': 50000,
      },
    }),
  })
  if (!r.ok) throw new Error(`Card ${cardId} failed: ${r.status}`)
  return r.json()
}

// Convert Metabase cols/rows to array of objects.
// Stores each value under BOTH the field name (c.name) and the display name
// (c.display_name) so pick() can find columns regardless of which format Metabase uses.
function toRows(json) {
  const cols = json.data?.cols || []
  const rows = json.data?.rows || []
  return rows.map(row => {
    const obj = {}
    cols.forEach((col, i) => {
      const val = row[i]
      if (col.name)         obj[col.name]         = val
      if (col.display_name) obj[col.display_name]  = val
      // Also store a fully-normalised key (no spaces/underscores, lowercase)
      // so pick() finds it even with casing/spacing differences
      const norm = (col.name || col.display_name || '')
        .toLowerCase().replace(/[\s_()+]+/g, '')
      if (norm) obj[`__norm__${norm}`] = val
    })
    return obj
  })
}

// Flexible value lookup:
//   1. Try exact key first
//   2. Try display_name / field_name variants
//   3. Try fully-normalised fallback key
function pick(obj, ...candidates) {
  for (const key of candidates) {
    // Exact match
    if (key in obj && obj[key] !== undefined) return obj[key]
    // Normalised fallback
    const norm = `__norm__${key.toLowerCase().replace(/[\s_()+]+/g, '')}`
    if (norm in obj && obj[norm] !== undefined) return obj[norm]
  }
  return null
}

// Handle both ISO date strings and Excel serial numbers
function parseDate(val) {
  if (!val && val !== 0) return null
  if (typeof val === 'number') {
    // Excel serial date: 25569 = days between 1900-01-01 and 1970-01-01
    return new Date((val - 25569) * 86400000)
  }
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
    return res.status(503).json({
      error: 'Metabase credentials not configured. Add METABASE_URL, METABASE_EMAIL, METABASE_PASSWORD in Vercel environment variables.',
    })
  }

  try {
    const token = await getToken()

    // Fetch all 3 questions in parallel
    const [rawInv, rawDemand, rawSales] = await Promise.all([
      runQuestionRaw(QID_INVENTORY, token),
      runQuestionRaw(QID_DEMAND,    token),
      runQuestionRaw(QID_SALES,     token),
    ])

    // Debug mode: return raw column info + facility-filtered sample rows
    if (debug === 'true') {
      const inventory  = toRows(rawInv)
      const demand     = toRows(rawDemand)
      const sales      = toRows(rawSales)

      const facInv    = inventory.filter(r => pick(r, 'organization_name', 'Organization Name') === facility).slice(0, 5)
      const facDemand = demand.filter(r => pick(r, 'organization_name', 'Organization Name') === facility).slice(0, 5)
      const facSales  = sales.filter(r => pick(r, 'organization_name', 'Organization Name') === facility).slice(0, 5)

      return res.json({
        note: `Debug for facility: ${facility}`,
        inventory: {
          cols: (rawInv.data?.cols || []).map(c => ({ name: c.name, display_name: c.display_name })),
          facility_rows: facInv,
          total_rows: (rawInv.data?.rows || []).length,
          facility_count: inventory.filter(r => pick(r, 'organization_name', 'Organization Name') === facility).length,
        },
        demand: {
          cols: (rawDemand.data?.cols || []).map(c => ({ name: c.name, display_name: c.display_name })),
          facility_rows: facDemand,
          total_rows: (rawDemand.data?.rows || []).length,
          facility_count: demand.filter(r => pick(r, 'organization_name', 'Organization Name') === facility).length,
        },
        sales: {
          cols: (rawSales.data?.cols || []).map(c => ({ name: c.name, display_name: c.display_name })),
          facility_rows: facSales,
          total_rows: (rawSales.data?.rows || []).length,
          facility_count: sales.filter(r => pick(r, 'organization_name', 'Organization Name') === facility).length,
        },
      })
    }

    const inventory  = toRows(rawInv)
    const demand     = toRows(rawDemand)
    const sales      = toRows(rawSales)

    // ── Build per-SKU maps, filtered to the requested facility ─────────────────

    const invMap    = {}
    const demandMap = {}
    const salesMap  = {}

    for (const row of inventory) {
      const org = pick(row, 'organization_name', 'Organization Name', 'facility', 'Facility')
      const sku = pick(row, 'sku', 'SKU', 'Sku')
      if (org === facility && sku) {
        const qty = pick(row,
          'sum',                     // Metabase field name for this aggregation
          'Sum of supply_quantity',  // Metabase display name
          'supply_pack_quantity',    // name in Google Sheets export
          'Supply Pack Quantity',
          'stock_available',
          'quantity'
        )
        invMap[sku] = (qty !== null && qty !== undefined) ? parseFloat(qty) : 0
      }
    }

    for (const row of demand) {
      const org = pick(row, 'organization_name', 'Organization Name', 'facility', 'Facility')
      const sku = pick(row, 'sku', 'SKU', 'Sku')
      if (org === facility && sku) {
        const abc = pick(row,
          'ABC_category', 'ABC Category', 'abc_category', 'ABCcategory',
          'ABC class', 'abc_class', 'ABCClass', 'Class', 'abc'
        )
        const total = pick(row,
          'Sum of total_demand', 'Sum_of_total_demand', 'total_demand', 'Total Demand',
          'sum_of_total_demand', 'sumoftotaldemand', 'total demand', 'TotalDemand',
          'demand', 'Demand'
        )
        demandMap[sku] = {
          abcClass:    (abc   !== null) ? String(abc)         : null,
          totalDemand: (total !== null) ? parseFloat(total)   : 0,
        }
      }
    }

    for (const row of sales) {
      const org = pick(row, 'organization_name', 'Organization Name', 'facility', 'Facility')
      const sku = pick(row, 'sku', 'SKU', 'Sku')
      if (org === facility && sku) {
        const restockRaw = pick(row,
          'last_movement_date',   // Metabase field name
          'last restock date',    // name in Google Sheets export
          'Last Restock Date',
          'last_restock_date',
          'Last_restock_date',
          'restock_date'
        )
        const restockDate = parseDate(restockRaw)
        const today = new Date()
        const daysSince = restockDate
          ? Math.max(1, Math.floor((today - restockDate) / 86400000))
          : 30

        const salesQty = pick(row,
          'Sales since last restock date', 'Sales Since Last Restock Date',
          'sales_since_last_restock', 'Sales_since_last_restock',
          'salessincelastrestockdate', 'sales_since_restock', 'sales'
        )

        salesMap[sku] = {
          salesSinceRestock: (salesQty !== null) ? parseFloat(salesQty) || 0 : 0,
          daysSinceRestock:  daysSince,
        }
      }
    }

    // ── Merge into one per-SKU result ────────────────────────────────────────
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

    // Cache for 30 minutes
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
    return res.json({ facility, items, sku_count: allSkus.size })

  } catch (err) {
    console.error('[validation]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
