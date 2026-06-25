import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [ready,       setReady]       = useState(false)
  const [sessionError,setSessionError]= useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let resolved = false

    function markReady() {
      if (resolved) return
      resolved = true
      // Remove the token from the visible URL now that we're done with it
      window.history.replaceState({}, '', '/reset-password')
      setReady(true)
    }

    // Strategy: Supabase automatically processes the recovery token from the
    // URL hash when the page loads. We must NOT touch setSession() manually —
    // that would double-consume the token. Instead we simply wait for Supabase
    // to signal it's done, via the event listener or getSession().

    // 1. If Supabase already processed the token before this component mounted
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady()
    })

    // 2. If Supabase processes the token after this component mounted
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') markReady()
    })

    // 3. Fallback: if nothing fires after 8 seconds, the link has expired
    const timeout = setTimeout(() => {
      if (!resolved) {
        setSessionError(
          'This reset link is invalid or has expired. Please go back and request a new one.'
        )
      }
    }, 8000)

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm)  { setError('Passwords do not match.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) { setError(error.message); return }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-700 rounded-xl mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-blue-900 tracking-tight">Set your password</h1>
          <p className="text-sm text-gray-500 mt-1">Choose a password for your PharmOrders account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {sessionError ? (
            <div className="text-center">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-4 mb-5">
                <p className="text-sm text-red-600">{sessionError}</p>
              </div>
              <button onClick={() => navigate('/login')}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                ← Back to sign in
              </button>
            </div>

          ) : !ready ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Verifying your reset link…</p>
            </div>

          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required autoComplete="new-password" autoFocus
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="At least 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                <input
                  type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Re-enter your password"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2.5 px-4
                  rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? 'Saving…' : 'Save password and continue'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
