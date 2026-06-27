// ── Quantity validation logic ─────────────────────────────────────────────────
// Mirrors the "Quantity Approved" formula in the Review tab.
// Days-to-stock values confirmed from Order Review Logic tab:
//   Class A = 20, Class B = 20, Class C = 15, fallback = 5

export function getDaysToStock(abcClass, settings) {
  if (!settings) return 5
  // Normalise the class label — Metabase may return "Class B", "class b", "B", etc.
  const cls = String(abcClass || '').toLowerCase().trim()
  if (cls === 'class a' || cls === 'a') return Number(settings.class_a_days) || 20
  if (cls === 'class b' || cls === 'b') return Number(settings.class_b_days) || 20
  if (cls === 'class c' || cls === 'c') return Number(settings.class_c_days) || 15
  return Number(settings.fallback_days) || 5
}

// Maximum allowed quantity for one order item.
// Returns { maxQty, limitReason } — maxQty = Infinity means no cap.
export function calculateMaxQty({
  sku,
  reason,
  unitPrice,
  validationData,
  settings,
  facilityBudget = 2000,
  otherDiscretionarySpend = 0,
}) {
  const item = validationData?.[sku]

  // No Metabase data for this SKU at this facility → no cap applied
  if (!item || item.hmisStock === null) {
    return { maxQty: Infinity, limitReason: null }
  }

  const { hmisStock, abcClass, demandPlanningTotal, salesSinceRestock, daysSinceRestock } = item

  const daysToStock   = getDaysToStock(abcClass, settings)
  const dailyRate     = daysSinceRestock > 0 ? salesSinceRestock / daysSinceRestock : 0
  const salesDemand   = dailyRate * daysToStock
  const maxDemand     = Math.max(demandPlanningTotal || 0, salesDemand)
  // Round up just like ROUNDUP(MAX(J,M,N) - I, 0) in the spreadsheet
  const qtyNeeded     = Math.max(0, Math.ceil(maxDemand - (hmisStock || 0)))

  // ── Per-reason rules ───────────────────────────────────────────────────────

  // Patient Request: always approve what was asked
  if (reason === 'Patient Request') {
    return { maxQty: Infinity, limitReason: null }
  }

  // Pharmtech/Clinician Request or Specific Brand: limited by discretionary budget
  if (reason === 'Pharmtech/Clinician Request' || reason === 'Specific Brand') {
    const remaining = facilityBudget - otherDiscretionarySpend
    if (remaining <= 0) {
      return {
        maxQty: 0,
        limitReason: `Discretionary budget of KES ${facilityBudget.toLocaleString()} is fully used by other items in this order.`,
      }
    }
    const price = parseFloat(unitPrice) || 0
    const maxFromBudget = price > 0 ? Math.floor(remaining / price) : Infinity
    return {
      maxQty: maxFromBudget,
      limitReason: maxFromBudget < Infinity
        ? `KES ${remaining.toLocaleString()} remaining of the KES ${facilityBudget.toLocaleString()} discretionary budget per order.`
        : null,
    }
  }

  // All other reasons: demand-based cap
  if (hmisStock > 0 && hmisStock >= maxDemand && maxDemand > 0) {
    return {
      maxQty: 0,
      limitReason: `Current HMIS stock (${hmisStock} units) already covers projected demand of ${maxDemand.toFixed(1)} units.`,
    }
  }

  if (qtyNeeded === 0) {
    return {
      maxQty: 0,
      limitReason: 'No validated demand recorded for this product at this facility.',
    }
  }

  return { maxQty: qtyNeeded, limitReason: null }
}

// ── HMIS stock variance check ─────────────────────────────────────────────────
// Returns null if within tolerance, or { staffStock, hmisStock, variancePct } if >±20%.
export function checkHmisVariance(staffStockRaw, hmisStock) {
  if (hmisStock === null || hmisStock === undefined) return null
  if (staffStockRaw === '' || staffStockRaw === null || staffStockRaw === undefined) return null

  const staff = parseFloat(staffStockRaw)
  const hmis  = parseFloat(hmisStock)
  if (isNaN(staff) || isNaN(hmis)) return null
  if (staff === hmis) return null

  if (hmis === 0) {
    return staff !== 0
      ? { staffStock: staff, hmisStock: hmis, variancePct: null }
      : null
  }

  const pct = (staff - hmis) / hmis
  return Math.abs(pct) >= 0.2
    ? { staffStock: staff, hmisStock: hmis, variancePct: pct }
    : null
}
