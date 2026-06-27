// Vercel serverless function — secure Metabase proxy
// Runs on the server; Metabase credentials are never sent to the browser.
// Called from the order form as: GET /api/validation?facility=Well+Living+Medical+Clinic

const METABASE_URL   = process.env.METABASE_URL
const METABASE_EMAIL = process.env.METABASE_EMAIL
const METABASE_PASS  = process.env.METABASE_PASSWORD

const QID_INVENTORY = 2501  // Pharmacy Inventory  → HMIS stock per facility/SKU
const QID_DEMAND    = 2689  // Demand Planning     → ABC class, total demand
const QID_SALES     = 2799  // Sales since restock → sales qty, days since restock

// Authenticate and get a session token
async function getToken() {
  const r = await fetch(`${METABASE_URL}/api/session`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: METABASE_EMAIL, password: METABASE_PASS }),
  })
  if (!r.ok) throw new Error(`Metabase auth ${r.status}`)
  const { id } = await r.json()
  return id
}

// Run a saved question and return rows as an array of objects
async function runQuestion(id, token) {
  const r = await fetch(`${METABASE_URL}/api/card/${id}/query`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
    body:    JSON.stringify({}),
  })
  if (!r.ok) throw new Error(`Question ${id} failed ${r.status}`)
  const json = await r.json()
  const cols = (json.data?.cols || []).map(c => c.display_name || c.name)
  return (json.data?.rows || []).map(row => {
    const obj = {}
    cols.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })
}

// Flexible field lookup: tries exact match then case/space-insensitive match
function pick(obj, ...candidates) {
  for (const key of candidates) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key]
    const k2 = key.toLowerCase().replace(/[\s_]+/g, '')
    const found = Object.entries(obj).find(
      ([k]) => k.toLowerCase().replace(/[\s_]+/g, '') === k2
    )
    if (found && found[1] !== null) return found[1]
  }
  return null
}

// Handle both Excel serial date numbers and ISO date strings
function parseDate(val) {
  if (!val && val !== 0) return null
  if (typeof val === 'number') {
    // Excel counts from 1900-01-00; 25569 = days between 1900-01-01 and 1970-01-01
    return new Date((val - 25569) * 86400000)
  }
  const d = new Date(val)
  return isNaN(d) ? null : d
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'GET only' })

  const { facility } = req.query
  if (!facility) return res.status(400).json({ error: 'facility param required' })

  if (!METABASE_URL || !METABASE_EMAIL || !METABASE_PASS) {
    return res.status(503).json({
      error: 'Metabase credentials not configured. Add METABASE_URL, METABASE_EMAIL, METABASE_PASSWORD in Vercel environment variables.',
    })
  }

  try {
    const token = await getToken()

    const [inventory, demand, sales] = await Promise.all([
      runQuestion(QID_INVENTORY, token),
      runQuestion(QID_DEMAND, token),
      runQuestion(QID_SALES, token),
    ])

    // Build per-SKU maps, filtered to the requested facility
    const invMap    = {}
    const demandMap = {}
    const salesMap  = {}

    for (const row of inventory) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (org === facility && sku) {
        invMap[sku] = parseFloat(pick(row, 'supply_pack_quantity') ?? 0) || 0
      }
    }

    for (const row of demand) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (org === facility && sku) {
        demandMap[sku] = {
          abcClass:    pick(row, 'ABC_category', 'abc_category', 'ABCcategory') || '',
          totalDemand: parseFloat(pick(row, 'Sum of total_demand', 'total_demand') ?? 0) || 0,
        }
      }
    }

    for (const row of sales) {
      const org = pick(row, 'organization_name')
      const sku = pick(row, 'sku')
      if (org === facility && sku) {
        const restockDate = parseDate(pick(row, 'last restock date', 'last_restock_date'))
        const today = new Date()
        const daysSince = restockDate
          ? Math.max(1, Math.floor((today - restockDate) / 86400000))
          : 30

        salesMap[sku] = {
          salesSinceRestock: parseFloat(
            pick(row, 'Sales since last restock date', 'sales_since_last_restock') ?? 0
          ) || 0,
          daysSinceRestock: daysSince,
        }
      }
    }

    // Merge everything into one per-SKU object
    const allSkus = new Set([
      ...Object.keys(invMap),
      ...Object.keys(demandMap),
      ...Object.keys(salesMap),
    ])

    const items = {}
    for (const sku of allSkus) {
      items[sku] = {
        hmisStock:          invMap[sku]              ?? null,
        abcClass:           demandMap[sku]?.abcClass  ?? null,
        demandPlanningTotal:demandMap[sku]?.totalDemand ?? 0,
        salesSinceRestock:  salesMap[sku]?.salesSinceRestock ?? 0,
        daysSinceRestock:   salesMap[sku]?.daysSinceRestock  ?? 30,
      }
    }

    // Cache for 30 minutes (stale-while-revalidate keeps it feeling instant)
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
    return res.json({ facility, items })

  } catch (err) {
    console.error('[validation]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
