import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getDebutSemaine } from '../utils/temps'

const TYPES = ['Fleeca', 'Ammunation']
const LIMITE_GROUPE  = 2   // max par semaine pour le groupe entier
const LIMITE_MEMBRE  = 1   // max par semaine par membre

function localDateStr(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Lundi prochain 00h01 (heure de Paris) — date "fin d'indisponibilité"
function getProchaineDispoGroupe() {
  const now   = new Date()
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const dow   = paris.getDay() || 7
  paris.setDate(paris.getDate() + (8 - dow))
  paris.setHours(0, 1, 0, 0)
  const offset = now - new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  return new Date(paris.getTime() + offset)
}

export default function ActiviteGroupe() {
  const membre = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const isDirection = membre.rang === 'direction'

  const [membres, setMembres]         = useState([])
  const [historique, setHistorique]   = useState([])
  const [type, setType]               = useState('Fleeca')
  const [participants, setParticipants] = useState([])
  const [montantTotal, setMontantTotal] = useState('')
  const [saving, setSaving]           = useState(false)
  const [msg, setMsg]                 = useState({ type: '', text: '' })
  const [showAll, setShowAll]         = useState(false)
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    Promise.all([fetchMembres(), fetchHistorique()]).then(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMembres = async () => {
    const { data } = await supabase.from('membres').select('id, surnom, rang').neq('rang', 'familles').order('surnom')
    setMembres(data || [])
  }

  const fetchHistorique = async () => {
    const { data } = await supabase.from('activites_groupe').select('*')
      .gte('created_at', getDebutSemaine().toISOString())
      .order('created_at', { ascending: false })
    setHistorique(data || [])
  }

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
  const fmtDate = (d) =>
    new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const fmtDateLong = (d) =>
    new Date(d).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  // ── Disponibilité par type ──
  const infosType = (t) => {
    const acts          = historique.filter(a => a.type_code === t)
    const groupeCount   = acts.length
    const groupeBloque  = groupeCount >= LIMITE_GROUPE
    const dejaParticipe = acts.some(a => (a.participants || []).some(p => p.membre_id === membre.id))
    const dispo         = !groupeBloque && !dejaParticipe
    return { groupeCount, groupeBloque, dejaParticipe, dispo }
  }

  const toggleParticipant = (id) => {
    setParticipants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg({ type: '', text: '' })
    const total = parseFloat(montantTotal)
    if (!total || total <= 0) { setMsg({ type: 'error', text: 'Montant total invalide.' }); return }
    if (participants.length === 0) { setMsg({ type: 'error', text: 'Sélectionnez au moins un participant.' }); return }

    const info = infosType(type)
    if (info.groupeBloque) {
      setMsg({ type: 'error', text: `Limite atteinte : le groupe a déjà fait ${LIMITE_GROUPE} ${type} cette semaine. Indisponible jusqu'à lundi 00h01 pour tout le monde.` })
      return
    }

    const acts = historique.filter(a => a.type_code === type)
    const dejaFait = participants.filter(pid => acts.some(a => (a.participants || []).some(p => p.membre_id === pid)))
    if (dejaFait.length > 0) {
      const noms = dejaFait.map(pid => membres.find(m => m.id === pid)?.surnom || '?').join(', ')
      setMsg({ type: 'error', text: `${noms} ${dejaFait.length > 1 ? 'ont' : 'a'} déjà participé à un(e) ${type} cette semaine (limite ${LIMITE_MEMBRE}/semaine/membre).` })
      return
    }

    setSaving(true)
    const part = Math.round((total / participants.length) * 100) / 100
    const participantsData = participants.map(pid => {
      const m = membres.find(x => x.id === pid)
      return { membre_id: pid, surnom: m?.surnom || '?' }
    })

    const dispoDate = getProchaineDispoGroupe()
    const dispoStr  = localDateStr(dispoDate)
    const heureStr  = localDateStr(new Date())

    // 1. Insère les lignes de comptabilité (table activites) pour chaque présent
    const lignesActs = participantsData.map(p => ({
      membre_id:         p.membre_id,
      type_code:         type,
      heure_faite:       heureStr,
      prochain_dispo:    dispoStr,
      somme_argent_sale: part,
      note:              `Activité de groupe — ${participants.length} présent(s), butin ${fmt(total)}`,
    }))
    const { data: actsInserted, error: errActs } = await supabase.from('activites').insert(lignesActs).select('id')
    if (errActs) { setMsg({ type: 'error', text: 'Erreur compta : ' + errActs.message }); setSaving(false); return }

    // 2. Enregistre l'activité de groupe avec le lien vers les lignes de compta créées
    const { error } = await supabase.from('activites_groupe').insert({
      type_code:       type,
      montant_total:   total,
      montant_part:    part,
      nb_participants: participants.length,
      participants:    participantsData,
      activite_ids:    (actsInserted || []).map(a => a.id),
      cree_par:        membre.id,
      cree_par_surnom: membre.surnom,
    })
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }); return }

    setMsg({ type: 'success', text: `${type} enregistré : ${fmt(total)} divisé entre ${participants.length} membre(s) — ${fmt(part)} chacun, ajouté à leur comptabilité.` })
    setParticipants([])
    setMontantTotal('')
    fetchHistorique()
  }

  const handleDelete = async (a) => {
    if (!window.confirm(`Supprimer cet(te) ${a.type_code} et retirer la part de chaque participant de la comptabilité ?`)) return
    if (a.activite_ids && a.activite_ids.length > 0) {
      await supabase.from('activites').delete().in('id', a.activite_ids)
    }
    await supabase.from('activites_groupe').delete().eq('id', a.id)
    setMsg({ type: 'success', text: 'Activité de groupe supprimée.' })
    fetchHistorique()
  }

  if (loading) return (
    <div className="loading-screen"><div className="spinner" /></div>
  )

  const nbPart = participants.length
  const total  = parseFloat(montantTotal) || 0
  const part   = nbPart > 0 ? total / nbPart : 0
  const infoCourant = infosType(type)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Activités de groupe
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Fleeca & Ammunation
        </h1>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--texte-soft)' }}>
          Limite : {LIMITE_GROUPE} par semaine pour le groupe entier · {LIMITE_MEMBRE} par semaine et par membre.
          Le butin est partagé entre les présents et ajouté directement à leur comptabilité.
          Une fois faite, l'activité devient indisponible jusqu'au <strong style={{ color: 'var(--or-pale)' }}>lundi 00h01</strong> pour les participants
          {' '}— et pour <strong style={{ color: 'var(--or-pale)' }}>tout le monde</strong> si le groupe atteint sa limite.
        </p>
      </div>

      {/* Statuts de disponibilité */}
      <div className="grid-2" style={{ gap: 20 }}>
        {TYPES.map(t => {
          const info = infosType(t)
          return (
            <div className="card" key={t}>
              <div className="card-title">{t}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--texte-soft)' }}>Réalisations du groupe cette semaine</span>
                  <span style={{ color: info.groupeBloque ? '#e05555' : 'var(--or-pale)', fontWeight: 600 }}>
                    {info.groupeCount} / {LIMITE_GROUPE}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 5, background: 'rgba(201,168,76,0.12)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 5,
                    width: `${Math.min(100, Math.round(info.groupeCount / LIMITE_GROUPE * 100))}%`,
                    background: info.groupeBloque ? 'linear-gradient(90deg,#a13f3f,#e05555)' : 'linear-gradient(90deg,#9c7d2e,#e8c97a)',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{
                  marginTop: 6, padding: '8px 12px', borderRadius: 6,
                  background: info.dispo ? 'rgba(92,186,138,0.08)' : 'rgba(224,85,85,0.08)',
                  border: `1px solid ${info.dispo ? 'rgba(92,186,138,0.35)' : 'rgba(224,85,85,0.35)'}`,
                  color: info.dispo ? '#5cba8a' : '#e8a0a0', fontSize: 12, fontWeight: 600,
                }}>
                  {info.dispo
                    ? '✓ Disponible pour vous'
                    : info.groupeBloque
                      ? '✗ Limite groupe atteinte — indisponible pour tous jusqu\'à lundi 00h01'
                      : '✗ Vous avez déjà participé cette semaine — indisponible jusqu\'à lundi 00h01'}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Formulaire d'enregistrement */}
      <div className="card">
        <div className="card-title">Enregistrer une activité</div>
        {msg.text && (
          <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
            {msg.text}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Type d'activité</label>
              <select className="form-select" value={type} onChange={e => { setType(e.target.value); setMsg({ type: '', text: '' }) }}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Butin total récupéré ($)</label>
              <input className="form-input" type="number" min="0" step="1" required
                placeholder="Ex : 40000"
                value={montantTotal} onChange={e => setMontantTotal(e.target.value)} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Membres présents *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {membres.map(m => {
                const checked = participants.includes(m.id)
                return (
                  <label key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${checked ? 'var(--or)' : 'var(--or-border)'}`,
                    background: checked ? 'var(--or-glow)' : 'transparent',
                    fontSize: 12, color: checked ? 'var(--or-pale)' : 'var(--texte-soft)',
                    transition: 'var(--transition)',
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleParticipant(m.id)} style={{ accentColor: 'var(--or)' }} />
                    {m.surnom}
                  </label>
                )
              })}
            </div>
          </div>

          {nbPart > 0 && total > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(201,168,76,0.07)', border: '1px solid var(--or-border)',
              borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13,
            }}>
              <span style={{ color: 'var(--texte-soft)' }}>
                {fmt(total)} divisé entre <strong style={{ color: 'var(--or-pale)' }}>{nbPart}</strong> membre(s)
              </span>
              <span style={{ color: 'var(--or)', fontWeight: 700, fontSize: 16 }}>
                {fmt(part)} <span style={{ fontSize: 11, color: 'var(--texte-soft)', fontWeight: 400 }}>/ personne</span>
              </span>
            </div>
          )}

          {!infoCourant.dispo && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              ⚠ {infoCourant.groupeBloque
                ? `Le groupe a atteint sa limite de ${LIMITE_GROUPE} ${type} cette semaine. Indisponible pour tous jusqu'à lundi 00h01.`
                : `Vous avez déjà participé à un(e) ${type} cette semaine (limite ${LIMITE_MEMBRE}/membre).`}
            </div>
          )}

          <button type="submit" className="btn btn-solid" disabled={saving || infoCourant.groupeBloque}>
            {saving ? 'Enregistrement...' : `+ Valider le ${type}`}
          </button>
        </form>
      </div>

      {/* Historique de la semaine */}
      {historique.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Historique de la semaine ({historique.length})</div>
            {historique.length > 5 && (
              <button className="btn btn-or btn-sm" onClick={() => setShowAll(v => !v)}>
                {showAll ? 'Afficher moins' : `Afficher tout (${historique.length})`}
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Type</th><th>Date</th><th>Butin total</th><th>Part / pers.</th><th>Présents</th><th>Enregistré par</th>{isDirection && <th></th>}</tr>
              </thead>
              <tbody>
                {(showAll ? historique : historique.slice(0, 5)).map(a => (
                  <tr key={a.id}>
                    <td><span className="badge badge-vert">{a.type_code}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--texte-soft)' }} title={fmtDateLong(a.created_at)}>{fmtDate(a.created_at)}</td>
                    <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(a.montant_total)}</td>
                    <td style={{ color: 'var(--or)' }}>{fmt(a.montant_part)}</td>
                    <td style={{ fontSize: 12, color: 'var(--texte-soft)', maxWidth: 280 }}>
                      {(a.participants || []).map(p => p.surnom).join(', ')}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--texte-soft)' }}>{a.cree_par_surnom || '—'}</td>
                    {isDirection && (
                      <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(a)}>✕</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
