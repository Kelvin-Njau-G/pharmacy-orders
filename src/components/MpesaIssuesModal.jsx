import { useState } from 'react'

function formatTimestamp(date) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dd  = String(date.getDate()).padStart(2, '0')
  const mon = months[date.getMonth()]
  const yyyy = date.getFullYear()
  const hh  = String(date.getHours()).padStart(2, '0')
  const mm  = String(date.getMinutes()).padStart(2, '0')
  const ss  = String(date.getSeconds()).padStart(2, '0')
  return `${dd}-${mon}-${yyyy} ${hh}:${mm}:${ss}`
}

function todayStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
}

const CHIPS = [
  { label: 'Now',      minutes: 0  },
  { label: '5 min',   minutes: 5  },
  { label: '10 min',  minutes: 10 },
  { label: '15 min',  minutes: 15 },
  { label: '20 min',  minutes: 20 },
  { label: '30 min',  minutes: 30 },
  { label: '45 min',  minutes: 45 },
  { label: '1 hr',    minutes: 60 },
]

export default function MpesaIssuesModal({ profile, userEmail, onClose }) {
  const [issueType,    setIssueType]    = useState('')   // 'not_received' | 'refund'
  const [txnTime,      setTxnTime]      = useState('')   // HH:MM
  const [txnDate,      setTxnDate]      = useState(todayStr())
  const [activeChip,   setActiveChip]   = useState(null) // minutes value of selected chip
  const [amount,       setAmount]       = useState('')
  const [mpesaCode,    setMpesaCode]    = useState('')
  const [busy,         setBusy]         = useState(false)
  const [error,        setError]        = useState('')
  const [done,         setDone]         = useState(false)

  function pickChip(minutes) {
    const d = new Date(Date.now() - minutes * 60000)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const yyyy = d.getFullYear()
    const mo   = String(d.getMonth() + 1).padStart(2, '0')
    const dd   = String(d.getDate()).padStart(2, '0')
    setTxnTime(`${hh}:${mm}`)
    setTxnDate(`${yyyy}-${mo}-${dd}`)
    setActiveChip(minutes)
  }

  function handleTimeChange(val) {
    setTxnTime(val)
    setActiveChip(null)
  }

  function handleDateChange(val) {
    setTxnDate(val)
    setActiveChip(null)
  }

  function getFullDateTime() {
    if (!txnDate || !txnTime) return null
    const d = new Date(`${txnDate}T${txnTime}:00`)
    return isNaN(d) ? null : d
  }

  async function submit() {
    if (!issueType)                      { setError('Please select an issue type.'); return }
    const dt = getFullDateTime()
    if (!dt)                             { setError('Please enter the transaction time.'); return }
    if (!amount || Number(amount) <= 0)  { setError('Please enter the transaction amount.'); return }
    setBusy(true); setError('')
    try {
      const webhook = import.meta.env.VITE_MPESA_ISSUES_WEBHOOK
      if (!webhook) throw new Error('Webhook not configured')
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'Added Time':        formatTimestamp(new Date()),
          'Pharmacy Name':     profile.pharmacy_location,
          "Respondent's Name": profile.full_name,
          'Issue Type':        issueType === 'not_received' ? 'Payment Not Received' : 'Refund Request',
          'Transaction Time':  formatTimestamp(dt),
          'Amount (KES)':      Number(amount),
          'M-Pesa Code':       mpesaCode.trim() || '—',
          'Staff Email':       userEmail || '—',
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
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-base font-extrabold text-gray-900">M-Pesa Issue</h2>
          </div>
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
            <p className="text-sm font-bold text-gray-800 mb-1">Issue reported</p>
            <p className="text-xs text-gray-500 mb-5">Your M-Pesa issue has been logged and the team has been notified.</p>
            <button onClick={onClose}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-bold px-5 py-2 rounded-lg">
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">

            {/* Issue type */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                Issue Type <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-3">
                {[
                  { value: 'not_received', label: 'Payment not received' },
                  { value: 'refund',       label: 'Refund request' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setIssueType(opt.value)}
                    className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold border transition-colors text-left leading-snug
                      ${issueType === opt.value
                        ? 'bg-brand text-white border-brand'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {issueType === 'not_received' && (
                <p className="text-xs text-gray-400 mt-1.5">
                  Covers wrong account number and API/integration failures.
                </p>
              )}
            </div>

            {/* Transaction time */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                Transaction Time <span className="text-red-400">*</span>
              </label>

              {/* Quick chips */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {CHIPS.map(c => (
                  <button key={c.minutes} type="button"
                    onClick={() => pickChip(c.minutes)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-full border transition-colors
                      ${activeChip === c.minutes
                        ? 'bg-brand text-white border-brand'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Manual time + date inputs */}
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5 uppercase tracking-wide">Time</label>
                  <input type="time" value={txnTime}
                    onChange={e => handleTimeChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                      focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5 uppercase tracking-wide">Date</label>
                  <input type="date" value={txnDate}
                    max={todayStr()}
                    onChange={e => handleDateChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                      focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Use the chips for quick selection, or type the exact time and date below.
              </p>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                Amount <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-500 whitespace-nowrap">KES</span>
                <input type="number" min="0" step="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                    focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
            </div>

            {/* M-Pesa code (optional) */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                M-Pesa Code <span className="text-gray-300 font-medium normal-case tracking-normal">(optional)</span>
              </label>
              <input type="text" value={mpesaCode}
                onChange={e => setMpesaCode(e.target.value)}
                placeholder="e.g. RKA3X7Y8Z0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                  focus:outline-none focus:ring-2 focus:ring-brand tracking-widest uppercase"
              />
            </div>

            {error && (
              <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={submit} disabled={busy}
                className="flex-1 bg-brand hover:bg-brand-dark text-white text-sm font-bold
                  py-2.5 rounded-lg disabled:opacity-50">
                {busy ? 'Submitting…' : 'Submit Issue'}
              </button>
              <button onClick={onClose}
                className="px-4 py-2.5 text-sm font-semibold text-gray-500 border border-gray-200
                  rounded-lg hover:border-gray-300">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
