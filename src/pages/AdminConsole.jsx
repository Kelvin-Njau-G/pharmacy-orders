import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Navbar from '../components/Navbar'
import StatusBadge from '../components/StatusBadge'

function fmt(n) {
  return new Intl.NumberFormat('en-KE', { style:'currency', currency:'KES', minimumFractionDigits:0 }).format(n)
}
function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })
}

// ── Reusable input ────────────────────────────────────────────────────────────
function Field({ label, value, onChange, type='text', placeholder='', disabled }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
          focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50 disabled:text-gray-400" />
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id:'orders',     label:'Orders' },
  { id:'staff',      label:'Staff accounts' },
  { id:'facilities', label:'Facilities' },
  { id:'settings',   label:'Settings' },
]

export default function AdminConsole() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('orders')

  // ── ORDERS ──────────────────────────────────────────────────────────────────
  const [orders,      setOrders]      = useState([])
  const [ordersLoad,  setOrdersLoad]  = useState(true)
  const [filter,      setFilter]      = useState('Submitted')
  const [processingId,setProcessing]  = useState(null)

  useEffect(() => { fetchOrders() }, [filter])

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

  async function markProcessed(orderId) {
    setProcessing(orderId)
    await supabase.from('orders').update({
      status: 'Processed', processed_at: new Date().toISOString(),
    }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'Processed' } : o))
    setProcessing(null)
  }

  // ── STAFF ────────────────────────────────────────────────────────────────────
  const [staff,     setStaff]     = useState([])
  const [staffLoad, setStaffLoad] = useState(true)
  const [facilities, setFacilities] = useState([])

  const [showStaffForm, setShowStaffForm] = useState(false)
  const [staffForm, setStaffForm] = useState({ email:'', name:'', location:'', role:'staff', password:'' })
  const [staffBusy, setStaffBusy] = useState(false)
  const [staffMsg,  setStaffMsg]  = useState({ type:null, text:'' })

  useEffect(() => { fetchStaff(); fetchFacilities() }, [])

  async function fetchStaff() {
    setStaffLoad(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setStaff(data || [])
    setStaffLoad(false)
  }

  async function fetchFacilities() {
    const { data } = await supabase.from('facilities').select('*').eq('is_active', true).order('name')
    setFacilities(data || [])
  }

  async function createStaff() {
    setStaffMsg({ type:null, text:'' })
    const { email, name, location, role, password } = staffForm
    if (!email || !name || !location || !password) {
      setStaffMsg({ type:'error', text:'Please fill in all fields.' }); return
    }
    if (password.length < 6) {
      setStaffMsg({ type:'error', text:'Password must be at least 6 characters.' }); return
    }
    setStaffBusy(true)
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: name } },
    })
    if (authErr) { setStaffMsg({ type:'error', text:authErr.message }); setStaffBusy(false); return }
    if (authData.user) {
      const { error } = await supabase.from('profiles').upsert({
        id: authData.user.id, full_name: name, pharmacy_location: location, role,
      })
      if (error) { setStaffMsg({ type:'error', text:error.message }); setStaffBusy(false); return }
    }
    setStaffMsg({ type:'success', text:`${name} has been added. They will receive an email to set their password.` })
    setStaffForm({ email:'', name:'', location:'', role:'staff', password:'' })
    fetchStaff()
    setStaffBusy(false)
  }

  async function toggleStaffActive(staffId, current) {
    await supabase.from('profiles').update({ is_active: !current }).eq('id', staffId)
    setStaff(prev => prev.map(s => s.id === staffId ? { ...s, is_active: !current } : s))
  }

  // ── FACILITIES ───────────────────────────────────────────────────────────────
  const [facList,     setFacList]     = useState([])
  const [facLoad,     setFacLoad]     = useState(true)
  const [showFacForm, setShowFacForm] = useState(false)
  const [facForm,     setFacForm]     = useState({ name:'', discretionary_budget:2000 })
  const [facBusy,     setFacBusy]     = useState(false)
  const [facMsg,      setFacMsg]      = useState({ type:null, text:'' })
  const [editBudget,  setEditBudget]  = useState({})  // { [id]: budget value being edited }

  useEffect(() => { fetchFacList() }, [])

  async function fetchFacList() {
    setFacLoad(true)
    const { data } = await supabase.from('facilities').select('*').order('name')
    setFacList(data || [])
    setFacLoad(false)
  }

  async function addFacility() {
    setFacMsg({ type:null, text:'' })
    const { name, discretionary_budget } = facForm
    if (!name.trim()) { setFacMsg({ type:'error', text:'Facility name is required.' }); return }
    setFacBusy(true)
    const { error } = await supabase.from('facilities').insert({
      name: name.trim(), discretionary_budget: Number(discretionary_budget) || 2000,
    })
    if (error) { setFacMsg({ type:'error', text: error.message }); setFacBusy(false); return }
    setFacMsg({ type:'success', text:`${name} added successfully.` })
    setFacForm({ name:'', discretionary_budget:2000 })
    fetchFacList(); fetchFacilities()
    setFacBusy(false)
  }

  async function saveBudget(id) {
    const budget = Number(editBudget[id])
    if (isNaN(budget) || budget < 0) return
    await supabase.from('facilities').update({ discretionary_budget: budget }).eq('id', id)
    setFacList(prev => prev.map(f => f.id === id ? { ...f, discretionary_budget: budget } : f))
    setEditBudget(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  async function toggleFacActive(id, current) {
    await supabase.from('facilities').update({ is_active: !current }).eq('id', id)
    setFacList(prev => prev.map(f => f.id === id ? { ...f, is_active: !current } : f))
    fetchFacilities()
  }

  // ── SETTINGS ─────────────────────────────────────────────────────────────────
  const [settings,     setSettings]     = useState(null)
  const [settingsLoad, setSettingsLoad] = useState(true)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsMsg,  setSettingsMsg]  = useState({ type:null, text:'' })
  const [settingsForm, setSettingsForm] = useState({
    class_a_days:20, class_b_days:15, class_c_days:5, fallback_days:5, alert_email:'',
  })

  useEffect(() => { fetchSettings() }, [])

  async function fetchSettings() {
    setSettingsLoad(true)
    const { data } = await supabase.from('stock_settings').select('*').limit(1).single()
    if (data) {
      setSettings(data)
      setSettingsForm({
        class_a_days:  data.class_a_days,
        class_b_days:  data.class_b_days,
        class_c_days:  data.class_c_days,
        fallback_days: data.fallback_days,
        alert_email:   data.alert_email || '',
      })
    }
    setSettingsLoad(false)
  }

  async function saveSettings() {
    setSettingsMsg({ type:null, text:'' })
    setSettingsBusy(true)
    const payload = {
      class_a_days:  Number(settingsForm.class_a_days)  || 20,
      class_b_days:  Number(settingsForm.class_b_days)  || 15,
      class_c_days:  Number(settingsForm.class_c_days)  || 5,
      fallback_days: Number(settingsForm.fallback_days) || 5,
      alert_email:   settingsForm.alert_email || null,
      updated_at:    new Date().toISOString(),
    }
    const { error } = await supabase.from('stock_settings').update(payload).eq('id', settings.id)
    if (error) setSettingsMsg({ type:'error', text: error.message })
    else { setSettingsMsg({ type:'success', text:'Settings saved.' }); fetchSettings() }
    setSettingsBusy(false)
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-xl font-extrabold text-gray-900 mb-6">Admin console</h1>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6 flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── ORDERS TAB ──────────────────────────────────────────────────── */}
        {tab === 'orders' && (
          <>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-sm text-gray-500 font-bold mr-1">Show:</span>
              {['All','Draft','Submitted','Processed'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    filter === s ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}>{s}</button>
              ))}
            </div>
            {ordersLoad ? (
              <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>
            ) : orders.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
                <p className="text-sm text-gray-500 font-medium">No orders found.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Order no.','Staff member','Location','Type','Submitted','Total','Status',''].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider last:w-36">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {orders.map(o => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4 font-mono font-bold text-gray-700">#{String(o.order_number).padStart(4,'0')}</td>
                        <td className="px-5 py-4 font-semibold text-gray-800">{o.profiles?.full_name||'—'}</td>
                        <td className="px-5 py-4 text-gray-500 text-xs font-medium">{o.pharmacy_location}</td>
                        <td className="px-5 py-4 text-gray-600 text-xs font-medium">{o.order_type}</td>
                        <td className="px-5 py-4 text-gray-500 font-medium">{fmtDate(o.submitted_at)}</td>
                        <td className="px-5 py-4 font-bold text-gray-800">{fmt(o.total_value)}</td>
                        <td className="px-5 py-4"><StatusBadge status={o.status} /></td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3 justify-end">
                            <Link to={`/orders/${o.id}`} className="text-xs text-brand hover:text-brand-dark font-bold">View</Link>
                            {o.status === 'Submitted' && (
                              <button onClick={() => markProcessed(o.id)} disabled={processingId===o.id}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold
                                  px-3 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap">
                                {processingId===o.id ? 'Saving…' : 'Mark processed'}
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

        {/* ── STAFF TAB ───────────────────────────────────────────────────── */}
        {tab === 'staff' && (
          <>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setShowStaffForm(!showStaffForm); setStaffMsg({ type:null, text:'' }) }}
                className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-bold px-4 py-2.5 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add staff member
              </button>
            </div>

            {showStaffForm && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
                <h2 className="text-sm font-extrabold text-gray-800 mb-4 uppercase tracking-wide">New staff account</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Full name"      value={staffForm.name}     onChange={v => setStaffForm(f=>({...f,name:v}))}     placeholder="Jane Doe" />
                  <Field label="Email address"  value={staffForm.email}    onChange={v => setStaffForm(f=>({...f,email:v}))}    type="email" placeholder="jane@example.com" />
                  <Field label="Temp. password" value={staffForm.password} onChange={v => setStaffForm(f=>({...f,password:v}))} placeholder="Min. 6 characters" />
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Location</label>
                    <select value={staffForm.location} onChange={e => setStaffForm(f=>({...f,location:e.target.value}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white">
                      <option value="">Select facility…</option>
                      {facilities.map(fac => <option key={fac.id} value={fac.name}>{fac.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Role</label>
                    <select value={staffForm.role} onChange={e => setStaffForm(f=>({...f,role:e.target.value}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white">
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                {staffMsg.type && (
                  <div className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium ${staffMsg.type==='error' ? 'bg-brand-red-light border border-red-200 text-brand-red' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                    {staffMsg.text}
                  </div>
                )}
                <div className="flex gap-3 mt-5">
                  <button onClick={createStaff} disabled={staffBusy}
                    className="bg-brand hover:bg-brand-dark text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">
                    {staffBusy ? 'Creating…' : 'Create account'}
                  </button>
                  <button onClick={() => { setShowStaffForm(false); setStaffMsg({ type:null, text:'' }) }}
                    className="text-sm text-gray-500 font-semibold border border-gray-200 px-4 py-2 rounded-lg hover:border-gray-300">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {staffLoad ? (
              <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Name','Location','Role','Status',''].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider last:w-24">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {staff.map(s => (
                      <tr key={s.id} className={`hover:bg-gray-50 ${!s.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-4 font-bold text-gray-800">{s.full_name}</td>
                        <td className="px-5 py-4 text-gray-500 text-xs font-medium">{s.pharmacy_location}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${s.role==='admin' ? 'bg-brand-navy-light text-brand-navy ring-1 ring-brand-navy/30' : 'bg-gray-100 text-gray-600'}`}>{s.role}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${s.is_active ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-gray-50 text-gray-500 ring-1 ring-gray-200'}`}>{s.is_active ? 'Active' : 'Disabled'}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {s.id !== profile?.id && (
                            <button onClick={() => toggleStaffActive(s.id, s.is_active)}
                              className="text-xs text-gray-400 hover:text-gray-700 font-bold border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-300">
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

        {/* ── FACILITIES TAB ───────────────────────────────────────────────── */}
        {tab === 'facilities' && (
          <>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setShowFacForm(!showFacForm); setFacMsg({ type:null, text:'' }) }}
                className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-bold px-4 py-2.5 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add facility
              </button>
            </div>

            {showFacForm && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
                <h2 className="text-sm font-extrabold text-gray-800 mb-4 uppercase tracking-wide">New facility</h2>
                <p className="text-xs text-gray-500 mb-4 font-medium">The facility name must match exactly how it appears in Metabase (organization_name field).</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Facility name (must match Metabase)" value={facForm.name}
                    onChange={v => setFacForm(f=>({...f,name:v}))} placeholder="e.g. Well Living Medical Clinic" />
                  <Field label="Discretionary budget (KES per order)" value={facForm.discretionary_budget}
                    onChange={v => setFacForm(f=>({...f,discretionary_budget:v}))} type="number" placeholder="2000" />
                </div>
                {facMsg.type && (
                  <div className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium ${facMsg.type==='error' ? 'bg-brand-red-light border border-red-200 text-brand-red' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                    {facMsg.text}
                  </div>
                )}
                <div className="flex gap-3 mt-5">
                  <button onClick={addFacility} disabled={facBusy}
                    className="bg-brand hover:bg-brand-dark text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">
                    {facBusy ? 'Adding…' : 'Add facility'}
                  </button>
                  <button onClick={() => { setShowFacForm(false); setFacMsg({ type:null, text:'' }) }}
                    className="text-sm text-gray-500 font-semibold border border-gray-200 px-4 py-2 rounded-lg hover:border-gray-300">Cancel</button>
                </div>
              </div>
            )}

            {facLoad ? (
              <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider">Facility name</th>
                      <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider">Discretionary budget / order</th>
                      <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3.5 w-40"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {facList.map(fac => (
                      <tr key={fac.id} className={`hover:bg-gray-50 ${!fac.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-4 font-semibold text-gray-800">{fac.name}</td>
                        <td className="px-5 py-4">
                          {editBudget[fac.id] !== undefined ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 font-medium">KES</span>
                              <input type="number" value={editBudget[fac.id]}
                                onChange={e => setEditBudget(prev => ({ ...prev, [fac.id]: e.target.value }))}
                                className="w-24 px-2 py-1 border border-brand rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand" />
                              <button onClick={() => saveBudget(fac.id)}
                                className="text-xs bg-brand text-white font-bold px-2.5 py-1.5 rounded-lg hover:bg-brand-dark">Save</button>
                              <button onClick={() => setEditBudget(prev => { const n={...prev}; delete n[fac.id]; return n })}
                                className="text-xs text-gray-400 font-medium">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-gray-800">KES {fac.discretionary_budget?.toLocaleString()}</span>
                              <button onClick={() => setEditBudget(prev => ({ ...prev, [fac.id]: fac.discretionary_budget }))}
                                className="text-xs text-brand hover:text-brand-dark font-bold">Edit</button>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${fac.is_active ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-gray-50 text-gray-500 ring-1 ring-gray-200'}`}>
                            {fac.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button onClick={() => toggleFacActive(fac.id, fac.is_active)}
                            className="text-xs text-gray-400 hover:text-gray-700 font-bold border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-300">
                            {fac.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── SETTINGS TAB ─────────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="max-w-lg">
            {settingsLoad ? (
              <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-sm font-extrabold text-gray-800 mb-1 uppercase tracking-wide">Validation settings</h2>
                <p className="text-xs text-gray-500 font-medium mb-6">
                  Days-to-stock determines the maximum order quantity per product based on projected demand.
                  Products are categorised by their ABC class in Metabase.
                </p>

                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Class A — days to stock</label>
                      <input type="number" value={settingsForm.class_a_days} min="1"
                        onChange={e => setSettingsForm(f=>({...f,class_a_days:e.target.value}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand" />
                      <p className="text-xs text-gray-400 mt-1">High-value / fast-moving</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Class B — days to stock</label>
                      <input type="number" value={settingsForm.class_b_days} min="1"
                        onChange={e => setSettingsForm(f=>({...f,class_b_days:e.target.value}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand" />
                      <p className="text-xs text-gray-400 mt-1">Mid-tier</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Class C — days to stock</label>
                      <input type="number" value={settingsForm.class_c_days} min="1"
                        onChange={e => setSettingsForm(f=>({...f,class_c_days:e.target.value}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand" />
                      <p className="text-xs text-gray-400 mt-1">Low-value / slow-moving</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Fallback days (no class)</label>
                      <input type="number" value={settingsForm.fallback_days} min="1"
                        onChange={e => setSettingsForm(f=>({...f,fallback_days:e.target.value}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand" />
                      <p className="text-xs text-gray-400 mt-1">Used when ABC class is blank</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-5 mb-6">
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">HMIS variance alert email</label>
                  <p className="text-xs text-gray-400 mb-2">Orders with staff stock differing &gt;20% from HMIS will be flagged. Enter an email to receive alerts.</p>
                  <input type="email" value={settingsForm.alert_email}
                    onChange={e => setSettingsForm(f=>({...f,alert_email:e.target.value}))}
                    placeholder="alerts@afyanzima.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>

                {settingsMsg.type && (
                  <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${settingsMsg.type==='error' ? 'bg-brand-red-light border border-red-200 text-brand-red' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                    {settingsMsg.text}
                  </div>
                )}

                <button onClick={saveSettings} disabled={settingsBusy}
                  className="bg-brand hover:bg-brand-dark text-white text-sm font-bold px-5 py-2.5 rounded-lg disabled:opacity-50">
                  {settingsBusy ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
