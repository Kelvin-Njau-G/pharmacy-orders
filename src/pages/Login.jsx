import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function AfyaNzimaIcon({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="20,2 37,11.5 37,28.5 20,38 3,28.5 3,11.5" fill="#E63323"/>
      <rect x="16.5" y="10" width="7" height="19" rx="1.5" fill="white"/>
      <rect x="10" y="16.5" width="20" height="7" rx="1.5" fill="white"/>
      <path d="M 9 33 Q 14.5 37.5 20 36 Q 25.5 37.5 31 33" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError('Incorrect email or password. Please try again.')
    else navigate('/dashboard')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <AfyaNzimaIcon size={64} />
          </div>
          <h1 className="text-2xl font-extrabold text-brand tracking-tight">AfyaNzima Orders</h1>
          <p className="text-xs font-semibold text-gray-400 mt-1 tracking-widest uppercase">Ishi Maisha Yenye Afya</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <p className="text-sm text-gray-500 font-medium mb-5 text-center">Sign in to manage your orders</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Email address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="current-password"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-brand-red-light border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-brand-red font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-2.5 px-4
                rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 font-medium">
          Contact your administrator if you need help with your login.
        </p>
      </div>
    </div>
  )
}
