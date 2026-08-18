export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { facility } = req.query
  if (!facility) return res.status(400).json({ error: 'facility is required' })

  try {
    // Metabase auth
    const authRes = await fetch(`${process.env.METABASE_URL}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.METABASE_EMAIL, password: process.env.METABASE_PASSWORD }),
    })
    if (!authRes.ok) throw new Error(`Metabase auth failed: ${authRes.status}`)
    const { id: token } = await authRes.json()

    // Use card query directly — simpler and guaranteed to work
    // Filter by facility client-side to avoid MBQL column name guessing
    const queryRes = await fetch(`${process.env.METABASE_URL}/api/card/2799/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
      body: JSON.stringify({}),
    })
    if (!queryRes.ok) throw new Error(`Q2799 query failed: ${queryRes.status}`)
    const data = await queryRes.json()

    // Parse cols+rows — store ALL column name variants as keys
    const cols = data.data?.cols || []
    const rows = data.data?.rows || []
    const colNames = cols.map(c => ({ name: c.name, display: c.display_name || c.name }))

    // Build all rows as objects with both name and display_name as keys
    const allItems = rows.map(row => {
      const obj = {}
      cols.forEach((c, i) => {
        obj[c.name] = row[i]
        if (c.display_name) obj[c.display_name] = row[i]
        // Also store lowercase_underscore version
        const lower = (c.display_name || c.name).toLowerCase().replace(/\s+/g, '_')
        obj[lower] = row[i]
      })
      return obj
    })

    // Find the facility/org column name from actual data
    // Try common patterns: 'organization_name', 'Pharmacy Name', 'pharmacy_name', etc.
    const orgCol = colNames.find(c =>
      ['organization_name', 'pharmacy name', 'pharmacy_name', 'facility', 'location'].includes(
        (c.display || c.name || '').toLowerCase()
      )
    )

    // Filter to requested facility using both possible column names
    const facilityItems = allItems.filter(item => {
      const orgValue =
        item['organization_name'] ||
        item['Pharmacy Name'] ||
        item['pharmacy_name'] ||
        item['facility'] ||
        item['Location'] ||
        ''
      return orgValue === facility
    })

    // Build skuMap — detect column names from actual data
    const skuMap = {}
    for (const item of facilityItems) {
      const sku = item['sku'] || item['Sku'] || item['SKU']
      if (!sku) continue

      // Detect last restock date column
      const lastRestockDate =
        item['last_movement_date'] ||
        item['Last Movement Date'] ||
        item['last_restock_date'] ||
        item['Last Restock Date'] ||
        item['restock_date'] ||
        null

      // Detect sales since restock column
      const salesSinceRestock = parseFloat(
        item['Sales since last restock date'] ??
        item['sales_since_last_restock_date'] ??
        item['Sales Since Last Restock Date'] ??
        item['Sales since last restock'] ??
        item['sales'] ??
        0
      ) || 0

      skuMap[sku] = { lastRestockDate, salesSinceRestock }
    }

    // Include debug info to help diagnose if still empty
    res.status(200).json({
      skuMap,
      _debug: {
        totalRows: rows.length,
        facilityRows: facilityItems.length,
        columnNames: colNames.map(c => `${c.name} / ${c.display}`),
        sampleRow: allItems[0] ? Object.keys(allItems[0]).slice(0, 10) : [],
      }
    })
  } catch (err) {
    console.error('[sell-through]', err.message)
    res.status(200).json({ skuMap: {}, error: err.message })
  }
}
