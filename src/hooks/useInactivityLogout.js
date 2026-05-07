import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const WARN_MS    = 29 * 60 * 1000 // avertissement à 29 min

export function useInactivityLogout() {
  const navigate  = useNavigate()
  const timerRef  = useRef(null)
  const warnRef   = useRef(null)

  const logout = useCallback(async () => {
    const stored = localStorage.getItem('sdm_membre')
    if (stored) {
      const m = JSON.parse(stored)
      await supabase.from('membres').update({ actif: false }).eq('id', m.id)
    }
    await supabase.auth.signOut()
    localStorage.removeItem('sdm_membre')
    navigate('/', { replace: true })
  }, [navigate])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (warnRef.current)  clearTimeout(warnRef.current)

    warnRef.current  = setTimeout(() => {
      // Mettre actif: false 1 min avant la déconnexion (visible sur le dashboard)
      const stored = localStorage.getItem('sdm_membre')
      if (stored) {
        const m = JSON.parse(stored)
        supabase.from('membres').update({ actif: false }).eq('id', m.id)
      }
    }, WARN_MS)

    timerRef.current = setTimeout(logout, TIMEOUT_MS)
  }, [logout])

  // Remettre actif: true dès qu'il y a de l'activité
  const handleActivity = useCallback(() => {
    const stored = localStorage.getItem('sdm_membre')
    if (stored) {
      const m = JSON.parse(stored)
      // Remettre actif seulement si on était passé inactif
      supabase.from('membres').update({ actif: true }).eq('id', m.id)
    }
    resetTimer()
  }, [resetTimer])

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    resetTimer() // démarrer le timer au montage

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity))
      if (timerRef.current) clearTimeout(timerRef.current)
      if (warnRef.current)  clearTimeout(warnRef.current)
    }
  }, [handleActivity, resetTimer])
}
