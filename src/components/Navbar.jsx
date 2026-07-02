import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/afyanzima-icon.png'

export default function Navbar() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <img src={logo} alt="AfyaNzima" className="h-9 w-auto" />
          <div>
            <p className="font-extrabold text-brand text-sm leading-tight tracking-tight">AfyaNzima</p>
            <p className="text-[10px] font-semibold text-gray-400 leading-tight tracking-wide uppercase">Orders</p>
          </div>
        </Link>
        {isAdmin && (
          <Link to="/admin"
            className="text-sm text-gray-500 hover:text-brand font-semibold transition-colors">
            Admin console
          </Link>
        )}
      </div>
      <div className="flex items-center gap-5">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-bold text-gray-800 leading-tight">{profile?.full_name}</p>
          <p className="text-xs text-gray-400 leading-tight">{profile?.pharmacy_location}</p>
        </div>
        <button onClick={handleSignOut}
          className="text-sm text-gray-400 hover:text-brand-red font-semibold transition-colors">
          Sign out
        </button>
      </div>
    </nav>
  )
}
