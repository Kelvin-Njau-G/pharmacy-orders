import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import StatusBadge from '../components/StatusBadge'

function fmt(amount) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency', currency: 'KES', minimumFractionDigits: 0,
  }).format(amount)
}
function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function Dashboard() {
  const { profile, isAdmin, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && isAdmin) navigate('/admin', { replace: true })
  }, [isAdmin, authLoading])

  useEffect(() => {
    if (profile && !isAdmin) load()
    else if (!authLoading) setLoading(false)
  }, [profile, authLoading, isAdmin])

  async function load() {
    const { data } = await supabase
      .from('orders').select('*')
      .eq('created_by', profile.id)
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  // Emergency orders: always allowed
  // Supplementary orders: only 1 active (Draft or Submitted) at a time
  const activeSupplementary = orders.find(
    o => o.order_type === 'Supplementary Order' && (o.status === 'Draft' || o.status === 'Submitted')
  )
  const canCreateSupplementary = !activeSupplementary

  function newOrder(orderType) {
    navigate('/orders/new', { state: { orderType } })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">My orders</h1>
            <p className="text-sm text-gray-400 mt-0.5 font-medium">{profile?.pharmacy_location}</p>
          </div>
          <div className="flex items-center gap-3">
            {activeSupplementary && (
              <Link to={`/orders/${activeSupplementary.id}`}
                className="text-sm text-brand hover:text-brand-dark font-bold border border-brand/30
                  px-3.5 py-2 rounded-lg hover:bg-brand-light transition-colors">
                Continue supplementary order →
              </Link>
            )}

            {/* Emergency Order — always enabled */}
            <button
              onClick={() => newOrder('Emergency Order')}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white
                text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Emergency Order
            </button>

            {/* Supplementary Order — disabled when one is already active */}
            <button
              onClick={() => newOrder('Supplementary Order')}
              disabled={!canCreateSupplementary}
              title={!canCreateSupplementary
                ? 'Your current supplementary order must be processed before creating a new one.'
                : 'Create a new supplementary order'}
              className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white
                text-sm font-bold px-4 py-2.5 rounded-lg transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Supplementary Order
            </button>
          </div>
        </div>

        {!canCreateSupplementary && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium">
            You have an active supplementary order in progress. It must be <strong>processed</strong> by the admin before you can create a new one. Emergency orders can still be created at any time.
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-sm font-bold">No orders yet</p>
            <p className="text-gray-400 text-xs mt-1">Create your first order to get started.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider">Order no.</th>
                  <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider">Submitted</th>
                  <th className="px-5 py-3.5 text-right text-xs font-extrabold text-gray-500 uppercase tracking-wider">Total value</th>
                  <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-mono font-bold text-gray-700">
                      #{String(o.order_number).padStart(4, '0')}
                    </td>
                    <td className="px-5 py-4 text-gray-600 font-medium">{o.order_type}</td>
                    <td className="px-5 py-4 text-gray-500">{fmtDate(o.created_at)}</td>
                    <td className="px-5 py-4 text-gray-500">{fmtDate(o.submitted_at)}</td>
                    <td className="px-5 py-4 text-right font-bold text-gray-800">{fmt(o.total_value)}</td>
                    <td className="px-5 py-4"><StatusBadge status={o.status} /></td>
                    <td className="px-5 py-4 text-right">
                      <Link to={`/orders/${o.id}`} className="text-xs text-brand hover:text-brand-dark font-bold">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
