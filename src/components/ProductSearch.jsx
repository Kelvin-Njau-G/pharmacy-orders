import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Fuse from 'fuse.js'
import { fetchProducts } from '../lib/googleSheets'

export default function ProductSearch({ value, onSelect, disabled }) {
  const [query,       setQuery]       = useState(value || '')
  const [results,     setResults]     = useState([])
  const [open,        setOpen]        = useState(false)
  const [statusMsg,   setStatusMsg]   = useState('Loading catalog…')
  const [statusColor, setStatusColor] = useState('text-gray-400')
  const [dropPos,     setDropPos]     = useState({ top: 0, left: 0, width: 0 })
  const fuseRef  = useRef(null)
  const inputRef = useRef(null)
  const wrapRef  = useRef(null)

  // Load product catalog once on mount
  useEffect(() => {
    fetchProducts()
      .then(products => {
        if (products.length === 0) {
          setStatusMsg('⚠ No products found in your Google Sheet.')
          setStatusColor('text-amber-600')
          return
        }
        fuseRef.current = new Fuse(products, {
          keys: ['name'],
          threshold: 0.5,
          ignoreLocation: true,
          minMatchCharLength: 2,
          includeScore: true,
        })
        setStatusMsg(`${products.length} products loaded`)
        setStatusColor('text-gray-400')
      })
      .catch(err => {
        setStatusMsg(`⚠ Could not load catalog: ${err.message}`)
        setStatusColor('text-red-500')
      })
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Calculate dropdown position relative to viewport (fixed positioning
  // so it escapes the table's overflow:hidden container)
  function updateDropPos() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 2, left: r.left, width: r.width })
    }
  }

  function search(q) {
    setQuery(q)
    updateDropPos()
    if (!q.trim() || !fuseRef.current) { setResults([]); setOpen(false); return }
    const hits = fuseRef.current.search(q).slice(0, 10).map(r => r.item)
    setResults(hits)
    setOpen(hits.length > 0 || q.length > 0)
  }

  function pick(product) {
    setQuery(product.name)
    setOpen(false)
    onSelect(product)
  }

  function useManual() {
    setOpen(false)
    onSelect({ name: query, sku: '', unitPrice: '' })
  }

  const dropdown = open && (
    <div
      style={{
        position: 'fixed',
        top:   dropPos.top,
        left:  dropPos.left,
        width: dropPos.width,
        zIndex: 9999,
      }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
    >
      {results.map((p, i) => (
        <button
          key={i}
          type="button"
          onMouseDown={() => pick(p)}
          className="w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 flex items-center justify-between group"
        >
          <span className="font-medium text-gray-800 truncate pr-2">{p.name}</span>
          <span className="text-xs text-gray-400 group-hover:text-blue-500 shrink-0">{p.sku}</span>
        </button>
      ))}
      {query && (
        <button
          type="button"
          onMouseDown={useManual}
          className="w-full px-3 py-2.5 text-left text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 font-medium"
        >
          + Enter "{query}" manually
        </button>
      )}
    </div>
  )

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => search(e.target.value)}
        onFocus={() => { updateDropPos(); if (query && results.length > 0) setOpen(true) }}
        disabled={disabled}
        placeholder="Search product name…"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:bg-gray-50 disabled:text-gray-400"
      />
      <p className={`text-xs mt-0.5 ${statusColor}`}>{statusMsg}</p>
      {createPortal(dropdown, document.body)}
    </div>
  )
}
