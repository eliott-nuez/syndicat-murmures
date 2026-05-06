import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const NAV_TOUS = [
  { to: '/dashboard',   label: 'Dashboard',      icon: '◈' },
  { to: '/fiche',       label: 'Ma fiche perso',  icon: '◉' },
  { to: '/calendrier',  label: 'Calendrier',      icon: '◻' },
]
const NAV_RESPONSABLE = [
  { to: '/recap-global', label: 'Récap global',  icon: '◎' },
  { to: '/stock',        label: 'Stock',          icon: '◇' },
]
const NAV_DIRECTION = [
  { to: '/fiche-membre', label: 'Fiche membre',   icon: '◉' },
  { to: '/drogues',      label: 'Drogues',         icon: '◈' },
  { to: '/tricount',     label: 'Tricount',        icon: '◆' },
  { to: '/blanchiment',  label: 'Blanchiment',     icon: '◈' },
  { to: '/admin',        label: 'Administration',  icon: '⬡' },
]

export default function Layout({ children }) {
  const navigate   = useNavigate()
  const membre     = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const rang       = membre.rang || 'membre'

  const handleLogout = async () => {
    const stored = localStorage.getItem('sdm_membre')
    if (stored) {
      const m = JSON.parse(stored)
      await supabase.from('membres').update({ actif: false }).eq('id', m.id)
    }
    localStorage.removeItem('sdm_membre')
    navigate('/')
  }

  const isResponsable = ['responsable','direction'].includes(rang)
  const isDirection   = rang === 'direction'

  const navItems = [
    ...NAV_TOUS,
    ...(isResponsable ? NAV_RESPONSABLE : []),
    ...(isDirection   ? NAV_DIRECTION   : []),
  ]

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--noir-card)',
        borderRight: '1px solid var(--or-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '28px 0',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}>
        {/* Logo */}
        <div style={{ padding: '0 24px 28px', borderBottom: '1px solid var(--or-border)' }}>
          <div style={{
            fontFamily: 'var(--font-titre)',
            fontSize: 11,
            letterSpacing: '0.2em',
            color: 'var(--or)',
            marginBottom: 4,
          }}>Le Syndicat</div>
          <div style={{
            fontFamily: 'var(--font-titre)',
            fontSize: 13,
            letterSpacing: '0.15em',
            color: 'var(--or-pale)',
          }}>des Murmures</div>
          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--texte-soft)', letterSpacing: '0.1em' }}>
            {membre.surnom}
            <span style={{
              marginLeft: 8,
              padding: '2px 7px',
              background: 'var(--or-glow)',
              border: '1px solid var(--or-border)',
              borderRadius: 10,
              fontSize: 9,
              color: 'var(--or)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>{rang}</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 24px',
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 500,
              color: isActive ? 'var(--or-pale)' : 'var(--texte-soft)',
              background: isActive ? 'var(--or-glow)' : 'transparent',
              borderRight: isActive ? '2px solid var(--or)' : '2px solid transparent',
              transition: 'var(--transition)',
              textDecoration: 'none',
            })}>
              <span style={{ fontSize: 14, color: 'inherit' }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: '0 16px' }}>
          <button onClick={handleLogout} className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }}>
            ⎋ Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Contenu ── */}
      <main style={{ flex: 1, padding: '36px 40px', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
