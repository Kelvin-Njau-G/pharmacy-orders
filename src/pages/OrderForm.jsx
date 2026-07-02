import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { calculateMaxQty, checkHmisVariance } from '../lib/validation'
import Navbar from '../components/Navbar'
import StatusBadge from '../components/StatusBadge'
import ProductSearch from '../components/ProductSearch'

const ORDER_TYPES = ['Supplementary Order', 'Emergency Order']

const REASONS = [
  'Out of Stock',
  'Unexpected Increase in Demand',
  'Specific Brand',
  'Pharmtech/Clinician Request',
  'Patient Request',
  'Low Quantity in Stock',
]

const BLANK_ITEM = {
  product_name: '', sku: '', unit_price: '',
  order_quantity: '', current_available_stock: '', reason_for_ordering: '',
  _error: null, _hmisVariance: null, _hmisConfirmed: false,
}

function fmt(n) {
  const v = parseFloat(n)
  if (isNaN(v)) return '—'
  return new Intl.NumberFormat('en-KE', { style:'currency', currency:'KES', minimumFractionDigits:0 }).format(v)
}
// Format a number to at most 2 decimal places, stripping trailing zeros
function fmtVal(v) {
  if (v === null || v === undefined) return '0'
  const n = parseFloat(v)
  if (isNaN(n)) return '0'
  return parseFloat(n.toFixed(2)).toString()
}
function fmtDateTime(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

// Drag handle icon
const DragHandle = () => (
  <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors"
    fill="currentColor" viewBox="0 0 20 20">
    <circle cx="7" cy="5"  r="1.5"/><circle cx="13" cy="5"  r="1.5"/>
    <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
    <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
  </svg>
)

export default function OrderForm() {
  const { id }   = useParams()
  const isNew    = id === 'new'
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()

  const [order,     setOrder]     = useState(null)
  const [orderType, setOrderType] = useState('')
  const [items,     setItems]     = useState([{ ...BLANK_ITEM, _key: 1 }])
  const [loading,   setLoading]   = useState(!isNew)
  const [saving,    setSaving]    = useState(false)
  const [pageError, setPageError] = useState(null)

  // Validation data
  const [validationData,    setValidationData]    = useState(null)
  const [stockSettings,     setStockSettings]     = useState(null)
  const [facilityBudget,    setFacilityBudget]    = useState(2000)
  const [validationLoading, setValidationLoading] = useState(false)
  const [validationError,   setValidationError]   = useState(null)

  // Drag-and-drop state
  const [dragKey,     setDragKey]     = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)

  // Auto-validate all items once validation data loads, so amber errors appear
  // immediately on an existing draft order without requiring user interaction.
  useEffect(() => {
    if (!validationData || !stockSettings || readOnly) return
    setItems(prev => prev.map((it, idx) => {
      if (!it.sku) return it

      // Qty / demand validation
      let error = null
      if (it.order_quantity && parseInt(it.order_quantity) > 0 && it.reason_for_ordering) {
        const otherDiscSpend = prev
          .slice(0, idx)
          .filter(o => o.reason_for_ordering === 'Pharmtech/Clinician Request' || o.reason_for_ordering === 'Specific Brand')
          .reduce((s, o) => s + (parseFloat(o.unit_price)||0)*(parseInt(o.order_quantity)||0), 0)
        const { maxQty, limitReason } = calculateMaxQty({
          sku: it.sku, reason: it.reason_for_ordering, unitPrice: it.unit_price,
          validationData, settings: stockSettings, facilityBudget,
          otherDiscretionarySpend: otherDiscSpend,
        })
        const qty = parseInt(it.order_quantity) || 0
        if (maxQty === 0) error = limitReason
        else if (qty > maxQty) error = `Maximum approved quantity is ${maxQty} units. Please reduce to ${maxQty} or remove this product.`
      }

      // HMIS variance check for pre-filled stock values
      let hmisVariance = it._hmisVariance
      const stockVal = it.current_available_stock
      if (stockVal !== '' && stockVal !== null && stockVal !== undefined) {
        hmisVariance = checkHmisVariance(stockVal, validationData[it.sku]?.hmisStock)
      }

      return { ...it, _error: error, _hmisVariance: hmisVariance }
    }))
  }, [validationData, stockSettings, facilityBudget])
  useEffect(() => {
    if (!dragKey) return
    let animFrame
    const EDGE = 100   // px from edge to start scrolling
    const MAX_SPEED = 18

    function onDragMove(e) {
      cancelAnimationFrame(animFrame)
      const y = e.clientY
      const h = window.innerHeight
      let speed = 0
      if (y < EDGE)     speed = -MAX_SPEED * ((EDGE - y) / EDGE)
      if (y > h - EDGE) speed =  MAX_SPEED * ((y - (h - EDGE)) / EDGE)
      if (speed !== 0) {
        animFrame = requestAnimationFrame(() => window.scrollBy({ top: speed, behavior: 'instant' }))
      }
    }

    document.addEventListener('dragover', onDragMove)
    return () => {
      document.removeEventListener('dragover', onDragMove)
      cancelAnimationFrame(animFrame)
    }
  }, [dragKey])

  useEffect(() => { if (isAdmin && isNew) navigate('/admin', { replace: true }) }, [isAdmin, isNew])

  const readOnly = isAdmin || (!!order && order.status !== 'Draft')

  useEffect(() => { if (!isNew) load() }, [id])

  useEffect(() => {
    if (!profile || readOnly) return
    if (isNew || (order && order.status === 'Draft')) loadValidation()
  }, [profile, order?.id, readOnly])

  async function load() {
    const { data, error } = await supabase
      .from('orders').select('*, order_items(*)').eq('id', id).single()
    if (error || !data) { setPageError('Order not found.'); setLoading(false); return }
    setOrder(data)
    setOrderType(data.order_type)
    setItems(
      data.order_items.length > 0
        ? data.order_items.map((it, i) => ({
            ...it, _key: i, _error: null, _hmisVariance: null,
            _hmisConfirmed: it.hmis_variance_confirmed || false,
          }))
        : [{ ...BLANK_ITEM, _key: 1 }]
    )
    setLoading(false)
  }

  async function loadValidation() {
    setValidationLoading(true); setValidationError(null)
    try {
      const [settingsRes, facilityRes, validationRes] = await Promise.all([
        supabase.from('stock_settings').select('*').limit(1).single(),
        supabase.from('facilities').select('discretionary_budget')
          .eq('name', profile.pharmacy_location).single(),
        fetch(`/api/validation?facility=${encodeURIComponent(profile.pharmacy_location)}`).then(r => r.json()),
      ])
      if (settingsRes.data)    setStockSettings(settingsRes.data)
      if (facilityRes.data)    setFacilityBudget(facilityRes.data.discretionary_budget ?? 2000)
      if (validationRes.items) setValidationData(validationRes.items)
      if (validationRes.error) setValidationError(validationRes.error)
    } catch {
      setValidationError('Could not load validation data. Quantity limits will not be enforced.')
    } finally { setValidationLoading(false) }
  }

  // ── Budget-aware max qty — only items BEFORE this one in the list consume budget ──
  // This is called with the current items array so it always uses up-to-date positions.
  function calcMaxQtyInContext(it, allItems, idxOverride) {
    if (!validationData || !stockSettings || !it.sku) return { maxQty: Infinity, limitReason: null }
    const idx = idxOverride ?? allItems.findIndex(i => i._key === it._key)
    const otherDiscretionarySpend = allItems
      .slice(0, idx)   // only items that appear BEFORE this one
      .filter(o => o.reason_for_ordering === 'Pharmtech/Clinician Request' || o.reason_for_ordering === 'Specific Brand')
      .reduce((s, o) => s + (parseFloat(o.unit_price)||0)*(parseInt(o.order_quantity)||0), 0)
    return calculateMaxQty({
      sku: it.sku, reason: it.reason_for_ordering, unitPrice: it.unit_price,
      validationData, settings: stockSettings, facilityBudget, otherDiscretionarySpend,
    })
  }

  // Re-validate every discretionary item after any order change
  function revalidateDiscretionary(updatedItems) {
    return updatedItems.map((it, idx) => {
      if (!it.sku || !validationData || !stockSettings) return it
      if (it.reason_for_ordering !== 'Pharmtech/Clinician Request' && it.reason_for_ordering !== 'Specific Brand') return it
      const { maxQty, limitReason } = calcMaxQtyInContext(it, updatedItems, idx)
      const qty = parseInt(it.order_quantity) || 0
      let error = null
      if (maxQty === 0) error = limitReason
      else if (qty > 0 && qty > maxQty) error = `Maximum approved quantity is ${maxQty} units. Please reduce to ${maxQty} or remove this product.`
      return { ...it, _error: error }
    })
  }

  // Readable alias for render
  const getMaxQty = useCallback((it) => calcMaxQtyInContext(it, items), [validationData, stockSettings, facilityBudget, items])

  // ── Item helpers ─────────────────────────────────────────────────────────────
  function addItem() { setItems(prev => [...prev, { ...BLANK_ITEM, _key: Date.now() }]) }
  function removeItem(key) {
    setItems(prev => revalidateDiscretionary(prev.filter(it => it._key !== key)))
  }

  function onProductSelect(key, product) {
    if (product.sku) {
      const dup = items.some(it => it._key !== key && it.sku && it.sku === product.sku)
      if (dup) {
        setItems(prev => prev.map(it =>
          it._key === key ? { ...it, _error: `${product.name} is already in this order.` } : it
        ))
        return
      }
    }
    setItems(prev => prev.map(it =>
      it._key === key
        ? { ...it, product_name: product.name, sku: product.sku||'', unit_price: product.unitPrice||'', _error: null }
        : it
    ))
  }

  function handleQtyChange(key, value) {
    setItems(prev => {
      const base = prev.map(it => it._key === key ? { ...it, order_quantity: value } : it)
      const idx  = base.findIndex(i => i._key === key)
      const it   = base[idx]
      const qty  = parseInt(value) || 0
      const { maxQty, limitReason } = calcMaxQtyInContext(it, base, idx)
      let error = null
      if (maxQty === 0) error = limitReason || 'This item cannot be ordered at this time.'
      else if (qty > 0 && qty > maxQty) error = `Maximum approved quantity is ${maxQty} units. Please reduce to ${maxQty} or remove this product.`
      const updated = base.map(i => i._key === key ? { ...i, _error: error } : i)
      return revalidateDiscretionary(updated)
    })
  }

  function handleStockChange(key, value) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const hmisStock = validationData?.[it.sku]?.hmisStock
      return { ...it, current_available_stock: value, _hmisVariance: checkHmisVariance(value, hmisStock), _hmisConfirmed: false }
    }))
  }

  function handleReasonChange(key, value) {
    setItems(prev => {
      const base = prev.map(it => it._key === key ? { ...it, reason_for_ordering: value, _error: null } : it)
      return revalidateDiscretionary(base)
    })
  }

  function confirmVariance(key, useSystemValue) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      if (useSystemValue) {
        return { ...it, current_available_stock: it._hmisVariance?.hmisStock?.toString() ?? '', _hmisVariance: null, _hmisConfirmed: false }
      }
      return { ...it, _hmisConfirmed: true }
    }))
  }

  // ── Drag-and-drop ─────────────────────────────────────────────────────────────
  function onDragStart(e, key) {
    setDragKey(key)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e, key) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverKey(key)
  }
  function onDrop(e, targetKey) {
    e.preventDefault()
    if (!dragKey || dragKey === targetKey) { endDrag(); return }
    setItems(prev => {
      const from = prev.findIndex(i => i._key === dragKey)
      const to   = prev.findIndex(i => i._key === targetKey)
      const reordered = [...prev]
      const [moved] = reordered.splice(from, 1)
      reordered.splice(to, 0, moved)
      return revalidateDiscretionary(reordered)
    })
    endDrag()
  }
  function endDrag() { setDragKey(null); setDragOverKey(null) }

  // ── Totals ───────────────────────────────────────────────────────────────────
  function lineTotal(it) { return (parseFloat(it.unit_price)||0) * (parseInt(it.order_quantity)||0) }
  function grandTotal()  { return items.reduce((s, it) => s + lineTotal(it), 0) }

  // ── Validate before save/submit ───────────────────────────────────────────────
  function validate() {
    let ok = true
    setItems(prev => prev.map((it, idx) => {
      if (!it.product_name.trim()) { ok = false; return { ...it, _error: 'Product name is required.' } }
      if (!it.order_quantity || parseInt(it.order_quantity) < 1) { ok = false; return { ...it, _error: 'Order quantity must be at least 1.' } }
      if (!it.reason_for_ordering) { ok = false; return { ...it, _error: 'Please select a reason for ordering.' } }
      if (it.sku && validationData && stockSettings) {
        const { maxQty, limitReason } = calcMaxQtyInContext(it, prev, idx)
        const qty = parseInt(it.order_quantity) || 0
        if (maxQty === 0) { ok = false; return { ...it, _error: limitReason || 'This item cannot be ordered.' } }
        if (qty > maxQty) { ok = false; return { ...it, _error: `Maximum approved quantity is ${maxQty} units.` } }
      }
      if (it._hmisVariance && !it._hmisConfirmed) { ok = false; return { ...it, _error: 'Please confirm your available stock quantity (or use the system value) to continue.' } }
      return { ...it, _error: null }
    }))
    return ok
  }

  // ── Persist ───────────────────────────────────────────────────────────────────
  async function persist(newStatus) {
    if (!orderType) { setPageError('Please select an order type.'); return }
    if (!validate()) { setPageError('Please fix the highlighted errors below.'); return }
    setPageError(null); setSaving(true)
    const now = new Date().toISOString()
    const total = grandTotal()
    try {
      let oid = order?.id
      if (isNew || !oid) {
        const { data: created, error } = await supabase.from('orders').insert({
          order_type: orderType, status: 'Draft',
          created_by: profile.id, pharmacy_location: profile.pharmacy_location,
          total_value: total, submitted_at: null,
        }).select().single()
        if (error) throw error
        oid = created.id; setOrder(created)
      } else {
        const { error } = await supabase.from('orders').update({ order_type: orderType, total_value: total }).eq('id', oid)
        if (error) throw error
      }
      await supabase.from('order_items').delete().eq('order_id', oid)
      const rows = items.map(it => ({
        order_id:                oid,
        sku:                     it.sku || null,
        product_name:            it.product_name,
        unit_price:              parseFloat(it.unit_price)              || null,
        order_quantity:          parseInt(it.order_quantity)            || null,
        current_available_stock: parseFloat(it.current_available_stock) || null,
        reason_for_ordering:     it.reason_for_ordering                 || null,
        hmis_stock_system:       validationData?.[it.sku]?.hmisStock    ?? null,
        hmis_variance_confirmed: it._hmisConfirmed || false,
      }))
      const { error: itemErr } = await supabase.from('order_items').insert(rows)
      if (itemErr) throw itemErr
      const { error: statusErr } = await supabase.from('orders').update({
        status: newStatus, submitted_at: newStatus === 'Submitted' ? now : null, total_value: total,
      }).eq('id', oid)
      if (statusErr) throw statusErr

      // Fire emergency order notification (non-blocking — submission succeeds even if this fails)
      if (newStatus === 'Submitted' && orderType === 'Emergency Order') {
        fetch('https://afyanzima.app.n8n.cloud/webhook/emergency-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record: {
              id:                oid,
              status:            'Submitted',
              order_type:        orderType,
              pharmacy_location: profile.pharmacy_location,
              created_by:        profile.id,
              order_number:      order?.order_number,
            }
          }),
        }).catch(err => console.error('[Emergency order notification]', err))
      }

      navigate('/dashboard')
    } catch (err) {
      setPageError('Something went wrong. Please try again.')
      console.error('[OrderForm persist]', err)
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50"><Navbar />
      <div className="flex justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button onClick={() => navigate(isAdmin ? '/admin' : '/dashboard')}
                className="text-sm text-gray-400 hover:text-gray-600 font-medium">← Back</button>
              {order && <StatusBadge status={order.status} />}
            </div>
            <h1 className="text-xl font-extrabold text-gray-900">
              {isNew ? 'New order' : `Order #${String(order?.order_number).padStart(4,'0')}`}
            </h1>
            {order && (
              <div className="flex gap-4 mt-1">
                <span className="text-xs text-gray-400 font-medium">Created: {fmtDateTime(order.created_at)}</span>
                {order.submitted_at && <span className="text-xs text-gray-400 font-medium">Submitted: {fmtDateTime(order.submitted_at)}</span>}
              </div>
            )}
          </div>
          {validationLoading && !readOnly && (
            <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-brand" />
              Loading validation data…
            </div>
          )}
        </div>

        {pageError && (
          <div className="mb-4 bg-brand-red-light border border-red-200 rounded-xl px-4 py-3 text-sm text-brand-red font-medium">{pageError}</div>
        )}
        {validationError && !readOnly && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium">
            ⚠ {validationError}
          </div>
        )}

        {/* Order type */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">Order type</label>
          {readOnly
            ? <p className="text-sm font-semibold text-gray-800">{orderType}</p>
            : <select value={orderType} onChange={e => setOrderType(e.target.value)}
                className="px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white">
                <option value="">Select order type…</option>
                {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
          }
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl border border-gray-200 mb-4">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-gray-700 uppercase tracking-wide">
                Order items · {items.length} product{items.length !== 1 ? 's' : ''}
              </h2>
              {!readOnly && items.length > 1 && (
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Drag ⠿ to reorder — position controls discretionary budget priority</p>
              )}
            </div>
            {!readOnly && (
              <button onClick={addItem} className="text-sm text-brand hover:text-brand-dark font-bold">+ Add product</button>
            )}
          </div>

          <div className="p-4 space-y-3">
            {items.map((it, idx) => {
              const maxQtyInfo = (!readOnly && it.sku && validationData && stockSettings)
                ? getMaxQty(it) : { maxQty: Infinity, limitReason: null }
              const isDragging  = dragKey     === it._key
              const isDragOver  = dragOverKey === it._key && !isDragging

              return (
                <div key={it._key}
                  onDragOver={!readOnly ? e => onDragOver(e, it._key) : undefined}
                  onDrop={!readOnly ? e => onDrop(e, it._key) : undefined}
                  className={`rounded-xl border-2 overflow-hidden transition-all ${
                    isDragging  ? 'opacity-40 scale-[0.99]' :
                    isDragOver  ? 'border-brand shadow-md shadow-brand/10' :
                    it._error   ? 'border-amber-300' : 'border-gray-200'
                  }`}
                >
                  {/* Card header */}
                  <div className={`px-4 py-3 flex items-start gap-2 ${it._error ? 'bg-amber-50' : 'bg-gray-50'}`}>

                    {/* Drag handle */}
                    {!readOnly && (
                      <div
                        draggable
                        onDragStart={e => onDragStart(e, it._key)}
                        onDragEnd={endDrag}
                        className="group cursor-grab active:cursor-grabbing shrink-0 mt-1.5 px-0.5"
                        title="Drag to reorder"
                      >
                        <DragHandle />
                      </div>
                    )}

                    {/* Product number badge */}
                    <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white text-xs font-extrabold mt-0.5">
                      {idx + 1}
                    </span>

                    {/* Product search / name */}
                    <div className="flex-1 min-w-0">
                      {readOnly
                        ? <p className="font-bold text-gray-900 text-sm">{it.product_name || '—'}</p>
                        : <ProductSearch value={it.product_name} onSelect={p => onProductSelect(it._key, p)} />
                      }
                      {/* Validation data hint — always shown once a product is selected and loading is complete */}
                      {it.sku && !readOnly && !validationLoading && (() => {
                        const d      = validationData?.[it.sku]
                        const l90    = d?.l90DayDemand ?? 0
                        const hmis   = d?.hmisStock    ?? 0
                        const noData = !d
                        return (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium">
                              <svg className="w-3 h-3 text-brand/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              L90D demand:&nbsp;
                              <span className={`font-bold ${noData ? 'text-gray-300' : 'text-gray-700'}`}>
                                {fmtVal(l90)} units/mo
                              </span>
                            </span>
                            <span className="text-xs text-gray-400 font-medium">
                              · HMIS stock:&nbsp;
                              <span className={`font-bold ${noData ? 'text-gray-300' : 'text-gray-700'}`}>
                                {fmtVal(hmis)} units
                              </span>
                            </span>
                            {noData && (
                              <span className="text-xs text-gray-300 font-medium">· no Metabase data</span>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {/* SKU badge + remove */}
                    <div className="flex items-center gap-2 shrink-0">
                      {it.sku
                        ? <span className="font-mono text-xs bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded font-bold">{it.sku}</span>
                        : <span className="text-xs text-gray-300 font-medium">No SKU</span>
                      }
                      {!readOnly && items.length > 1 && (
                        <button onClick={() => removeItem(it._key)}
                          className="text-gray-300 hover:text-brand-red p-1 rounded hover:bg-brand-red-light">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="px-4 py-4 bg-white">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 items-start">

                      {/* Unit price */}
                      <div>
                        <label className="block text-xs font-extrabold text-gray-400 mb-1.5 uppercase tracking-wide">Unit price (KES)</label>
                        {readOnly
                          ? <p className="text-sm font-bold text-gray-800">{fmt(it.unit_price)}</p>
                          : <input type="number" value={it.unit_price}
                              onChange={e => setItems(prev => prev.map(i => i._key===it._key ? {...i, unit_price:e.target.value} : i))}
                              min="0" step="0.01" placeholder="0.00"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand text-right" />
                        }
                      </div>

                      {/* Qty ordered */}
                      <div>
                        <label className="block text-xs font-extrabold text-gray-400 mb-1.5 uppercase tracking-wide">Qty ordered</label>
                        {readOnly
                          ? <p className="text-sm font-bold text-gray-800">{it.order_quantity ?? '—'}</p>
                          : <>
                              <input type="number" value={it.order_quantity}
                                onChange={e => handleQtyChange(it._key, e.target.value)}
                                min="1" step="1" placeholder="0"
                                className={`w-full px-3 py-2 border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 text-right ${
                                  it._error?.includes('Maximum') ? 'border-amber-400 focus:ring-amber-400' : 'border-gray-300 focus:ring-brand'
                                }`} />
                              {maxQtyInfo.maxQty !== Infinity && maxQtyInfo.maxQty > 0 && (
                                <p className="text-xs text-gray-400 mt-1 font-medium">Max: {maxQtyInfo.maxQty} units</p>
                              )}
                              {maxQtyInfo.limitReason && maxQtyInfo.maxQty > 0 && (
                                <p className="text-xs text-gray-500 mt-0.5 font-medium leading-tight">{maxQtyInfo.limitReason}</p>
                              )}
                            </>
                        }
                      </div>

                      {/* Available stock */}
                      <div>
                        <label className="block text-xs font-extrabold text-gray-400 mb-1.5 uppercase tracking-wide">Avail. stock</label>
                        {readOnly
                          ? <p className="text-sm font-bold text-gray-800">{it.current_available_stock ?? '—'}</p>
                          : <>
                              <input type="number" value={it.current_available_stock}
                                onChange={e => handleStockChange(it._key, e.target.value)}
                                min="0" step="0.1" placeholder="0"
                                className={`w-full px-3 py-2 border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 text-right ${
                                  it._hmisVariance && !it._hmisConfirmed ? 'border-amber-400 focus:ring-amber-400' : 'border-gray-300 focus:ring-brand'
                                }`} />
                              {it._hmisVariance && !it._hmisConfirmed && (
                                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                  <p className="text-xs text-amber-800 font-semibold mb-2">
                                    System (HMIS) shows <strong>{it._hmisVariance.hmisStock}</strong> units.{' '}
                                    {it._hmisVariance.variancePct !== null
                                      ? `${Math.round(Math.abs(it._hmisVariance.variancePct * 100))}% difference from your entry.`
                                      : 'System shows 0 but you entered stock.'
                                    } Please confirm.
                                  </p>
                                  <div className="flex gap-2">
                                    <button onClick={() => confirmVariance(it._key, true)}
                                      className="text-xs px-2.5 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-lg font-bold hover:bg-amber-50">
                                      Use system ({it._hmisVariance.hmisStock})
                                    </button>
                                    <button onClick={() => confirmVariance(it._key, false)}
                                      className="text-xs px-2.5 py-1.5 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700">
                                      Confirm my count
                                    </button>
                                  </div>
                                </div>
                              )}
                              {it._hmisVariance && it._hmisConfirmed && (
                                <p className="text-xs text-amber-600 mt-1 font-semibold">⚠ Variance confirmed — flagged for review</p>
                              )}
                            </>
                        }
                      </div>

                      {/* Line total */}
                      <div className="text-right">
                        <label className="block text-xs font-extrabold text-gray-400 mb-1.5 uppercase tracking-wide">Line total</label>
                        <p className="text-base font-extrabold text-brand">{fmt(lineTotal(it))}</p>
                      </div>
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="block text-xs font-extrabold text-gray-400 mb-1.5 uppercase tracking-wide">Reason for ordering</label>
                      {readOnly
                        ? <p className="text-sm text-gray-700 font-medium">{it.reason_for_ordering || '—'}</p>
                        : <select value={it.reason_for_ordering}
                            onChange={e => handleReasonChange(it._key, e.target.value)}
                            className="w-full sm:max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white">
                            <option value="">Select reason…</option>
                            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                      }
                    </div>

                    {/* Validation feedback */}
                    {it._error && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                          <p className="text-sm text-amber-800 font-medium">{it._error}</p>
                        </div>
                        <button onClick={() => removeItem(it._key)}
                          className="text-xs font-bold text-brand-red border border-red-200 bg-white px-3 py-1.5 rounded-lg shrink-0">
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bottom bar */}
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
            {!readOnly
              ? <button onClick={addItem} className="text-sm text-brand hover:text-brand-dark font-bold flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add another product
                </button>
              : <div />
            }
            <div className="text-right">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-0.5">Order total</p>
              <p className="text-2xl font-extrabold text-gray-900">{fmt(grandTotal())}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        {!readOnly
          ? <div className="flex gap-3 justify-end">
              <button onClick={() => navigate('/dashboard')}
                className="px-4 py-2.5 text-sm font-bold text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400">
                Discard
              </button>
              <button onClick={() => persist('Draft')} disabled={saving}
                className="px-4 py-2.5 text-sm font-bold bg-white text-brand border border-brand/30 rounded-lg hover:bg-brand-light disabled:opacity-50">
                {saving ? 'Saving…' : 'Save as draft'}
              </button>
              <button onClick={() => persist('Submitted')} disabled={saving}
                className="px-4 py-2.5 text-sm font-bold bg-brand text-white rounded-lg hover:bg-brand-dark disabled:opacity-50">
                {saving ? 'Submitting…' : 'Submit order'}
              </button>
            </div>
          : <div className={`text-center py-4 text-sm font-semibold rounded-xl border ${
              order?.status === 'Processed'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-brand-light border-brand/20 text-brand'
            }`}>
              {order?.status === 'Processed'
                ? 'This order has been processed and archived.'
                : isAdmin
                  ? 'This order is pending processing. Use the Admin console to mark it as processed.'
                  : 'This order has been submitted and is awaiting processing by the admin.'
              }
            </div>
        }
      </div>
    </div>
  )
}
