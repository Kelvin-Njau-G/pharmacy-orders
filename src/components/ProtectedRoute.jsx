import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
    </div>
  )
}

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading, mustChangePassword } = useAuth()
  const location = useLocation()

  // Auth check (localStorage read) — should be instant
  if (loading) return <Spinner />

  // Not logged in
  if (!user) return <Navigate to="/login" replace />

  // Force password change on first login (admin-created accounts)
  if (mustChangePassword && location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password" replace />
  }

  // Profile is still loading from the network (brief background fetch).
  // Show spinner only for admin routes where we need the role to decide routing.
  // For regular routes, let the child render — it handles null profile gracefully.
  if (adminOnly && !profile) return <Spinner />
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/dashboard" replace />

  return children
}
