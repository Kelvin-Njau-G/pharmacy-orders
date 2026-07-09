// Google Sheets product catalog integration
// Your sheet must have: Product Name, SKU, Unit Price columns (any order)

const SHEET_ID = import.meta.env.VITE_GOOGLE_SHEET_ID
const API_KEY  = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY

let _cache = null
let _cacheTime = null
const CACHE_MS = 5 * 60 * 1000 // 5 minutes

export async function fetchProducts() {
  if (_cache && _cacheTime && Date.now() - _cacheTime < CACHE_MS) return _cache

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/SKUs?key=${API_KEY}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Google Sheets error ${res.status}`)

  const json = await res.json()
  const rows = json.values || []
  if (rows.length < 2) return []

  // Auto-detect column positions from the header row (case-insensitive)
  const headers = rows[0].map(h => h.toLowerCase().trim())
  const nameIdx  = headers.findIndex(h => h.includes('product name') || h === 'name')
  const skuIdx   = headers.findIndex(h => h.includes('sku'))
  const priceIdx = headers.findIndex(h => h.includes('unit price') || h === 'price')

  const products = rows.slice(1)
    .filter(row => row[nameIdx])
    .map(row => ({
      name:      (row[nameIdx]  || '').trim(),
      sku:       (row[skuIdx]   || '').trim(),
      unitPrice: parseFloat(row[priceIdx]) || 0,
    }))

  _cache = products
  _cacheTime = Date.now()
  return products
}

let _oosCache = null
let _oosCacheTime = null

export async function fetchOutOfStock() {
  if (_oosCache && _oosCacheTime && Date.now() - _oosCacheTime < CACHE_MS) return _oosCache

  // The OOS sheet lives in the PaaS Data Inputs spreadsheet.
  // This may differ from SHEET_ID (the product catalog spreadsheet).
  const OOS_SHEET_ID = '1Tllagd7QxCJIKLXrx5r7WQjS-ga9rpSWr016BEuwk44'
  const sheetName    = 'Out of Stock in the Market'
  const range        = encodeURIComponent(sheetName)
  const url          = `https://sheets.googleapis.com/v4/spreadsheets/${OOS_SHEET_ID}/values/${range}?key=${API_KEY}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[fetchOutOfStock] HTTP ${res.status}`)
      return new Set()
    }
    const json = await res.json()
    const rows = json.values || []
    if (rows.length < 2) { _oosCache = new Set(); _oosCacheTime = Date.now(); return _oosCache }

    const headers = rows[0].map(h => (h || '').toLowerCase().trim())
    let skuIdx = headers.findIndex(h => h === 'sku')
    if (skuIdx < 0) skuIdx = headers.findIndex(h => h.includes('sku'))
    if (skuIdx < 0) skuIdx = 0

    const skus = new Set(
      rows.slice(1)
        .map(row => (row[skuIdx] || '').toString().trim())
        .filter(s => s.length > 0)
    )
    console.log(`[fetchOutOfStock] Loaded ${skus.size} OOS SKUs. Headers: ${rows[0].join(', ')}`)
    _oosCache     = skus
    _oosCacheTime = Date.now()
    return skus
  } catch (e) {
    console.warn('[fetchOutOfStock] Error:', e.message)
    return new Set()
  }
}
