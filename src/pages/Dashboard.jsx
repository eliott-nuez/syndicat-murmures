import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getDebutSemaine, getDebutSemaineStr } from '../utils/temps'
import { chargerParamsCommission, calculerCommission } from '../utils/commission'

// Types d'activites avec leurs cooldowns (en heures)
// Modifier ici si les cooldowns changent
const COOLDOWNS = {
  'ATM':         3,
  'Supérette':   2,
  'Go Fast':    24,
  'Cambriolage': 3,
}

// Labels affichés
const LABELS = {
  'ATM':         'ATM',
  'Supérette':   'Supérette',
  'Go Fast':     'Go Fast',
  'Cambriolage': 'Cambriolage',
}

// Normalise les timestamps Supabase "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS" (heure locale)
function parseTS(str) {
  if (!str) return null
  return new Date(typeof str === 'string' ? str.replace(' ', 'T') : str)
}

// Retourne { dispo: true } ou { dispo: false, label: "2h 34m" }
function getDispoStatus(prochainDispo) {
  if (!prochainDispo) return { dispo: true, jamaisFait: true }
  const diff = parseTS(prochainDispo) - new Date()
  if (diff <= 0) return { dispo: true }
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const label = h > 0
    ? `${h}h ${m.toString().padStart(2, '0')}m`
    : `${m}m`
  return { dispo: false, label }
}

export default function Dashboard() {
  const membre      = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const isDirection = membre.rang === 'direction'

  const [dispos, setDispos]         = useState({})
  const [totauxGang, setTotauxGang] = useState(null)
  const [connectes, setConnectes]   = useState('—')
  const [loading, setLoading]       = useState(true)
  // now sert à forcer le re-render toutes les minutes pour rafraichir les timers
  const [, setNow]                  = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true)

    // Derniere activite par type pour ce membre
    const types = Object.keys(COOLDOWNS)
    const dispoMap = {}

    for (const type of types) {
      const { data } = await supabase
        .from('activites')
        .select('heure_faite, prochain_dispo')
        .eq('membre_id', membre.id)
        .eq('type_code', type)
        .order('heure_faite', { ascending: false })
        .limit(1)
        .maybeSingle()

      dispoMap[type] = data || null
    }
    setDispos(dispoMap)

    // Membres connectes (actif = true)
    const { count } = await supabase
      .from('membres')
      .select('*', { count: 'exact', head: true })
      .eq('actif', true)
    setConnectes(count ?? 0)

    // Totaux gang semaine (direction uniquement)
    if (isDirection) {
      const debutStr = getDebutSemaineStr()
      const [commParams, { data: activites }, { data: ventes }, { data: membres }, { data: plants }] = await Promise.all([
        chargerParamsCommission(),
        supabase.from('activites').select('membre_id, somme_argent_sale, type_code').gte('heure_faite', debutStr),
        supabase.from('ventes_drogue').select('membre_id, argent_sale, prix_total, statut').gte('created_at', getDebutSemaine().toISOString()),
        supabase.from('membres').select('id, rang'),
        supabase.from('plantations').select('membre_id, benefice').gte('date_plantation', debutStr),
      ])
      let totalCommission = 0
      let totalNet = 0
      let totalBrut = 0
      ;(membres || []).forEach(m => {
        const acts  = (activites || []).filter(a => a.membre_id === m.id)
        const vts   = (ventes    || []).filter(v => v.membre_id === m.id)
        const ps    = (plants    || []).filter(p => p.membre_id === m.id)
        const c     = calculerCommission(acts, vts, m.rang, commParams, ps)
        totalCommission += c.commission
        totalNet        += c.net + c.cambriolageTotal
        totalBrut       += c.base + c.cambriolageTotal
      })
      setTotauxGang({ brut: totalBrut, commission: totalCommission, net: totalNet })
    }

    setLoading(false)
  }

  const formatMontant = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  const fmtDate = (d) =>
    parseTS(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
    </div>
  )

  return (
    <div>
      {/* En-tete */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Tableau de bord
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 26, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Bienvenue, {membre.surnom}
        </h1>
      </div>

      {/* Stats direction */}
      {isDirection && (
        <div className="grid-3" style={{ marginBottom: 28 }}>
          <div className="stat-box">
            <span className="stat-label">Argent sale — semaine</span>
            <span className="stat-value">{formatMontant(totauxGang?.brut ?? 0)}</span>
            <span className="stat-sub" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
              <span>Commission : <span style={{ color: '#e8a84c' }}>− {formatMontant(totauxGang?.commission ?? 0)}</span></span>
              <span>Total NET : <span style={{ color: 'var(--or)' }}>{formatMontant(totauxGang?.net ?? 0)}</span></span>
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Membres connectes</span>
            <span className="stat-value">{connectes}</span>
            <span className="stat-sub">Sur le site en ce moment</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Rang</span>
            <span className="stat-value" style={{ fontSize: 20, textTransform: 'capitalize' }}>{membre.rang}</span>
            <span className="stat-sub">{membre.surnom}</span>
          </div>
        </div>
      )}

      {/* Disponibilites + Recap */}
      <div className="grid-2" style={{ marginBottom: 28 }}>
        <div className="card">
          <div className="card-title">Disponibilités activités</div>
          {Object.keys(COOLDOWNS).map((type) => {
            const act    = dispos[type]
            const status = getDispoStatus(act?.prochain_dispo)

            return (
              <div key={type} className="dispo-item">
                <div>
                  <div className="dispo-name">{LABELS[type]}</div>
                  {act?.heure_faite && (
                    <div style={{ fontSize: 11, color: 'var(--texte-soft)', marginTop: 2 }}>
                      Dernière : {fmtDate(act.heure_faite)}
                    </div>
                  )}
                </div>
                <div className={`dispo-time ${status.dispo ? 'dispo-ok' : 'dispo-wait'}`}>
                  {status.dispo
                    ? (status.jamaisFait ? '✓ Disponible' : '✓ Disponible')
                    : `⏳ ${status.label}`}
                </div>
              </div>
            )
          })}
        </div>

        {/* Recap rapide semaine */}
        <div className="card">
          <div className="card-title">Semaine en cours</div>
          <RecapSemaineMini membreId={membre.id} />
        </div>
      </div>

      {/* Zones de vente / taxes */}
      <ZonesTaxes isDirection={isDirection} />
    </div>
  )
}

// Mini recap integre dans le dashboard
function RecapSemaineMini({ membreId }) {
  const membre = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const [recap, setRecap] = useState(null)

  useEffect(() => {
    const fetchRecap = async () => {
      const debutStr = getDebutSemaineStr()
      const [commParams, { data: activites }, { data: ventes }, { data: plants }] = await Promise.all([
        chargerParamsCommission(),
        supabase.from('activites').select('somme_argent_sale, type_code').eq('membre_id', membreId).gte('heure_faite', debutStr),
        supabase.from('ventes_drogue').select('argent_sale, prix_total, statut').eq('membre_id', membreId).gte('created_at', getDebutSemaine().toISOString()),
        supabase.from('plantations').select('benefice').eq('membre_id', membreId).gte('date_plantation', debutStr),
      ])

      const calc = calculerCommission(activites || [], ventes || [], membre.rang, commParams, plants || [])
      setRecap(calc)
    }
    fetchRecap()
  }, [membreId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  if (!recap) return <div style={{ color: 'var(--texte-soft)', fontSize: 13 }}>Chargement…</div>

  const { totalActBrut, cambriolageTotal, nbATM, deductionBoitiers, totalBenefice, totalPlantations, base, multiplicateur, commission_pct, commission, net, tranches_detail } = recap

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--texte-soft)' }}>Activités (hors cambriolage)</span>
        <span>{fmt(totalActBrut)}</span>
      </div>
      {cambriolageTotal > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--texte-soft)' }}>Cambriolage (direct)</span>
          <span>{fmt(cambriolageTotal)}</span>
        </div>
      )}
      {nbATM > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--texte-soft)' }}>Boitiers ATM ({nbATM}×)</span>
          <span style={{ color: '#e05555' }}>− {fmt(deductionBoitiers)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--texte-soft)' }}>Ventes (bénéfice)</span>
        <span>{fmt(totalBenefice)}</span>
      </div>
      {totalPlantations > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--texte-soft)' }}>Plantations</span>
          <span>{fmt(totalPlantations)}</span>
        </div>
      )}
      <hr className="sep-or" style={{ margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--texte-soft)' }}>Base commission</span>
        <span style={{ color: 'var(--or-pale)' }}>{fmt(base)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--texte-soft)' }}>
          Commission
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {tranches_detail && tranches_detail.length > 0
              ? tranches_detail.map(t => `${t.taux_effectif}% sur ${Math.round(t.portion).toLocaleString('fr-FR')}$`).join(' + ')
              : `×${multiplicateur}`}
            {' — '}taux moy. {commission_pct.toFixed(1)}%
          </span>
        </span>
        <span style={{ color: '#e05555' }}>− {fmt(commission)}</span>
      </div>
      <hr className="sep-or" style={{ margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px' }}>
        <span style={{ color: 'var(--or)', fontWeight: 600, fontSize: 14 }}>Total NET</span>
        <span style={{ color: 'var(--or-pale)', fontWeight: 700, fontSize: 14 }}>{fmt(net)}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(201,168,76,0.07)', border: '1px solid var(--or-border)',
        borderRadius: 6, padding: '10px 14px', marginTop: 4,
      }}>
        <div>
          <div style={{ color: 'var(--or)', fontFamily: 'var(--font-titre)', fontSize: 12, letterSpacing: '0.1em' }}>
            Salaire propre
          </div>
          <div style={{ fontSize: 11, color: 'var(--texte-soft)', marginTop: 2 }}>
            Après blanchiment (−35%)
          </div>
        </div>
        <span style={{ color: 'var(--or-pale)', fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-corps)' }}>
          {fmt(net * 0.65)}
        </span>
      </div>
    </div>
  )
}

// ── Zones de vente / Taxes ──────────────────────────────────────────────────

const TYPES_ZONE = ['Vente', 'Récolte', 'Transformation']

/** Formate un delta en millisecondes → "3j 12h 04m" ou "12h 04m" ou "45m" */
function fmtDelta(ms) {
  if (ms <= 0) return null
  const j = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (j > 0) return `${j}j ${h}h ${String(m).padStart(2, '0')}m`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m`
}

/** Statut d'une zone selon la date d'expiration (UTC → compare à now) */
function getZoneStatut(dateExpStr) {
  const exp  = new Date(dateExpStr)
  const diff = exp - new Date()           // ms restants (négatif = expiré)
  const jours = diff / 86400000

  if (diff <= 0)   return { code: 'expire',  label: 'Non payé',  color: '#e05555', bg: 'rgba(224,85,85,0.10)', border: 'rgba(224,85,85,0.35)' }
  if (jours <= 2)  return { code: 'alerte',  label: 'Alerte',    color: '#e8a84c', bg: 'rgba(232,168,76,0.10)', border: 'rgba(232,168,76,0.35)' }
  return             { code: 'paye',   label: 'Payé',      color: '#4caf7d', bg: 'rgba(76,175,125,0.10)', border: 'rgba(76,175,125,0.35)' }
}

function ZonesTaxes({ isDirection }) {
  const [zones, setZones]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [paying, setPaying]         = useState({})   // { [id]: true } pendant le paiement
  const [msg, setMsg]               = useState('')
  const [form, setForm]             = useState({ nom: '', type_zone: 'Vente' })
  const [, setNow]                  = useState(new Date())   // force re-render chaque minute
  const [editingMdp, setEditingMdp] = useState(null)  // id de la zone dont on édite le mdp
  const [mdpInput, setMdpInput]     = useState('')

  useEffect(() => {
    fetchZones()
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const fetchZones = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('zones_taxes')
      .select('*')
      .eq('actif', true)
      .order('nom')
    setZones(data || [])
    setLoading(false)
  }

  const handlePayer = async (zone, dureeMs = 7 * 24 * 3600 * 1000) => {
    setPaying(p => ({ ...p, [zone.id]: true }))
    // Toujours 7 jours depuis aujourd'hui, quelle que soit l'expiration précédente
    const nouvelleExp = new Date(Date.now() + dureeMs)
    const { error } = await supabase
      .from('zones_taxes')
      .update({ date_expiration: nouvelleExp.toISOString() })
      .eq('id', zone.id)
    if (error) setMsg('Erreur : ' + error.message)
    else { setMsg(''); fetchZones() }
    setPaying(p => ({ ...p, [zone.id]: false }))
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.nom.trim()) return
    // Expiration = maintenant → zone apparaît immédiatement en "Non payé"
    const exp = new Date()
    const { error } = await supabase.from('zones_taxes').insert({
      nom: form.nom.trim(), type_zone: form.type_zone,
      date_expiration: exp.toISOString(),
    })
    if (error) { setMsg('Erreur : ' + error.message); return }
    setForm({ nom: '', type_zone: 'Vente' })
    setShowForm(false)
    fetchZones()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette zone ?')) return
    await supabase.from('zones_taxes').update({ actif: false }).eq('id', id)
    fetchZones()
  }

  const handleEditMdp = (zone) => {
    setEditingMdp(zone.id)
    setMdpInput(zone.mot_de_passe || '')
  }

  const handleSaveMdp = async (id) => {
    const { error } = await supabase
      .from('zones_taxes')
      .update({ mot_de_passe: mdpInput.trim() || null })
      .eq('id', id)
    if (error) { setMsg('Erreur : ' + error.message); return }
    setEditingMdp(null)
    fetchZones()
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="card-title" style={{ margin: 0 }}>Taxes des zones</div>
        {isDirection && (
          <button className="btn btn-or btn-sm" onClick={() => setShowForm(s => !s)}>
            {showForm ? '✕ Annuler' : '+ Ajouter une zone'}
          </button>
        )}
      </div>

      {msg && <div className="alert alert-error" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Formulaire ajout zone (direction uniquement) */}
      {isDirection && showForm && (
        <form onSubmit={handleCreate} style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
          background: 'var(--noir)', border: '1px solid var(--or-border)',
          borderRadius: 6, padding: 14, marginBottom: 16,
        }}>
          <div className="form-group" style={{ minWidth: 200 }}>
            <label className="form-label">Nom de la zone</label>
            <input className="form-input" required placeholder="Ex : Hangar Sud, Rue Victor…"
              value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
          </div>
          <div className="form-group" style={{ minWidth: 150 }}>
            <label className="form-label">Type</label>
            <select className="form-select" value={form.type_zone}
              onChange={e => setForm(f => ({ ...f, type_zone: e.target.value }))}>
              {TYPES_ZONE.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-solid btn-sm">Créer</button>
        </form>
      )}

      {loading ? (
        <div style={{ color: 'var(--texte-soft)', fontSize: 13 }}>Chargement…</div>
      ) : zones.length === 0 ? (
        <div style={{ color: 'var(--texte-soft)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          Aucune zone enregistrée.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {zones.map(zone => {
            const statut = getZoneStatut(zone.date_expiration)
            const exp    = new Date(zone.date_expiration)
            const diff   = exp - new Date()
            const label  = diff > 0
              ? `Expire dans ${fmtDelta(diff)} — ${exp.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
              : `Expiré depuis ${fmtDelta(-diff)} — ${exp.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`

            return (
              <div key={zone.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                background: statut.bg, border: `1px solid ${statut.border}`,
                borderRadius: 8, padding: '12px 14px',
              }}>
                {/* Infos zone */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{zone.nom}</span>
                    <span style={{
                      fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: 'var(--texte-soft)', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--or-border)', borderRadius: 3, padding: '1px 5px',
                    }}>{zone.type_zone}</span>
                  </div>
                  <div style={{ fontSize: 11, color: statut.color, opacity: 0.9, marginBottom: 4 }}>{label}</div>

                  {/* Mot de passe */}
                  {editingMdp === zone.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--texte-soft)', flexShrink: 0 }}>Mot de passe :</span>
                      <input
                        className="form-input"
                        style={{ fontSize: 12, padding: '3px 8px', height: 'auto', width: 160 }}
                        value={mdpInput}
                        onChange={e => setMdpInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveMdp(zone.id); if (e.key === 'Escape') setEditingMdp(null) }}
                        autoFocus
                        placeholder="Saisir un mot de passe…"
                      />
                      <button className="btn btn-solid btn-sm" onClick={() => handleSaveMdp(zone.id)}>✓</button>
                      <button className="btn btn-sm" style={{ color: 'var(--texte-soft)' }} onClick={() => setEditingMdp(null)}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--texte-soft)' }}>Mot de passe :</span>
                      <span style={{
                        fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
                        color: zone.mot_de_passe ? 'var(--or-pale)' : 'var(--texte-soft)',
                        fontFamily: zone.mot_de_passe ? 'var(--font-corps)' : undefined,
                      }}>
                        {zone.mot_de_passe || '—'}
                      </span>
                      {isDirection && (
                        <button
                          onClick={() => handleEditMdp(zone)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 11, color: 'var(--texte-soft)', padding: '0 4px',
                            opacity: 0.7, lineHeight: 1,
                          }}
                          title="Modifier le mot de passe"
                        >✎</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Badge statut */}
                <span style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                  color: statut.color, whiteSpace: 'nowrap',
                  border: `1px solid ${statut.border}`, borderRadius: 4,
                  padding: '3px 9px', background: 'rgba(0,0,0,0.3)',
                }}>
                  {statut.code === 'paye' ? '✓ Payé' : statut.code === 'alerte' ? '⚠ Alerte' : '✕ Non payé'}
                </span>

                {/* Boutons direction */}
                {isDirection && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn btn-solid btn-sm"
                      disabled={paying[zone.id]}
                      onClick={() => handlePayer(zone)}
                      title="Ajoute 7 jours à la validité"
                    >
                      {paying[zone.id] ? '…' : '+ 7j Payer'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(zone.id)} title="Supprimer la zone">✕</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
