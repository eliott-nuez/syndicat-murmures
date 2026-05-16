import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useInactivityLogout } from '../hooks/useInactivityLogout'

// ── Icônes SVG ────────────────────────────────────────────────────────────────

const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35"
    strokeLinecap="round" strokeLinejoin="round"
    width="17" height="17" style={{ flexShrink: 0 }}>
    {children}
  </svg>
)

/** Dashboard — Rouage / mécanisme ancien */
const IcoDashboard = () => (
  <Ico>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </Ico>
)

/** Ma fiche perso — Silhouette encapuchonnée */
const IcoFichePerso = () => (
  <Ico>
    <circle cx="12" cy="8.5" r="2.5"/>
    <path d="M7.5 9Q7 4 12 3Q17 4 16.5 9"/>
    <path d="M7.5 22H16.5L17 14Q17 12 14 11.5Q13 11 12 11Q11 11 10 11.5Q7 12 7 14Z"/>
  </Ico>
)

/** Calendrier — Parchemin avec lignes */
const IcoCalendrier = () => (
  <Ico>
    <rect x="4" y="6" width="16" height="15" rx="1.5"/>
    <path d="M4 10H20"/>
    <path d="M8 6V3.5M16 6V3.5"/>
    <path d="M7 14h4M7 17.5h7M13 14h3"/>
  </Ico>
)

/** Stock & Catalogue — Lingots + registre */
const IcoStock = () => (
  <Ico>
    <rect x="2"   y="16.5" width="9" height="3"   rx="0.6"/>
    <rect x="3"   y="13"   width="7" height="3"   rx="0.6"/>
    <rect x="4.5" y="9.5"  width="4" height="3"   rx="0.6"/>
    <rect x="13"  y="7"    width="8" height="13"  rx="1"/>
    <path d="M15 10.5h4M15 13h4M15 15.5h2.5"/>
  </Ico>
)

/** Ventes groupe — Balance / échange */
const IcoVentes = () => (
  <Ico>
    <line x1="12" y1="4" x2="12" y2="21"/>
    <path d="M9 21H15"/>
    <path d="M4 9H20"/>
    <path d="M4 9Q3.5 15 7.5 16Q11.5 15 11 9"/>
    <path d="M13 9Q12.5 15 16.5 16Q20.5 15 20 9"/>
  </Ico>
)

/** Fiche membre — Blason / sceau */
const IcoFicheMembre = () => (
  <Ico>
    <path d="M12 2L4 5.5V12C4 16.8 7.5 21 12 22.5C16.5 21 20 16.8 20 12V5.5Z"/>
    <path d="M12 7.5L13.5 11H17L14.2 13L15.2 16.5L12 14.5L8.8 16.5L9.8 13L7 11H10.5Z"/>
  </Ico>
)

/** Tricount — Trois nœuds / chaîne de répartition */
const IcoTricount = () => (
  <Ico>
    <circle cx="12"  cy="4.5"  r="2.2"/>
    <circle cx="5"   cy="18.5" r="2.2"/>
    <circle cx="19"  cy="18.5" r="2.2"/>
    <path d="M10.8 6.4L6.5 16.4"/>
    <path d="M13.2 6.4L17.5 16.4"/>
    <path d="M7.2 18.5H16.8"/>
  </Ico>
)

/** Blanchiment — Alambic alchimique */
const IcoBlanchiment = () => (
  <Ico>
    <path d="M10 9V5H14V9"/>
    <path d="M10 9Q7 10.5 6 14.5Q6 20 12 20Q18 20 18 14.5Q17 10.5 14 9Z"/>
    <circle cx="9.5"  cy="15" r="1"   fill="currentColor" strokeWidth="0" opacity="0.55"/>
    <circle cx="13.5" cy="13" r="1.3" fill="currentColor" strokeWidth="0" opacity="0.55"/>
    <path d="M12 14V17" strokeWidth="1.1" opacity="0.7"/>
  </Ico>
)

/** Comptabilité — Livre ouvert + plume */
const IcoComptabilite = () => (
  <Ico>
    <path d="M4 5Q4 3 6 3H11V21H6Q4 21 4 19Z"/>
    <path d="M20 5Q20 3 18 3H13V21H18Q20 21 20 19Z"/>
    <line x1="11" y1="3"  x2="11" y2="21"/>
    <line x1="13" y1="3"  x2="13" y2="21"/>
    <path d="M6 8h4M6 11h3M6 14h4"/>
    <path d="M15.5 7.5Q19.5 6.5 19 14L17 12.5"/>
    <path d="M17 12.5L15.5 18" strokeWidth="1.1"/>
  </Ico>
)

/** Administration — Parchemin scellé */
const IcoAdmin = () => (
  <Ico>
    <path d="M4 7Q4 4 7 4H17Q20 4 20 7V17Q20 21 17 21H7Q4 21 4 17Z"/>
    <path d="M4 8Q4.5 5.5 7 5.5"/>
    <path d="M20 8Q19.5 5.5 17 5.5"/>
    <path d="M4 17Q4.5 19.5 7 19.5"/>
    <path d="M20 17Q19.5 19.5 17 19.5"/>
    <circle cx="12" cy="12.5" r="3.5"/>
    <path d="M12 10v5M9.5 12.5h5"/>
  </Ico>
)

// ── Navigation ─────────────────────────────────────────────────────────────

const NAV_TOUS = [
  { to: '/dashboard',  label: 'Dashboard',      icon: <IcoDashboard /> },
  { to: '/fiche',      label: 'Ma fiche perso',  icon: <IcoFichePerso /> },
  { to: '/calendrier', label: 'Calendrier',      icon: <IcoCalendrier /> },
]
const NAV_RESPONSABLE = [
  { to: '/recap-global',  label: 'Comptabilité',      icon: <IcoComptabilite /> },
  { to: '/stock',         label: 'Stock & Catalogue',  icon: <IcoStock /> },
  { to: '/ventes-groupe', label: 'Ventes groupe',      icon: <IcoVentes /> },
]
const NAV_DIRECTION = [
  { to: '/fiche-membre', label: 'Fiche membre',   icon: <IcoFicheMembre /> },
  { to: '/tricount',     label: 'Tricount',        icon: <IcoTricount /> },
  { to: '/blanchiment',  label: 'Blanchiment',     icon: <IcoBlanchiment /> },
  { to: '/admin',        label: 'Administration',  icon: <IcoAdmin /> },
]

// ── Layout ─────────────────────────────────────────────────────────────────

export default function Layout({ children }) {
  const navigate = useNavigate()
  const membre   = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  useInactivityLogout()
  const rang = membre.rang || 'membre'

  const handleLogout = async () => {
    const stored = localStorage.getItem('sdm_membre')
    if (stored) {
      const m = JSON.parse(stored)
      await supabase.from('membres').update({ actif: false }).eq('id', m.id)
    }
    await supabase.auth.signOut()
    localStorage.removeItem('sdm_membre')
    navigate('/')
  }

  const isResponsable = ['responsable', 'direction'].includes(rang)
  const isDirection   = rang === 'direction'

  const navItems = [
    ...NAV_TOUS,
    ...(isResponsable ? NAV_RESPONSABLE : []),
    ...(isDirection   ? NAV_DIRECTION   : []),
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
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
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.2em', color: 'var(--or)', marginBottom: 4 }}>
            Le Syndicat
          </div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 13, letterSpacing: '0.15em', color: 'var(--or-pale)' }}>
            des Murmures
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--texte-soft)', letterSpacing: '0.1em' }}>
            {membre.surnom}
            <span style={{
              marginLeft: 8, padding: '2px 7px',
              background: 'var(--or-glow)', border: '1px solid var(--or-border)',
              borderRadius: 10, fontSize: 9, color: 'var(--or)',
              letterSpacing: '0.12em', textTransform: 'uppercase',
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
              {item.icon}
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
