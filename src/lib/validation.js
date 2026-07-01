// ── Quantity validation logic ─────────────────────────────────────────────────
// Mirrors the "Quantity Approved" formula in the Review tab, extended with
// missed-sales proxy demand and class D (non-moving) stock branches.

export function getDaysToStock(abcClass, settings) {
  if (!settings) return 5
  const cls = String(abcClass || '').toLowerCase().trim()
  if (cls === 'class a' || cls === 'a') return Number(settings.class_a_days) || 20
  if (cls === 'class b' || cls === 'b') return Number(settings.class_b_days) || 20
  if (cls === 'class c' || cls === 'c') return Number(settings.class_c_days) || 15
  return Number(settings.fallback_days) || 5
}

// Returns { maxQty, limitReason } — maxQty = Infinity means no cap.
//
// Validation branches (for demand-based reasons):
//   Branch 1: Primary demand     → MAX(0, CEIL(MAX(demandPlanning, salesRate×days) − hmisStock))
//   Branch 2: Missed sales proxy → MAX(0, CEIL(missedCount×2 − hmisStock))
//             only applied when primary demand signals are both 0
//   Branch 3: Class D stock      → total available class D stock for this SKU
//             only applied when class D stock > 0
//
// Final max = MAX(branch1, branch2, branch3)
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

  // Use 0 defaults for any missing values so validation always runs.
  // Patient Request and budget-based reasons return early, unaffected.
  const hmisStock           = item?.hmisStock           ?? 0
  const abcClass            = item?.abcClass             ?? null
  const demandPlanningTotal = item?.demandPlanningTotal  ?? 0
  const salesSinceRestock   = item?.salesSinceRestock    ?? 0
  const daysSinceRestock    = item?.daysSinceRestock     ?? 30
  const missedSalesL30D     = item?.missedSalesL30D      ?? 0
  const classDStock         = item?.classDStock           ?? 0

  // ── Early returns for special reasons ─────────────────────────────────────
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

  // ── Demand-based branches ─────────────────────────────────────────────────
  const daysToStock = getDaysToStock(abcClass, settings)
  const dailyRate   = daysSinceRestock > 0 ? salesSinceRestock / daysSinceRestock : 0
  const salesDemand = dailyRate * daysToStock
  const maxDemand   = Math.max(demandPlanningTotal, salesDemand)

  // Branch 1: primary demand (existing logic)
  const demandQty = Math.max(0, Math.ceil(maxDemand - hmisStock))

  // Branch 2: missed sales proxy
  // Used when primary demand signals are both 0 and missed sales exist.
  // Proxy demand = missedCount × 2 (conservative estimate of true demand).
  let missedSalesQty = 0
  if (maxDemand === 0 && missedSalesL30D > 0) {
    const proxyDemand = missedSalesL30D * 2
    missedSalesQty = Math.max(0, Math.ceil(proxyDemand - hmisStock))
  }

  // Branch 3: class D stock
  // Non-moving stock that can be redistributed. Only contributes if > 0.
  const classDQty = classDStock > 0 ? Math.floor(classDStock) : 0

  // Final: take the highest across all branches
  const finalQty = Math.max(demandQty, missedSalesQty, classDQty)

  if (finalQty === 0) {
    // Case 1: There IS demand, but HMIS stock already covers it
    // e.g. HMIS = 7 units, max demand = 6.8 units → no top-up needed
    if (maxDemand > 0 && hmisStock >= maxDemand) {
      return {
        maxQty: 0,
        limitReason: 'Current stock in the system already covers the validated demand. No top-up is required.',
      }
    }
    // Case 2: No demand signals found at all (demand = 0, no missed sales, no class D)
    return {
      maxQty: 0,
      limitReason: 'No validated demand recorded for this product at this facility.',
    }
  }

  return { maxQty: finalQty, limitReason: null }
}

// ── HMIS stock variance check ─────────────────────────────────────────────────
// null hmisStock (product absent from Q2501) treated as 0 so variance alert
// still fires when staff enter a non-zero physical count.
export function checkHmisVariance(staffStockRaw, hmisStockRaw) {
  if (staffStockRaw === '' || staffStockRaw === null || staffStockRaw === undefined) return null
  const hmisStock = hmisStockRaw ?? 0
  const staff     = parseFloat(staffStockRaw)
  if (isNaN(staff)) return null
  if (staff === hmisStock) return null
  if (hmisStock === 0) {
    return staff !== 0 ? { staffStock: staff, hmisStock: 0, variancePct: null } : null
  }
  const pct = (staff - hmisStock) / hmisStock
  return Math.abs(pct) >= 0.2 ? { staffStock: staff, hmisStock, variancePct: pct } : null
}
