import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useInactivityLogout } from '../hooks/useInactivityLogout'
import { getRangReel, getViewAsActif, activerViewAs, desactiverViewAs } from '../utils/viewAs'

// ── Icônes SVG ────────────────────────────────────────────────────────────────

const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
    strokeLinecap="round" strokeLinejoin="round"
    width="20" height="20" style={{ flexShrink: 0 }}>
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

/** Activités de groupe — Coffre-fort / braquage collectif */
const IcoActiviteGroupe = () => (
  <Ico>
    <rect x="4" y="10" width="16" height="10" rx="1.5"/>
    <circle cx="12" cy="15" r="2"/>
    <path d="M7 10V7Q7 4 12 4Q17 4 17 7V10"/>
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

/** Logs — Parchemin avec lignes de texte */
const IcoLogs = () => (
  <Ico>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
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

/** Armurerie — pistolet stylisé */
const IcoArmurerie = () => (
  <Ico>
    <path d="M3 14h9v-3h6a2 2 0 0 1 2 2v1h-2v3h-3v-3H9v3H6v-3H3z"/>
    <path d="M9 11V8h4v3"/>
  </Ico>
)

/** Garage — voiture vue de face */
const IcoGarage = () => (
  <Ico>
    <path d="M4 16v-3.5L6 8h12l2 4.5V16"/>
    <path d="M4 16h16v2.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V17h-9v1.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>
    <circle cx="7.5" cy="14" r="1.1"/>
    <circle cx="16.5" cy="14" r="1.1"/>
  </Ico>
)

/** Véhicule — voiture vue de côté */
const IcoVehicule = () => (
  <Ico>
    <path d="M3 16l1.5-5a2 2 0 0 1 1.9-1.4h11.2A2 2 0 0 1 19.5 11l1.5 5"/>
    <path d="M3 16h18v2a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-11v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>
    <circle cx="7.5" cy="16" r="1.3"/>
    <circle cx="16.5" cy="16" r="1.3"/>
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

/** Finance — pile de pièces */
const IcoFinance = () => (
  <Ico>
    <ellipse cx="12" cy="6" rx="7" ry="3"/>
    <path d="M5 6v5q0 3 7 3t7-3V6"/>
    <path d="M5 11v5q0 3 7 3t7-3v-5"/>
  </Ico>
)

/** Petit chevron pour ouvrir/fermer un sous-menu */
const IcoChevron = ({ open }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
       style={{ marginLeft: 'auto', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'var(--transition)' }}>
    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Contrats Familles — Calendrier avec coche */
const IcoContrats = () => (
  <Ico>
    <rect x="3" y="5" width="18" height="16" rx="1.5"/>
    <path d="M3 10H21"/>
    <path d="M8 3v4M16 3v4"/>
    <path d="M7 15.5l3 3 6.5-6.5"/>
  </Ico>
)

/** Suivi semaine — Calendrier hebdomadaire */
const IcoSuiviSemaine = () => (
  <Ico>
    <rect x="3" y="5" width="18" height="16" rx="1.5"/>
    <path d="M3 10H21"/>
    <path d="M8 3v4M16 3v4"/>
    <path d="M7 14h2M11 14h2M15 14h2M7 17.5h2M11 17.5h2"/>
  </Ico>
)

/** Gestion contrat — Parchemin signé */
const IcoGestionContrat = () => (
  <Ico>
    <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>
    <path d="M15 3v4h4"/>
    <path d="M8 12h8M8 15h8"/>
    <path d="M8 18.5l2-1.2 2 1.2 2-1.2 2 1.2"/>
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
  { to: '/dashboard',        label: 'Dashboard',           icon: <IcoDashboard /> },
  { to: '/calendrier',       label: 'Calendrier',           icon: <IcoCalendrier /> },
]
const NAV_RESPONSABLE = [
  { to: '/contrats-familles', label: 'Contrats Familles',  icon: <IcoContrats /> },
]
const NAV_DIRECTION = [
  { to: '/admin', label: 'Administration', icon: <IcoAdmin /> },
]

// Sous-menu "Stock" — regroupe la gestion des biens du gang
const STOCK_ITEMS = [
  { to: '/stock',      label: 'Stock & Catalogue', icon: <IcoStock />,     roles: ['responsable', 'direction'] },
  { to: '/armurerie',  label: 'Armurerie',         icon: <IcoArmurerie />, roles: ['membre', 'responsable', 'direction'] },
  { to: '/vehicules',  label: 'Véhicule',          icon: <IcoVehicule />,  roles: ['membre', 'responsable', 'direction'] },
  { to: '/garage',     label: 'Garage',            icon: <IcoGarage />,    roles: ['membre', 'responsable', 'direction'] },
  { to: '/logs',       label: 'Logs mouvements',   icon: <IcoLogs />,      roles: ['responsable', 'direction'] },
]

// Sous-menu "Contrats" — gestion des contrats avec les groupes externes
const CONTRAT_ITEMS = [
  { to: '/contrats/suivi',   label: 'Suivi semaine',   icon: <IcoSuiviSemaine />,   roles: ['responsable', 'direction'] },
  { to: '/contrats/gestion', label: 'Gestion contrat', icon: <IcoGestionContrat />, roles: ['responsable', 'direction'] },
]

// Sous-menu "Finance" — regroupe les pages liées à l'argent / fiches
const FINANCE_ITEMS = [
  { to: '/fiche',            label: 'Ma fiche perso',      icon: <IcoFichePerso />,      roles: ['membre', 'responsable', 'direction'] },
  { to: '/activite-groupe',  label: 'Activités de groupe', icon: <IcoActiviteGroupe />,  roles: ['membre', 'responsable', 'direction'] },
  { to: '/fiche-membre',     label: 'Fiche membre',        icon: <IcoFicheMembre />,     roles: ['direction'] },
  { to: '/ventes-groupe',    label: 'Ventes groupe',       icon: <IcoVentes />,          roles: ['responsable', 'direction'] },
  { to: '/recap-global',     label: 'Comptabilité',        icon: <IcoComptabilite />,    roles: ['responsable', 'direction'] },
  { to: '/blanchiment',      label: 'Blanchiment',         icon: <IcoBlanchiment />,     roles: ['direction'] },
  { to: '/tricount',         label: 'Tricount',            icon: <IcoTricount />,        roles: ['direction'] },
]

// ── Layout ─────────────────────────────────────────────────────────────────

export default function Layout({ children }) {
  const navigate  = useNavigate()
  const membre    = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  useInactivityLogout()

  const rangReel = getRangReel() || membre.rang || 'membre'
  const [viewAs, setViewAs] = useState(getViewAsActif)

  // Écoute les changements de simulation (même onglet)
  useEffect(() => {
    const handler = () => setViewAs(getViewAsActif())
    window.addEventListener('sdm_view_as_change', handler)
    return () => window.removeEventListener('sdm_view_as_change', handler)
  }, [])

  const rang         = viewAs || rangReel   // rang effectif pour la nav
  const isDirection  = rangReel === 'direction'
  const isResponsable = ['responsable', 'direction'].includes(rang)
  const isDir         = rang === 'direction'
  const isFamilles    = rang === 'familles'

  const handleViewAs = (val) => {
    if (val === 'direction') { desactiverViewAs(); setViewAs(null) }
    else { activerViewAs(val); setViewAs(val) }
  }

  const handleLogout = async () => {
    desactiverViewAs()
    const stored = localStorage.getItem('sdm_membre')
    if (stored) {
      const m = JSON.parse(stored)
      await supabase.from('membres').update({ actif: false }).eq('id', m.id)
    }
    await supabase.auth.signOut()
    localStorage.removeItem('sdm_membre')
    navigate('/')
  }

  const financeChildren = FINANCE_ITEMS.filter(item => item.roles.includes(rang))
  const stockChildren   = STOCK_ITEMS.filter(item => item.roles.includes(rang))
  const contratChildren = CONTRAT_ITEMS.filter(item => item.roles.includes(rang))

  const navItems = isFamilles
    ? [{ to: '/contrats-familles', label: 'Contrats', icon: <IcoContrats /> }]
    : [
        ...NAV_TOUS,
        ...(financeChildren.length > 0
          ? [{ group: 'finance', label: 'Finance', icon: <IcoFinance />, children: financeChildren }]
          : []),
        ...(stockChildren.length > 0
          ? [{ group: 'stock', label: 'Stock', icon: <IcoStock />, children: stockChildren }]
          : []),
        ...(contratChildren.length > 0
          ? [{ group: 'contrats', label: 'Contrats', icon: <IcoContrats />, children: contratChildren }]
          : []),
        ...(isResponsable ? NAV_RESPONSABLE : []),
        ...(isDir         ? NAV_DIRECTION   : []),
      ]

  const location = useLocation()
  const isChildActive = (children) => children.some(c => location.pathname.startsWith(c.to))
  const [openGroup, setOpenGroup] = useState(null)

  // Ouvre automatiquement le groupe contenant la page active
  useEffect(() => {
    const activeGroup = navItems.find(it => it.group && isChildActive(it.children))
    if (activeGroup) setOpenGroup(activeGroup.group)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, rang])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>

      {/* ── Bandeau simulation ── */}
      {viewAs && (
        <div style={{
          background: 'linear-gradient(90deg, #3a2a08, #2a1e04)',
          borderBottom: '1px solid var(--or)',
          padding: '7px 24px',
          display: 'flex', alignItems: 'center', gap: 14,
          fontSize: 12, color: 'var(--or-pale)',
          letterSpacing: '0.08em', zIndex: 100,
        }}>
          <span style={{ opacity: 0.7 }}>👁</span>
          <span>Vue simulée — <strong style={{ color: 'var(--or)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{viewAs}</strong></span>
          <button
            onClick={() => handleViewAs('direction')}
            style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--or-border)', color: 'var(--or)', borderRadius: 6, padding: '3px 12px', fontSize: 11, cursor: 'pointer', letterSpacing: '0.1em' }}>
            ✕ Revenir en direction
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1 }}>
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

          {/* Sélecteur "Vue simulée" — direction uniquement */}
          {isDirection && (
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--or-border)' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--texte-soft)', marginBottom: 6 }}>
                Voir en tant que
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['membre', 'responsable', 'direction'].map(r => (
                  <button key={r}
                    onClick={() => handleViewAs(r)}
                    style={{
                      flex: 1,
                      padding: '4px 2px',
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      borderRadius: 5,
                      border: '1px solid var(--or-border)',
                      background: (viewAs || 'direction') === r ? 'var(--or-glow)' : 'transparent',
                      color: (viewAs || 'direction') === r ? 'var(--or)' : 'rgba(201,168,76,0.45)',
                      fontWeight: (viewAs || 'direction') === r ? 700 : 400,
                      transition: 'var(--transition)',
                    }}>
                    {r === 'direction' ? 'Dir.' : r === 'responsable' ? 'Resp.' : 'Mbr.'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nav */}
          <nav style={{ flex: 1, padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navItems.map(item => {
              if (item.group) {
                const open   = openGroup === item.group
                const active = isChildActive(item.children)
                return (
                  <div key={item.group}>
                    <button
                      onClick={() => setOpenGroup(open ? null : item.group)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '10px 24px',
                        fontSize: 12,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        fontWeight: 500,
                        color: active ? 'var(--or-pale)' : 'rgba(201,168,76,0.52)',
                        background: active ? 'var(--or-glow)' : 'transparent',
                        borderRight: active ? '2px solid var(--or)' : '2px solid transparent',
                        border: 'none',
                        borderRightWidth: 2,
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        textAlign: 'left',
                      }}>
                      {item.icon}
                      {item.label}
                      <IcoChevron open={open} />
                    </button>
                    {open && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {item.children.map(sub => (
                          <NavLink key={sub.to} to={sub.to} style={({ isActive }) => ({
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '9px 24px 9px 44px',
                            fontSize: 11.5,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            fontWeight: 500,
                            color: isActive ? 'var(--or-pale)' : 'rgba(201,168,76,0.42)',
                            background: isActive ? 'var(--or-glow)' : 'transparent',
                            borderRight: isActive ? '2px solid var(--or)' : '2px solid transparent',
                            transition: 'var(--transition)',
                            textDecoration: 'none',
                          })}>
                            {sub.icon}
                            {sub.label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 24px',
                  fontSize: 12,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  color: isActive ? 'var(--or-pale)' : 'rgba(201,168,76,0.52)',
                  background: isActive ? 'var(--or-glow)' : 'transparent',
                  borderRight: isActive ? '2px solid var(--or)' : '2px solid transparent',
                  transition: 'var(--transition)',
                  textDecoration: 'none',
                })}>
                  {item.icon}
                  {item.label}
                </NavLink>
              )
            })}
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
    </div>
  )
}
