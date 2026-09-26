import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/afyanzima-icon.png'

export default function Navbar() {
  const { profile, isAdmin, signOut, assignedFacilities, switchFacility } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const isMultiFacility = assignedFacilities.length > 1

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
          <Link to="/admin" className="text-sm text-gray-500 hover:text-brand font-semibold transition-colors">
            Admin console
          </Link>
        )}
      </div>

      <div className="flex items-center gap-5">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-bold text-gray-800 leading-tight">{profile?.full_name}</p>

          {/* Facility switcher for multi-facility staff */}
          {isMultiFacility ? (
            <div className="relative inline-block">
              <button
                onClick={() => setOpen(v => !v)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                className="text-xs text-brand hover:text-brand-dark font-semibold
                  flex items-center gap-1 ml-auto focus:outline-none">
                {profile?.pharmacy_location}
                <svg className="w-3 h-3 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {open && (
                <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-gray-200
                  rounded-xl shadow-lg z-50 py-1.5 overflow-hidden">
                  <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Switch facility
                  </p>
                  {assignedFacilities.map(fac => {
                    const isActive = fac.name === profile?.pharmacy_location
                    return (
                      <button key={fac.id}
                        onMouseDown={() => { switchFacility(fac); setOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors
                          ${isActive ? 'bg-blue-50 text-brand font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>
                        {fac.name}
                        {isActive && <span className="ml-2 text-[10px] text-brand">✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 leading-tight">{profile?.pharmacy_location}</p>
          )}
        </div>

        <button onClick={handleSignOut}
          className="text-sm text-gray-400 hover:text-brand-red font-semibold transition-colors">
          Sign out
        </button>
      </div>
    </nav>
  )
}
