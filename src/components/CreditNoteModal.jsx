import { useState } from 'react'
import ProductSearch from './ProductSearch'

function formatTimestamp() {
  const now = new Date()
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dd   = String(now.getDate()).padStart(2, '0')
  const mon  = months[now.getMonth()]
  const yyyy = now.getFullYear()
  const hh   = String(now.getHours()).padStart(2, '0')
  const mm   = String(now.getMinutes()).padStart(2, '0')
  const ss   = String(now.getSeconds()).padStart(2, '0')
  return `${dd}-${mon}-${yyyy} ${hh}:${mm}:${ss}`
}

export default function CreditNoteModal({ profile, onClose }) {
  const [product,     setProduct]     = useState(null)
  const [hmisOrder,   setHmisOrder]   = useState('')
  const [amount,      setAmount]      = useState('')
  const [stockQty,    setStockQty]    = useState('')
  const [reason,      setReason]      = useState('')
  const [busy,        setBusy]        = useState(false)
  const [error,       setError]       = useState('')
  const [done,        setDone]        = useState(false)

  async function submit() {
    if (!product)              { setError('Please select a product.'); return }
    if (!hmisOrder.trim())     { setError('Please enter the HMIS Order Number.'); return }
    if (!amount || Number(amount) <= 0) { setError('Please enter a valid credit amount.'); return }
    if (!reason.trim())        { setError('Please provide a reason.'); return }
    setBusy(true); setError('')
    try {
      const webhook = import.meta.env.VITE_CREDIT_NOTE_WEBHOOK
      if (!webhook) throw new Error('Webhook not configured')
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'Added Time':        formatTimestamp(),
          'Pharmacy Name':     profile.pharmacy_location,
          "Respondent's Name": profile.full_name,
          'SKU':               product.sku,
          'Product Name':      product.name,
          'HMIS Order Number': hmisOrder.trim(),
          'Credit Amount KES': Number(amount),
          'Stock Quantity':    stockQty.trim(),
          'Reason':            reason.trim(),
        }),
      })
      setDone(true)
    } catch {
      setError('Failed to submit. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-extrabold text-gray-900">Credit Note</h2>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 focus:outline-none focus:ring-2 focus:ring-brand">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-800 mb-1">Credit note submitted</p>
            <p className="text-xs text-gray-500 mb-5">Your credit note has been recorded and will be reviewed.</p>
            <button onClick={onClose}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-bold px-5 py-2 rounded-lg">
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">

            {/* Product */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Product</label>
              <ProductSearch
                value={product?.name}
                onSelect={setProduct}
              />
            </div>

            {/* HMIS Order Number */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                HMIS Order Number
              </label>
              <input
                type="text"
                value={hmisOrder}
                onChange={e => setHmisOrder(e.target.value)}
                placeholder="e.g. ORD-2026-0042"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                  focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            {/* Credit Amount */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                Credit Amount
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-500 whitespace-nowrap">KES</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                    focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>

            {/* Stock Quantity */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                Stock Quantity
              </label>
              <input
                type="text"
                value={stockQty}
                onChange={e => setStockQty(e.target.value)}
                placeholder="e.g. 10 tablets, 2 packs of 100ml"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                  focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <p className="text-xs text-gray-400 mt-1">
                The stock quantity to be adjusted, specifying the units/pack size.
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Reason</label>
              <textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Describe why this credit note is being raised…"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-medium
                  focus:outline-none focus:ring-2 focus:ring-brand resize-none
                  placeholder:text-gray-400 placeholder:font-normal"
              />
            </div>

            {error && (
              <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 bg-brand hover:bg-brand-dark text-white text-sm font-bold
                  py-2.5 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Submitting…' : 'Submit Credit Note'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-semibold text-gray-500 border border-gray-200
                  rounded-lg hover:border-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
