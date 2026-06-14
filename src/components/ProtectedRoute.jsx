import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

// roles: tableau de rangs autorisés, ex: ['direction'] ou ['direction','responsable']
export default function ProtectedRoute({ children, roles = [] }) {
  const [loading, setLoading] = useState(true)
  const [membre, setMembre]   = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('sdm_membre')
    if (stored) { setMembre(JSON.parse(stored)); setLoading(false); return }
    setLoading(false)
  }, [])

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
    </div>
  )

  if (!membre) return <Navigate to="/login" replace />

  // Autres rôles restreints
  if (roles.length > 0 && !roles.includes(membre.rang))
    return <Navigate to="/dashboard" replace />

  return children
}