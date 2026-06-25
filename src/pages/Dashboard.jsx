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
  const { profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) {
      load()
    } else if (!authLoading) {
      // Auth finished but no profile found — stop spinner, show empty state
      setLoading(false)
    }
  }, [profile, authLoading])

  async function load() {
    const { data } = await supabase
      .from('orders').select('*')
      .eq('created_by', profile.id)
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  // New orders only allowed when every existing order is Processed
  const hasActive   = orders.some(o => o.status !== 'Processed')
  const canCreate   = !hasActive
  const activeOrder = orders.find(o => o.status === 'Draft' || o.status === 'Submitted')

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">My orders</h1>
            <p className="text-sm text-gray-400 mt-0.5">{profile?.pharmacy_location}</p>
          </div>
          <div className="flex items-center gap-3">
            {activeOrder && (
              <Link
                to={`/orders/${activeOrder.id}`}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-3.5 py-2 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Continue active order →
              </Link>
            )}
            <button
              onClick={() => navigate('/orders/new')}
              disabled={!canCreate}
              title={!canCreate ? 'Your current order must be processed before creating a new one.' : ''}
              className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white
                text-sm font-medium px-4 py-2.5 rounded-lg transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New order
            </button>
          </div>
        </div>

        {!canCreate && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            You have an active order in progress. It must be <strong>processed</strong> by the admin before you can create a new one.
          </div>
        )}

        {/* Orders table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-sm font-medium">No orders yet</p>
            <p className="text-gray-400 text-xs mt-1">Create your first order to get started.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Order no.</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total value</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-mono font-semibold text-gray-700">
                      #{String(o.order_number).padStart(4, '0')}
                    </td>
                    <td className="px-5 py-4 text-gray-600">{o.order_type}</td>
                    <td className="px-5 py-4 text-gray-500">{fmtDate(o.created_at)}</td>
                    <td className="px-5 py-4 text-gray-500">{fmtDate(o.submitted_at)}</td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-800">{fmt(o.total_value)}</td>
                    <td className="px-5 py-4"><StatusBadge status={o.status} /></td>
                    <td className="px-5 py-4 text-right">
                      <Link to={`/orders/${o.id}`} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
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
