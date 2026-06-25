import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Navbar from '../components/Navbar'
import StatusBadge from '../components/StatusBadge'

// ── Update this list to match your actual pharmacy locations ────────────────
const LOCATIONS = [
  'Head Office',
  'Well Living Medical Clinic',
  'City Star Hospital',
  'Libken Medical Centre Limited',
  'PCEA St Timothy Medical Centre Limited',
  'Healmerc Pharmacy Limited',
  'Qaalane Pharmacy and Medical Centre',
  
]

function fmt(n) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency', currency: 'KES', minimumFractionDigits: 0,
  }).format(n)
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function AdminConsole() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('orders')

  // ── Orders ────────────────────────────────────────────────────────────────
  const [orders,      setOrders]      = useState([])
  const [ordersLoad,  setOrdersLoad]  = useState(true)
  const [filter,      setFilter]      = useState('Submitted')
  const [processingId, setProcessing] = useState(null)

  // ── Staff ─────────────────────────────────────────────────────────────────
  const [staff,     setStaff]     = useState([])
  const [staffLoad, setStaffLoad] = useState(true)

  // ── Add-staff form ────────────────────────────────────────────────────────
  const [showForm,  setShowForm]  = useState(false)
  const [form, setForm] = useState({ email:'', name:'', location:'', role:'staff', password:'' })
  const [formBusy,  setFormBusy]  = useState(false)
  const [formMsg,   setFormMsg]   = useState({ type: null, text: '' })

  useEffect(() => { fetchOrders() }, [filter])
  useEffect(() => { fetchStaff() }, [])

  async function fetchOrders() {
    setOrdersLoad(true)
    let q = supabase.from('orders')
      .select('*, profiles(full_name, pharmacy_location)')
      .order('created_at', { ascending: false })
    if (filter !== 'All') q = q.eq('status', filter)
    const { data } = await q
    setOrders(data || [])
    setOrdersLoad(false)
  }

  async function fetchStaff() {
    setStaffLoad(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setStaff(data || [])
    setStaffLoad(false)
  }

  async function markProcessed(orderId) {
    setProcessing(orderId)
    await supabase.from('orders').update({
      status: 'Processed', processed_at: new Date().toISOString(),
    }).eq('id', orderId)
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, status: 'Processed' } : o
    ))
    setProcessing(null)
  }

  async function createStaff() {
    setFormMsg({ type: null, text: '' })
    const { email, name, location, role, password } = form
    if (!email || !name || !location || !password) {
      setFormMsg({ type: 'error', text: 'Please fill in all fields.' }); return
    }
    if (password.length < 6) {
      setFormMsg({ type: 'error', text: 'Password must be at least 6 characters.' }); return
    }
    setFormBusy(true)

    // Create the auth user (uses signUp — they can change password later)
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: name } },
    })

    if (authErr) {
      setFormMsg({ type: 'error', text: authErr.message })
      setFormBusy(false); return
    }

    // Upsert the profile row
    if (authData.user) {
      const { error: profErr } = await supabase.from('profiles').upsert({
        id: authData.user.id, full_name: name, pharmacy_location: location, role,
      })
      if (profErr) { setFormMsg({ type: 'error', text: profErr.message }); setFormBusy(false); return }
    }

    setFormMsg({ type: 'success', text: `${name} has been added successfully.` })
    setForm({ email:'', name:'', location:'', role:'staff', password:'' })
    fetchStaff()
    setFormBusy(false)
  }

  async function toggleActive(staffId, current) {
    await supabase.from('profiles').update({ is_active: !current }).eq('id', staffId)
    setStaff(prev => prev.map(s => s.id === staffId ? { ...s, is_active: !current } : s))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Admin console</h1>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6 flex gap-0">
          {[{ id:'orders', label:'Orders' }, { id:'staff', label:'Staff accounts' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Orders tab ──────────────────────────────────────────────────── */}
        {tab === 'orders' && (
          <>
            {/* Filter buttons */}
            <div className="flex items-center gap-2 mb-5">
              <span className="text-sm text-gray-500 font-medium mr-1">Show:</span>
              {['All','Draft','Submitted','Processed'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    filter === s
                      ? 'bg-blue-700 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}>
                  {s}
                </button>
              ))}
            </div>

            {ordersLoad ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
                <p className="text-sm text-gray-500">No orders found for this filter.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Order no.','Staff member','Location','Type','Submitted','Total','Status',''].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider last:w-36">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {orders.map(o => (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 font-mono font-semibold text-gray-700">
                          #{String(o.order_number).padStart(4,'0')}
                        </td>
                        <td className="px-5 py-4 font-medium text-gray-800">{o.profiles?.full_name || '—'}</td>
                        <td className="px-5 py-4 text-gray-500 text-xs">{o.pharmacy_location}</td>
                        <td className="px-5 py-4 text-gray-600 text-xs">{o.order_type}</td>
                        <td className="px-5 py-4 text-gray-500">{fmtDate(o.submitted_at)}</td>
                        <td className="px-5 py-4 font-semibold text-gray-800">{fmt(o.total_value)}</td>
                        <td className="px-5 py-4"><StatusBadge status={o.status} /></td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3 justify-end">
                            <Link to={`/orders/${o.id}`}
                              className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                              View
                            </Link>
                            {o.status === 'Submitted' && (
                              <button onClick={() => markProcessed(o.id)}
                                disabled={processingId === o.id}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white
                                  font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                                {processingId === o.id ? 'Saving…' : 'Mark processed'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Staff tab ────────────────────────────────────────────────────── */}
        {tab === 'staff' && (
          <>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setShowForm(!showForm); setFormMsg({ type:null, text:'' }) }}
                className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800
                  text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add staff member
              </button>
            </div>

            {/* Add-staff form */}
            {showForm && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
                <h2 className="text-sm font-semibold text-gray-800 mb-4">New staff account</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label:'Full name',    field:'name',     type:'text',  placeholder:'Jane Doe' },
                    { label:'Email address',field:'email',    type:'email', placeholder:'jane@example.com' },
                    { label:'Temp. password',field:'password',type:'text',  placeholder:'Min. 6 characters' },
                  ].map(({ label, field, type, placeholder }) => (
                    <div key={field}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                      <input type={type} value={form[field]} placeholder={placeholder}
                        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                    <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select location…</option>
                      {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                    <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>

                {formMsg.type && (
                  <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                    formMsg.type === 'error'
                      ? 'bg-red-50 border border-red-200 text-red-600'
                      : 'bg-green-50 border border-green-200 text-green-700'
                  }`}>
                    {formMsg.text}
                  </div>
                )}

                <div className="flex gap-3 mt-5">
                  <button onClick={createStaff} disabled={formBusy}
                    className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold
                      px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                    {formBusy ? 'Creating…' : 'Create account'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFormMsg({ type:null, text:'' }) }}
                    className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200
                      px-4 py-2 rounded-lg hover:border-gray-300 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Staff table */}
            {staffLoad ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Name','Location','Role','Status',''].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider last:w-24">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {staff.map(s => (
                      <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${!s.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-4 font-medium text-gray-800">{s.full_name}</td>
                        <td className="px-5 py-4 text-gray-500 text-xs">{s.pharmacy_location}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            s.role === 'admin'
                              ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
                              : 'bg-gray-100 text-gray-600'
                          }`}>{s.role}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            s.is_active
                              ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                              : 'bg-gray-50 text-gray-500 ring-1 ring-gray-200'
                          }`}>{s.is_active ? 'Active' : 'Disabled'}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {s.id !== profile?.id && (
                            <button onClick={() => toggleActive(s.id, s.is_active)}
                              className="text-xs text-gray-400 hover:text-gray-700 font-medium
                                border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-300 transition-colors">
                              {s.is_active ? 'Disable' : 'Enable'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
