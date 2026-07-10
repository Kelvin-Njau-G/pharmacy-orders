import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
    </div>
  )
}

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth()

  // Auth check (localStorage read) — should be instant
  if (loading) return <Spinner />

  // Not logged in
  if (!user) return <Navigate to="/login" replace />

  // Profile is still loading from the network (brief background fetch).
  // Show spinner only for admin routes where we need the role to decide routing.
  // For regular routes, let the child render — it handles null profile gracefully.
  if (adminOnly && !profile) return <Spinner />
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/dashboard" replace />

  return children
}
