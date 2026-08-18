export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { facility } = req.query
  if (!facility) return res.status(400).json({ error: 'facility is required' })

  try {
    const authRes = await fetch(`${process.env.METABASE_URL}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.METABASE_EMAIL, password: process.env.METABASE_PASSWORD }),
    })
    if (!authRes.ok) throw new Error('Metabase auth failed')
    const { id: token } = await authRes.json()

    // Q2799: Sales since last restock, filtered by facility
    const queryRes = await fetch(`${process.env.METABASE_URL}/api/dataset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
      body: JSON.stringify({
        database: null, type: 'query',
        query: {
          'source-table': 'card__2799',
          filter: ['=', ['field', 'organization_name', { 'base-type': 'type/Text' }], facility],
          limit: 10000,
        },
      }),
    })
    const data = await queryRes.json()
    const cols = data.data?.cols || []
    const rows = data.data?.rows || []
    const items = rows.map(row => {
      const obj = {}
      cols.forEach((c, i) => { obj[c.name] = row[i]; if (c.display_name) obj[c.display_name] = row[i] })
      return obj
    })

    const skuMap = {}
    for (const item of items) {
      const sku = item['sku'] || item['Sku'] || item['SKU']
      if (!sku) continue
      skuMap[sku] = {
        lastRestockDate:    item['last_movement_date'] || item['Last Movement Date'] || null,
        salesSinceRestock:  parseFloat(item['Sales since last restock date'] ?? item['sales_since_last_restock_date'] ?? 0) || 0,
      }
    }
    res.status(200).json({ skuMap })
  } catch (err) {
    res.status(200).json({ skuMap: {}, error: err.message })
  }
}
