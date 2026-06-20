import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link to="/dashboard" className="font-bold text-blue-900 text-base tracking-tight">
          PharmOrders
        </Link>
        {isAdmin && (
          <Link to="/admin" className="text-sm text-gray-500 hover:text-blue-700 font-medium transition-colors">
            Admin console
          </Link>
        )}
      </div>
      <div className="flex items-center gap-5">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-gray-800 leading-tight">{profile?.full_name}</p>
          <p className="text-xs text-gray-400 leading-tight">{profile?.pharmacy_location}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-400 hover:text-red-600 font-medium transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
