import { useState } from 'react'
import { supabase } from '../lib/supabase'
import ProductSearch from './ProductSearch'

const REASONS = [
  'Price',
  'Stock-out',
  'Not offered',
  'Expired',
  'Partially-filled Prescription',
  'Specific brand',
]

const WEBHOOK_URL = import.meta.env.VITE_MISSED_SALE_WEBHOOK || ''

function formatAddedTime(date) {
  const d  = date.getDate()
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()]
  const y  = date.getFullYear()
  const hh = String(date.getHours()).padStart(2,'0')
  const mm = String(date.getMinutes()).padStart(2,'0')
  const ss = String(date.getSeconds()).padStart(2,'0')
  return `${d}-${mo}-${y} ${hh}:${mm}:${ss}`
}

export default function MissedSaleModal({ profile, onClose }) {
  const [step,          setStep]          = useState('form')
  const [product,       setProduct]       = useState(null)
  const [reason,        setReason]        = useState('')
  const [comment,       setComment]       = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [addingToOrder, setAddingToOrder] = useState(false)
  const [doneMessage,   setDoneMessage]   = useState('')
  const [error,         setError]         = useState('')

  async function handleSubmit() {
    if (!product) { setError('Please select a product.'); return }
    if (!reason)  { setError('Please select a reason.');  return }
    setError(''); setSubmitting(true)

    if (WEBHOOK_URL) {
      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addedTime:         formatAddedTime(new Date()),
          sku:               product.sku || '',
          pharmacyName:      profile.pharmacy_location,
          respondentName:    profile.full_name,
          missedSaleProduct: product.name,
          reason,
          comment,
        }),
      }).catch(err => console.error('[missed-sale webhook]', err))
    }

    setSubmitting(false)
    setStep('confirm')
  }

  async function addToSupplementaryOrder() {
    setAddingToOrder(true)

    // Check for ANY active supplementary order (Draft OR Submitted)
    const { data: active } = await supabase
      .from('orders')
      .select('id, status')
      .eq('pharmacy_location', profile.pharmacy_location)
      .eq('order_type', 'Supplementary Order')
      .in('status', ['Draft', 'Submitted'])
      .limit(1)

    const activeOrder = active?.[0]

    // Submitted order — can't add items, it's already with the admin
    if (activeOrder?.status === 'Submitted') {
      setAddingToOrder(false)
      setDoneMessage(
        'Your current supplementary order has already been submitted and is awaiting processing. ' +
        `Once the admin processes it, you can create a new supplementary order and add ${product.name} to it.`
      )
      setStep('done')
      return
    }

    let orderId
    let isNew = false

    if (activeOrder?.status === 'Draft') {
      orderId = activeOrder.id
    } else {
      // No active order — create a new Draft
      const { data: created } = await supabase
        .from('orders')
        .insert({
          order_type: 'Supplementary Order', status: 'Draft',
          created_by: profile.id, pharmacy_location: profile.pharmacy_location,
          total_value: 0,
        })
        .select('id').single()
      orderId = created.id
      isNew = true
    }

    await supabase.from('order_items').insert({
      order_id:            orderId,
      sku:                 product.sku || '',
      product_name:        product.name,
      order_quantity:      null,
      unit_price:          product.unitPrice || null,
      reason_for_ordering: null,
    })

    setAddingToOrder(false)
    setDoneMessage(
      isNew
        ? `A new supplementary order draft has been created and ${product.name} added. Remember to set the quantity before submitting.`
        : `${product.name} has been added to your existing supplementary order draft. Remember to set the quantity before submitting.`
    )
    setStep('done')
  }

  function dontOrder() {
    setDoneMessage('Got it. The missed sale has been recorded and no order was created.')
    setStep('done')
  }

  function handleClose() {
    setStep('form'); setProduct(null); setReason(''); setComment('')
    setError(''); setDoneMessage(''); setAddingToOrder(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-extrabold text-gray-900 text-base">Record missed sale</h2>
            {step === 'form' && <p className="text-xs text-gray-400 mt-0.5">{profile?.pharmacy_location}</p>}
          </div>
          <button onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center
              rounded-full hover:bg-gray-100 transition-colors font-bold text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-6 py-5">

          {step === 'form' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                  Product <span className="text-red-400">*</span>
                </label>
                <ProductSearch value={product?.name || ''} onSelect={p => { setProduct(p); setError('') }} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                  Reason for missed sale <span className="text-red-400">*</span>
                </label>
                <select value={reason} onChange={e => { setReason(e.target.value); setError('') }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-brand bg-white">
                  <option value="">Select reason…</option>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                  Comment <span className="text-gray-400 font-normal normal-case">— optional</span>
                </label>
                <textarea value={comment} onChange={e => setComment(e.target.value)}
                  rows={2} placeholder="Any additional details…"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
              </div>

              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

              <button onClick={handleSubmit} disabled={submitting}
                className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-2.5 rounded-lg
                  text-sm transition-colors disabled:opacity-50">
                {submitting ? 'Recording…' : 'Submit missed sale'}
              </button>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center pt-2 pb-1">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="font-bold text-gray-900">Missed sale recorded</p>
                <p className="text-sm text-gray-500 mt-0.5">{product?.name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-sm font-semibold text-gray-700 text-center mb-3">
                  Would you like to add this product to your supplementary order?
                </p>
                <div className="space-y-2.5">
                  <button onClick={addToSupplementaryOrder} disabled={addingToOrder}
                    className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-2.5 rounded-lg
                      text-sm transition-colors disabled:opacity-50">
                    {addingToOrder ? 'Adding to order…' : 'Add to Supplementary Order'}
                  </button>
                  <button onClick={dontOrder} disabled={addingToOrder}
                    className="w-full bg-white hover:bg-gray-50 text-gray-600 font-bold py-2.5 rounded-lg
                      text-sm border border-gray-200 transition-colors">
                    Don't Order
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center text-center space-y-4 py-2">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 max-w-xs">{doneMessage}</p>
              <button onClick={handleClose}
                className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-2.5 rounded-lg text-sm">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
