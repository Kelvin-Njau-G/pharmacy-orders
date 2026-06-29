// ── Quantity validation logic ─────────────────────────────────────────────────

export function getDaysToStock(abcClass, settings) {
  if (!settings) return 5
  const cls = String(abcClass || '').toLowerCase().trim()
  if (cls === 'class a' || cls === 'a') return Number(settings.class_a_days) || 20
  if (cls === 'class b' || cls === 'b') return Number(settings.class_b_days) || 20
  if (cls === 'class c' || cls === 'c') return Number(settings.class_c_days) || 15
  return Number(settings.fallback_days) || 5
}

// Returns { maxQty, limitReason } — maxQty = Infinity means no cap.
// When hmisStock is null (product not in Q2501), treat it as 0 so that
// validation still runs based on demand signals alone.
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

  // If the product is absent from Metabase entirely, use 0 defaults rather than
  // skipping validation. This means:
  //   • Patient Request      → still approved (early return below)
  //   • Budget-based reasons → still budget-capped (early return below)
  //   • Demand-based reasons → maxQty = 0 ("No validated demand")
  const hmisStock           = item?.hmisStock           ?? 0
  const abcClass            = item?.abcClass             ?? null
  const demandPlanningTotal = item?.demandPlanningTotal  ?? 0
  const salesSinceRestock   = item?.salesSinceRestock    ?? 0
  const daysSinceRestock    = item?.daysSinceRestock     ?? 30

  const daysToStock = getDaysToStock(abcClass, settings)
  const dailyRate   = daysSinceRestock > 0 ? salesSinceRestock / daysSinceRestock : 0
  const salesDemand = dailyRate * daysToStock
  const maxDemand   = Math.max(demandPlanningTotal || 0, salesDemand)
  const qtyNeeded   = Math.max(0, Math.ceil(maxDemand - hmisStock))

  if (reason === 'Patient Request') return { maxQty: Infinity, limitReason: null }

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

  // Demand-based cap
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
// When hmisStockRaw is null (product absent from Q2501), treat as 0 so that
// the variance alert still fires when staff enter a non-zero physical count.
export function checkHmisVariance(staffStockRaw, hmisStockRaw) {
  if (staffStockRaw === '' || staffStockRaw === null || staffStockRaw === undefined) return null

  // null → 0: product not in HMIS, so system effectively shows 0
  const hmisStock = hmisStockRaw ?? 0
  const staff     = parseFloat(staffStockRaw)
  if (isNaN(staff)) return null
  if (staff === hmisStock) return null

  if (hmisStock === 0) {
    return staff !== 0
      ? { staffStock: staff, hmisStock: 0, variancePct: null }
      : null
  }

  const pct = (staff - hmisStock) / hmisStock
  return Math.abs(pct) >= 0.2
    ? { staffStock: staff, hmisStock, variancePct: pct }
    : null
}
