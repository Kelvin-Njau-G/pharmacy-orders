// Module-level cache: {facility: skuMap} — persists for the browser session
const cache = {}

export async function fetchSellThrough(facility) {
  if (cache[facility]) return cache[facility]
  try {
    const res  = await fetch(`/api/sell-through?facility=${encodeURIComponent(facility)}`)
    const json = await res.json()
    if (json.skuMap) { cache[facility] = json.skuMap; return json.skuMap }
  } catch {}
  return {}
}

export function computeMetrics(orderItems, skuMap, submittedAt) {
  const skus = (orderItems || []).filter(i => i.sku)
  const subDate = submittedAt ? new Date(submittedAt) : null
  let supplied = 0, sold = 0

  for (const it of skus) {
    const d = skuMap?.[it.sku]
    if (!d?.lastRestockDate || !subDate) continue
    if (new Date(d.lastRestockDate) >= subDate) {
      supplied++
      if (d.salesSinceRestock > 0) sold++
    }
  }
  return {
    skusOrdered:   skus.length,
    skusSupplied:  supplied,
    skusSold:      sold,
    sellThrough:   supplied > 0 ? Math.round(sold / supplied * 100) : null,
  }
}

export function itemStatus(sku, skuMap, submittedAt) {
  if (!sku || !skuMap) return 'default'
  const d = skuMap[sku]
  if (!d?.lastRestockDate || !submittedAt) return 'default'
  if (new Date(d.lastRestockDate) < new Date(submittedAt)) return 'default'
  return d.salesSinceRestock > 0 ? 'sold' : 'not-sold'
}

// Tailwind classes for each status
export const STATUS_CLASSES = {
  sold:       'bg-green-50  border-green-300',
  'not-sold': 'bg-amber-50  border-amber-300',
  default:    'bg-white     border-gray-200',
}
