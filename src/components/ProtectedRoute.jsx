import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import FacilityPicker from './FacilityPicker'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
    </div>
  )
}

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading, mustChangePassword,
          needsFacilityPick, assignedFacilities, switchFacility } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user)   return <Navigate to="/login" replace />

  if (mustChangePassword && location.pathname !== '/reset-password')
    return <Navigate to="/reset-password" replace />

  // Show facility picker before the app when staff has multiple facilities
  if (needsFacilityPick)
    return <FacilityPicker facilities={assignedFacilities} profile={profile} onSelect={switchFacility} />

  if (adminOnly && !profile) return <Spinner />
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/dashboard" replace />

  return children
}
