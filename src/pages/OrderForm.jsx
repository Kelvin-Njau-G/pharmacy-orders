import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
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
  _error: null,
}

function fmt(n) {
  const v = parseFloat(n)
  if (isNaN(v)) return '—'
  return new Intl.NumberFormat('en-KE', {
    style: 'currency', currency: 'KES', minimumFractionDigits: 0,
  }).format(v)
}

function fmtDateTime(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function OrderForm() {
  const { id } = useParams()
  const isNew  = id === 'new'
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [order,     setOrder]     = useState(null)
  const [orderType, setOrderType] = useState('')
  const [items,     setItems]     = useState([{ ...BLANK_ITEM, _key: 1 }])
  const [loading,   setLoading]   = useState(!isNew)
  const [saving,    setSaving]    = useState(false)
  const [pageError, setPageError] = useState(null)

  const readOnly = !!order && order.status !== 'Draft'

  useEffect(() => { if (!isNew) load() }, [id])

  async function load() {
    const { data, error } = await supabase
      .from('orders').select('*, order_items(*)')
      .eq('id', id).single()

    if (error || !data) { setPageError('Order not found.'); setLoading(false); return }

    setOrder(data)
    setOrderType(data.order_type)
    setItems(
      data.order_items.length > 0
        ? data.order_items.map((it, i) => ({ ...it, _key: i, _error: null }))
        : [{ ...BLANK_ITEM, _key: 1 }]
    )
    setLoading(false)
  }

  // ── Item helpers ────────────────────────────────────────────────────────────

  function addItem() {
    setItems(prev => [...prev, { ...BLANK_ITEM, _key: Date.now() }])
  }

  function removeItem(key) {
    setItems(prev => prev.filter(it => it._key !== key))
  }

  function setField(key, field, value) {
    setItems(prev => prev.map(it =>
      it._key === key ? { ...it, [field]: value, _error: null } : it
    ))
  }

  function onProductSelect(key, product) {
    setItems(prev => prev.map(it =>
      it._key === key
        ? { ...it, product_name: product.name, sku: product.sku || '', unit_price: product.unitPrice || '', _error: null }
        : it
    ))
  }

  function lineTotal(it) {
    return (parseFloat(it.unit_price) || 0) * (parseInt(it.order_quantity) || 0)
  }

  function grandTotal() {
    return items.reduce((s, it) => s + lineTotal(it), 0)
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  // Metabase-based quantity validation will be added in Phase 2.
  // For now we validate required fields only.

  function validate() {
    let ok = true
    setItems(prev => prev.map(it => {
      if (!it.product_name.trim()) {
        ok = false; return { ...it, _error: 'Product name is required.' }
      }
      if (!it.order_quantity || parseInt(it.order_quantity) < 1) {
        ok = false; return { ...it, _error: 'Order quantity must be at least 1.' }
      }
      if (!it.reason_for_ordering) {
        ok = false; return { ...it, _error: 'Please select a reason for ordering.' }
      }
      return { ...it, _error: null }
    }))
    return ok
  }

  // ── Save / Submit ────────────────────────────────────────────────────────────

  async function persist(newStatus) {
    if (!orderType) { setPageError('Please select an order type.'); return }
    if (!validate()) { setPageError('Please fix the errors highlighted below.'); return }
    setPageError(null)
    setSaving(true)

    const now   = new Date().toISOString()
    const total = grandTotal()

    try {
      let oid = order?.id

      if (isNew || !oid) {
        const { data: created, error } = await supabase.from('orders').insert({
          order_type: orderType, status: newStatus,
          created_by: profile.id, pharmacy_location: profile.pharmacy_location,
          total_value: total,
          submitted_at: newStatus === 'Submitted' ? now : null,
        }).select().single()
        if (error) throw error
        oid = created.id
        setOrder(created)
      } else {
        const { error } = await supabase.from('orders').update({
          order_type: orderType, status: newStatus, total_value: total,
          submitted_at: newStatus === 'Submitted' ? now : undefined,
        }).eq('id', oid)
        if (error) throw error
      }

      // Replace all items (delete + re-insert)
      await supabase.from('order_items').delete().eq('order_id', oid)

      const rows = items.map(it => ({
        order_id: oid,
        sku:       it.sku   || null,
        product_name:            it.product_name,
        unit_price:              parseFloat(it.unit_price)              || null,
        order_quantity:          parseInt(it.order_quantity)            || null,
        current_available_stock: parseFloat(it.current_available_stock) || null,
        reason_for_ordering:     it.reason_for_ordering                 || null,
      }))

      const { error: itemErr } = await supabase.from('order_items').insert(rows)
      if (itemErr) throw itemErr

      navigate('/dashboard')
    } catch (err) {
      setPageError('Something went wrong. Please try again.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button onClick={() => navigate('/dashboard')}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                ← Back
              </button>
              {order && <StatusBadge status={order.status} />}
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              {isNew ? 'New order' : `Order #${String(order?.order_number).padStart(4, '0')}`}
            </h1>
            {order && (
              <div className="flex gap-4 mt-1">
                <span className="text-xs text-gray-400">Created: {fmtDateTime(order.created_at)}</span>
                {order.submitted_at && (
                  <span className="text-xs text-gray-400">Submitted: {fmtDateTime(order.submitted_at)}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {pageError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            {pageError}
          </div>
        )}

        {/* Order type */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Order type</label>
          {readOnly ? (
            <p className="text-sm text-gray-800 font-medium">{orderType}</p>
          ) : (
            <select
              value={orderType} onChange={e => setOrderType(e.target.value)}
              className="px-3.5 py-2 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select order type…</option>
              {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {/* Items table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Order items</h2>
            {!readOnly && (
              <button onClick={addItem}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
                + Add product
              </button>
            )}
          </div>

          {/* Product cards */}
          <div className="divide-y divide-gray-100">
            {items.map((it, idx) => (
              <div key={it._key} className="p-5">

                {/* ── Row 1: Product name + SKU + remove ── */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    {readOnly ? (
                      <p className="font-semibold text-gray-900 text-sm leading-snug">{it.product_name}</p>
                    ) : (
                      <ProductSearch
                        value={it.product_name}
                        onSelect={p => onProductSelect(it._key, p)}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pt-1">
                    {it.sku
                      ? <span className="font-mono text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">{it.sku}</span>
                      : <span className="text-xs text-gray-300">No SKU</span>
                    }
                    {!readOnly && items.length > 1 && (
                      <button onClick={() => removeItem(it._key)}
                        className="text-gray-300 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-50"
                        title="Remove product">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Row 2: Numeric fields + reason + line total ── */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">

                  {/* Unit price */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Unit price (KES)</label>
                    {readOnly ? (
                      <p className="text-sm font-semibold text-gray-800">{fmt(it.unit_price)}</p>
                    ) : (
                      <input type="number" value={it.unit_price}
                        onChange={e => setField(it._key, 'unit_price', e.target.value)}
                        min="0" step="0.01" placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500 text-right" />
                    )}
                  </div>

                  {/* Qty ordered */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Qty ordered</label>
                    {readOnly ? (
                      <p className="text-sm font-semibold text-gray-800">{it.order_quantity ?? '—'}</p>
                    ) : (
                      <input type="number" value={it.order_quantity}
                        onChange={e => setField(it._key, 'order_quantity', e.target.value)}
                        min="1" step="1" placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500 text-right" />
                    )}
                  </div>

                  {/* Available stock */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Avail. stock</label>
                    {readOnly ? (
                      <p className="text-sm font-semibold text-gray-800">{it.current_available_stock ?? '—'}</p>
                    ) : (
                      <input type="number" value={it.current_available_stock}
                        onChange={e => setField(it._key, 'current_available_stock', e.target.value)}
                        min="0" step="0.1" placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500 text-right" />
                    )}
                  </div>

                  {/* Reason for ordering */}
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Reason for ordering</label>
                    {readOnly ? (
                      <p className="text-sm text-gray-700">{it.reason_for_ordering || '—'}</p>
                    ) : (
                      <select value={it.reason_for_ordering}
                        onChange={e => setField(it._key, 'reason_for_ordering', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">Select reason…</option>
                        {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Line total */}
                  <div className="text-right">
                    <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Line total</label>
                    <p className="text-base font-bold text-gray-900">{fmt(lineTotal(it))}</p>
                  </div>
                </div>

                {/* ── Validation feedback (shown when item has an error) ── */}
                {it._error && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <p className="text-sm text-amber-800">{it._error}</p>
                    </div>
                    <button onClick={() => removeItem(it._key)}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200
                        hover:border-red-300 bg-white px-3 py-1.5 rounded-lg transition-colors shrink-0">
                      Remove product
                    </button>
                  </div>
                )}

              </div>
            ))}
          </div>

          {/* Grand total */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-0.5">Order total</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(grandTotal())}</p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {!readOnly ? (
          <div className="flex gap-3 justify-end">
            <button onClick={() => navigate('/dashboard')}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-300
                rounded-lg hover:border-gray-400 hover:text-gray-800 transition-colors">
              Discard
            </button>
            <button onClick={() => persist('Draft')} disabled={saving}
              className="px-4 py-2.5 text-sm font-medium bg-white text-blue-700 border border-blue-300
                rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save as draft'}
            </button>
            <button onClick={() => persist('Submitted')} disabled={saving}
              className="px-4 py-2.5 text-sm font-semibold bg-blue-700 text-white
                rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50">
              {saving ? 'Submitting…' : 'Submit order'}
            </button>
          </div>
        ) : (
          <div className={`text-center py-4 text-sm rounded-xl border ${
            order?.status === 'Processed'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            {order?.status === 'Processed'
              ? 'This order has been processed and archived.'
              : 'This order has been submitted and is awaiting processing by the admin.'}
          </div>
        )}
      </div>
    </div>
  )
}
