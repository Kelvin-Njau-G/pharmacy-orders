import { useState, useEffect, useRef } from 'react'
import Fuse from 'fuse.js'
import { fetchProducts } from '../lib/googleSheets'

export default function ProductSearch({ value, onSelect, disabled }) {
  const [query,        setQuery]        = useState(value || '')
  const [results,      setResults]      = useState([])
  const [open,         setOpen]         = useState(false)
  const [statusMsg,    setStatusMsg]    = useState('Loading catalog…')
  const [statusColor,  setStatusColor]  = useState('text-gray-400')
  const [productCount, setProductCount] = useState(0)
  const fuseRef  = useRef(null)
  const wrapRef  = useRef(null)

  useEffect(() => {
    fetchProducts()
      .then(products => {
        if (products.length === 0) {
          setStatusMsg('⚠ No products found in your Google Sheet. Check the Sheet ID and tab name.')
          setStatusColor('text-amber-600')
          return
        }
        fuseRef.current = new Fuse(products, {
          keys: ['name'], threshold: 0.4, includeScore: true,
        })
        setProductCount(products.length)
        setStatusMsg('')   // clear — show placeholder instead
      })
      .catch(err => {
        setStatusMsg(`⚠ Could not load catalog: ${err.message}`)
        setStatusColor('text-red-500')
      })
  }, [])

  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function search(q) {
    setQuery(q)
    if (!q.trim() || !fuseRef.current) { setResults([]); setOpen(false); return }
    const hits = fuseRef.current.search(q).slice(0, 10).map(r => r.item)
    setResults(hits)
    setOpen(true)
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

  const placeholder = statusMsg
    ? statusMsg
    : productCount > 0
      ? `Search ${productCount} products…`
      : 'Loading catalog…'

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => search(e.target.value)}
        onFocus={() => query && results.length > 0 && setOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:bg-gray-50 disabled:text-gray-400
          ${statusMsg && statusMsg.startsWith('⚠') ? 'placeholder-amber-500' : 'placeholder-gray-400'}`}
      />

      {statusMsg && statusMsg.startsWith('⚠') && (
        <p className={`text-xs mt-1 ${statusColor}`}>{statusMsg}</p>
      )}

      {open && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((p, i) => (
            <button key={i} type="button" onMouseDown={() => pick(p)}
              className="w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 flex items-center justify-between group">
              <span className="font-medium text-gray-800">{p.name}</span>
              <span className="text-xs text-gray-400 group-hover:text-blue-500">{p.sku}</span>
            </button>
          ))}
          {query && (
            <button type="button" onMouseDown={useManual}
              className="w-full px-3 py-2.5 text-left text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 font-medium">
              + Enter "{query}" manually
            </button>
          )}
        </div>
      )}
    </div>
  )
}
