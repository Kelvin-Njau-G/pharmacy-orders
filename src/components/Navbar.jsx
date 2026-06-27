import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function AfyaNzimaIcon({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="20,2 37,11.5 37,28.5 20,38 3,28.5 3,11.5" fill="#E63323"/>
      <rect x="16.5" y="10" width="7" height="19" rx="1.5" fill="white"/>
      <rect x="10" y="16.5" width="20" height="7" rx="1.5" fill="white"/>
      <path d="M 9 33 Q 14.5 37.5 20 36 Q 25.5 37.5 31 33" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

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
          <AfyaNzimaIcon size={34} />
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
