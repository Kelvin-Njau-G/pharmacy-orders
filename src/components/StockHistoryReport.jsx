import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Formatting ───────────────────────────────────────────────────────────────
const kes = new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', minimumFractionDigits: 0, maximumFractionDigits: 0,
})
function fmt(n) { return kes.format(Number(n) || 0) }
function fmtCompact(n) {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `${Math.round(v / 1_000)}K`
  return String(Math.round(v))
}
function fmtWeek(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
}

// ── Class vocabulary ─────────────────────────────────────────────────────────
// N is not a class, it's the absence of stock. Kept last and visually split off.
const CLASSES = ['A', 'B', 'C', 'D', 'N']
const RANK = { A: 0, B: 1, C: 2, D: 3, N: 4 }
const CLASS_LABEL = { A: 'A', B: 'B', C: 'C', D: 'D', N: 'Not stocked' }
const CLASS_FILL = { A: '#006CB5', B: '#557DB1', C: '#A9C0DC', D: '#E63323' }

const PERIODS = [
  { id: 1,  label: 'Week on week' },
  { id: 4,  label: '4 weeks' },
  { id: 12, label: '12 weeks' },
]

// A class change is only meaningful once the 90-day ABC window has had time
// to turn over, so 4 weeks is the default rather than the shortest span.
const DEFAULT_PERIOD = 4

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
    </div>
  )
}

function Empty({ title, body }) {
  return (
    <div className="border border-dashed border-gray-300 rounded-lg py-16 px-6 text-center">
      <p className="text-sm font-bold text-gray-700">{title}</p>
      {body && <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{body}</p>}
    </div>
  )
}

// ── Stacked value trend ──────────────────────────────────────────────────────
function Trend({ rows, weeks, metric }) {
  const byWeek = useMemo(() => {
    const m = new Map(weeks.map(w => [w, { A: 0, B: 0, C: 0, D: 0 }]))
    for (const r of rows) {
      const bucket = m.get(r.week_start)
      if (!bucket || r.abc_class === 'N') continue
      bucket[r.abc_class] += metric === 'value' ? Number(r.stock_value) : Number(r.sku_count)
    }
    return weeks.map(w => ({ week: w, ...m.get(w) }))
  }, [rows, weeks, metric])

  const max = Math.max(1, ...byWeek.map(b => b.A + b.B + b.C + b.D))
  const H = 180, BAR = 34, GAP = 18
  const W = Math.max(320, byWeek.length * (BAR + GAP) + GAP)

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H + 34} role="img"
           aria-label={`Stock ${metric === 'value' ? 'value' : 'SKU count'} by ABC class, by week`}>
        {byWeek.map((b, i) => {
          const x = GAP + i * (BAR + GAP)
          let y = H
          return (
            <g key={b.week}>
              {['D', 'C', 'B', 'A'].map(c => {
                const h = (b[c] / max) * (H - 10)
                y -= h
                return <rect key={c} x={x} y={y} width={BAR} height={Math.max(h, 0)}
                             fill={CLASS_FILL[c]} rx="1" />
              })}
              <text x={x + BAR / 2} y={H + 16} textAnchor="middle"
                    className="fill-gray-500" style={{ fontSize: 10, fontWeight: 700 }}>
                {fmtWeek(b.week)}
              </text>
              <text x={x + BAR / 2} y={H + 29} textAnchor="middle"
                    className="fill-gray-400" style={{ fontSize: 9 }}>
                {metric === 'value'
                  ? fmtCompact(b.A + b.B + b.C + b.D)
                  : b.A + b.B + b.C + b.D}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Transition matrix ────────────────────────────────────────────────────────
function Matrix({ cells, metric, onSelect, selected }) {
  const grid = useMemo(() => {
    const g = {}
    for (const c of CLASSES) { g[c] = {}; for (const t of CLASSES) g[c][t] = { value: 0, skus: 0 } }
    for (const c of cells) {
      const cell = g[c.from_class]?.[c.to_class]
      if (!cell) continue
      // Opening value is what moved: the stock that was sitting in from_class.
      // Arrivals (N → x) have no opening value, so they carry closing instead.
      cell.value += Number(c.from_class === 'N' ? c.closing_value : c.opening_value)
      cell.skus  += Number(c.sku_count)
    }
    return g
  }, [cells])

  const movedMax = useMemo(() => {
    let m = 0
    for (const f of CLASSES) for (const t of CLASSES) {
      if (f !== t) m = Math.max(m, metric === 'value' ? grid[f][t].value : grid[f][t].skus)
    }
    return m || 1
  }, [grid, metric])

  function cellStyle(f, t) {
    if (f === t) return 'bg-gray-50 text-gray-600'
    const amount = metric === 'value' ? grid[f][t].value : grid[f][t].skus
    if (!amount) return 'text-gray-300'
    const weight = Math.min(1, amount / movedMax)
    const step = weight > 0.66 ? 3 : weight > 0.33 ? 2 : 1
    const improved = RANK[t] < RANK[f]
    if (improved) return ['bg-brand-light text-brand-dark', 'bg-brand-light text-brand-dark',
                          'bg-brand text-white'][step - 1]
    return ['bg-brand-red-light text-brand-red-dark', 'bg-brand-red-light text-brand-red-dark',
            'bg-brand-red text-white'][step - 1]
  }

  const rowTotal = f => CLASSES.reduce((s, t) => s + (metric === 'value' ? grid[f][t].value : grid[f][t].skus), 0)
  const colTotal = t => CLASSES.reduce((s, f) => s + (metric === 'value' ? grid[f][t].value : grid[f][t].skus), 0)
  const show = v => (metric === 'value' ? fmtCompact(v) : v)

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="w-24" />
            <th colSpan={CLASSES.length}
                className="text-[10px] font-bold uppercase tracking-wide text-gray-400 pb-1">
              Class this period
            </th>
            <th />
          </tr>
          <tr>
            <th className="text-[10px] font-bold uppercase tracking-wide text-gray-400 text-right pr-2">
              Was
            </th>
            {CLASSES.map(t => (
              <th key={t} className={`w-20 text-xs font-bold text-gray-600 pb-1 ${t === 'N' ? 'border-l border-gray-200' : ''}`}>
                {t}
              </th>
            ))}
            <th className="w-20 text-[10px] font-bold uppercase tracking-wide text-gray-400">Total</th>
          </tr>
        </thead>
        <tbody>
          {CLASSES.map(f => (
            <tr key={f} className={f === 'N' ? 'border-t border-gray-200' : ''}>
              <th className="text-xs font-bold text-gray-600 text-right pr-2">{f}</th>
              {CLASSES.map(t => {
                const cell = grid[f][t]
                const amount = metric === 'value' ? cell.value : cell.skus
                const isSel = selected && selected.from === f && selected.to === t
                return (
                  <td key={t} className={t === 'N' ? 'border-l border-gray-200' : ''}>
                    <button
                      type="button"
                      onClick={() => amount && onSelect({ from: f, to: t })}
                      disabled={!amount}
                      aria-label={`${CLASS_LABEL[f]} to ${CLASS_LABEL[t]}: ${fmt(cell.value)}, ${cell.skus} SKUs`}
                      className={`w-full rounded-md px-1 py-2 leading-tight transition-colors
                        focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1
                        ${cellStyle(f, t)} ${amount ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
                        ${isSel ? 'ring-2 ring-offset-1 ring-gray-800' : ''}`}>
                      <span className="block text-sm font-bold tabular-nums">{amount ? show(amount) : '·'}</span>
                      <span className="block text-[10px] opacity-70 tabular-nums">
                        {cell.skus ? `${cell.skus} sku` : '\u00A0'}
                      </span>
                    </button>
                  </td>
                )
              })}
              <td className="text-right text-xs font-bold text-gray-500 tabular-nums pl-1">
                {show(rowTotal(f))}
              </td>
            </tr>
          ))}
          <tr>
            <th className="text-[10px] font-bold uppercase tracking-wide text-gray-400 text-right pr-2">Total</th>
            {CLASSES.map(t => (
              <td key={t} className="text-center text-xs font-bold text-gray-500 tabular-nums pt-1">
                {show(colTotal(t))}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Drill-through ────────────────────────────────────────────────────────────
function Detail({ rows, loading, selection, onClose }) {
  if (!selection) return null
  return (
    <div className="mt-6 border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-bold text-gray-800">
          {CLASS_LABEL[selection.from]} → {CLASS_LABEL[selection.to]}
          <span className="ml-2 font-medium text-gray-500">{rows.length} SKUs</span>
        </h3>
        <button onClick={onClose}
          className="text-xs font-bold text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand rounded px-2 py-1">
          Close
        </button>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-gray-500 text-center">Nothing moved between these classes.</p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-white sticky top-0 shadow-[0_1px_0_0_#e5e7eb]">
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 font-bold">SKU</th>
                <th className="px-4 py-2 font-bold">Product</th>
                <th className="px-4 py-2 font-bold">Location</th>
                <th className="px-4 py-2 font-bold text-right">Was</th>
                <th className="px-4 py-2 font-bold text-right">Now</th>
                <th className="px-4 py-2 font-bold text-right">Revenue then</th>
                <th className="px-4 py-2 font-bold text-right">Revenue now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={`${r.location_id}-${r.sku}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.sku}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">{r.product_name || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{r.location_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(r.opening_value)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(r.closing_value)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                    {r.opening_revenue == null ? '—' : fmt(r.opening_revenue)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                    {r.closing_revenue == null ? '—' : fmt(r.closing_revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function StockHistoryReport() {
  const [locations, setLocations] = useState([])
  const [weeks,     setWeeks]     = useState([])
  const [trendRows, setTrendRows] = useState([])
  const [cells,     setCells]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState(null)

  const [locationId, setLocationId] = useState('all')
  const [period,     setPeriod]     = useState(DEFAULT_PERIOD)
  const [metric,     setMetric]     = useState('value')

  const [selection,  setSelection]  = useState(null)
  const [detail,     setDetail]     = useState([])
  const [detailBusy, setDetailBusy] = useState(false)

  const locationIds = locationId === 'all' ? null : [Number(locationId)]

  useEffect(() => { loadBase() }, [])

  async function loadBase() {
    setLoading(true)
    const [locs, snaps, trend] = await Promise.all([
      supabase.from('stock_locations').select('id, name, location_type').eq('is_active', true).order('name'),
      supabase.from('stock_snapshots').select('week_start, total_value').eq('status', 'complete').order('week_start'),
      supabase.from('v_stock_class_weekly').select('week_start, location_id, abc_class, sku_count, stock_value'),
    ])
    if (locs.error || snaps.error || trend.error) {
      setError((locs.error || snaps.error || trend.error).message)
    }
    setLocations(locs.data || [])
    setWeeks((snaps.data || []).map(s => s.week_start))
    setTrendRows(trend.data || [])
    setLoading(false)
  }

  const loadMatrix = useCallback(async () => {
    setBusy(true); setError(null); setSelection(null); setDetail([])
    const { data, error } = await supabase.rpc('get_stock_transition_matrix', {
      p_to_week: null, p_from_week: null, p_location_ids: locationIds, p_weeks_back: period,
    })
    if (error) setError(error.message)
    setCells(data || [])
    setBusy(false)
  }, [locationId, period])

  useEffect(() => { if (!loading) loadMatrix() }, [loading, loadMatrix])

  async function openCell(sel) {
    setSelection(sel); setDetailBusy(true)
    const { data, error } = await supabase.rpc('get_stock_transition_detail', {
      p_from_class: sel.from, p_to_class: sel.to,
      p_to_week: cells[0]?.to_week ?? null, p_from_week: cells[0]?.from_week ?? null,
      p_location_ids: locationIds,
    })
    if (error) setError(error.message)
    setDetail(data || [])
    setDetailBusy(false)
  }

  const visibleTrend = useMemo(
    () => (locationId === 'all' ? trendRows : trendRows.filter(r => r.location_id === Number(locationId))),
    [trendRows, locationId],
  )

  const latest = weeks[weeks.length - 1]
  const latestTotals = useMemo(() => {
    const rows = visibleTrend.filter(r => r.week_start === latest)
    const total = rows.reduce((s, r) => s + Number(r.stock_value), 0)
    const dead  = rows.filter(r => r.abc_class === 'D').reduce((s, r) => s + Number(r.stock_value), 0)
    return { total, dead, share: total ? (dead / total) * 100 : 0 }
  }, [visibleTrend, latest])

  if (loading) return <Spinner />

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label htmlFor="loc" className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
            Location
          </label>
          <select id="loc" value={locationId} onChange={e => setLocationId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium bg-white
              focus:outline-none focus:ring-2 focus:ring-brand">
            <option value="all">All locations</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}{l.location_type === 'warehouse' ? ' (warehouse)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Compare against</span>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`px-3 py-2 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand
                  ${period === p.id ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Show</span>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {[['value', 'Value'], ['skus', 'SKUs']].map(([id, label]) => (
              <button key={id} onClick={() => setMetric(id)}
                className={`px-3 py-2 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand
                  ${metric === id ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-brand-red-light border border-brand-red/20 text-sm font-medium text-brand-red-dark">
          {error}
        </div>
      )}

      {weeks.length === 0 ? (
        <Empty title="No snapshots captured yet"
               body="The first weekly capture runs Wednesday at 04:00. Once it lands, stock value by class appears here." />
      ) : (
        <>
          {/* Headline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Stock on hand, at cost</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(latestTotals.total)}</p>
              <p className="text-xs text-gray-500">Week of {fmtWeek(latest)}</p>
            </div>
            <div className="border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Sitting in class D</p>
              <p className="text-2xl font-bold text-brand-red tabular-nums">{fmt(latestTotals.dead)}</p>
              <p className="text-xs text-gray-500">{latestTotals.share.toFixed(0)}% of stock value</p>
            </div>
            <div className="border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Weeks captured</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{weeks.length}</p>
              <p className="text-xs text-gray-500">Since {fmtWeek(weeks[0])}</p>
            </div>
          </div>

          {/* Trend */}
          <section className="mb-10">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-800">Stock by class, week by week</h2>
              <div className="flex gap-3">
                {['A', 'B', 'C', 'D'].map(c => (
                  <span key={c} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: CLASS_FILL[c] }} />
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <Trend rows={visibleTrend} weeks={weeks} metric={metric} />
          </section>

          {/* Matrix */}
          <section>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-sm font-bold text-gray-800">What moved between classes</h2>
              {cells.length > 0 && (
                <p className="text-xs text-gray-500">
                  {fmtWeek(cells[0].from_week)} → {fmtWeek(cells[0].to_week)}
                </p>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-4 max-w-2xl">
              Blue is stock that moved to a faster-selling class, red is stock that slowed down.
              The diagonal stayed put. Classification uses a rolling 90-day window, so read the value
              in a cell before its SKU count — a product sitting on a class boundary will cross it
              on ordinary sales variation.
            </p>

            {busy ? <Spinner /> : cells.length === 0 ? (
              <Empty title="Not enough history yet"
                     body={weeks.length < 2
                       ? 'Movement needs two captures to compare. The next one runs Wednesday at 04:00.'
                       : 'No movement found for this location over this period.'} />
            ) : (
              <>
                <Matrix cells={cells} metric={metric} onSelect={openCell} selected={selection} />
                <p className="text-xs text-gray-400 mt-3">Select any cell to see the products behind it.</p>
                <Detail rows={detail} loading={detailBusy} selection={selection}
                        onClose={() => { setSelection(null); setDetail([]) }} />
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
