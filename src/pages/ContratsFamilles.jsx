import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function ChangerMotDePasse({ surnom }) {
  const [form, setForm]   = useState({ actuel: '', nouveau: '', confirm: '' })
  const [msg, setMsg]     = useState({ type: '', text: '' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg({ type: '', text: '' })
    if (form.nouveau !== form.confirm) {
      setMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas.' }); return
    }
    if (form.nouveau.length < 4) {
      setMsg({ type: 'error', text: 'Mot de passe trop court (4 caractères min).' }); return
    }
    setSaving(true)
    const email = `${surnom.trim().toLowerCase()}@sdm.local`
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: form.actuel })
    if (signInErr) {
      setMsg({ type: 'error', text: 'Mot de passe actuel incorrect.' })
      setSaving(false); return
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: form.nouveau })
    setSaving(false)
    if (updateErr) { setMsg({ type: 'error', text: 'Erreur : ' + updateErr.message }); return }
    setMsg({ type: 'success', text: 'Mot de passe mis à jour.' })
    setForm({ actuel: '', nouveau: '', confirm: '' })
  }

  return (
    <div className="card">
      <div className="card-title">Changer mon mot de passe</div>
      {msg.text && (
        <div className={`alert ${msg.type === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 360 }}>
        <div className="form-group">
          <label className="form-label">Mot de passe actuel</label>
          <input className="form-input" type="password" required value={form.actuel}
            onChange={e => setForm(f => ({ ...f, actuel: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Nouveau mot de passe</label>
          <input className="form-input" type="password" required value={form.nouveau}
            onChange={e => setForm(f => ({ ...f, nouveau: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Confirmer le nouveau mot de passe</label>
          <input className="form-input" type="password" required value={form.confirm}
            onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
        </div>
        <button type="submit" className="btn btn-solid" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Mise à jour…' : 'Changer le mot de passe'}
        </button>
      </form>
    </div>
  )
}

const STATUTS = {
  non_livre:          { label: 'Non livré',         color: '#e05555', bg: 'rgba(224,85,85,0.12)',  border: 'rgba(224,85,85,0.35)'  },
  partiellement_livre: { label: 'Partiellement livré', color: '#e8a84c', bg: 'rgba(232,168,76,0.12)', border: 'rgba(232,168,76,0.35)' },
  livre:              { label: 'Livré',             color: '#4caf7d', bg: 'rgba(76,175,125,0.12)', border: 'rgba(76,175,125,0.35)' },
}

// Cycle au clic : non_livre → partiellement_livre → livre → non_livre
const CYCLE = ['non_livre', 'partiellement_livre', 'livre']

const MOIS_LABELS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
]
const JOURS_SEMAINE = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

const pad = n => String(n).padStart(2, '0')

export default function ContratsFamilles() {
  const membre  = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const canEdit = ['direction', 'responsable'].includes(membre.rang)

  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())   // 0-indexed
  const [jours, setJours] = useState({})               // { 'YYYY-MM-DD': { id, statut } }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null)          // dateStr en cours de sauvegarde

  useEffect(() => {
    fetchMois(year, month)
  }, [year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMois = async (y, m) => {
    setLoading(true)
    const debut = `${y}-${pad(m + 1)}-01`
    const fin   = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`
    const { data } = await supabase
      .from('contrats_familles')
      .select('*')
      .gte('date', debut)
      .lte('date', fin)
    const map = {}
    ;(data || []).forEach(d => { map[d.date] = d })
    setJours(map)
    setLoading(false)
  }

  const handleClickDay = async (dateStr) => {
    if (!canEdit || saving) return
    setSaving(dateStr)

    const existing = jours[dateStr]
    const current  = existing?.statut || 'non_livre'
    const next     = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]

    let updated
    if (existing) {
      const { data } = await supabase
        .from('contrats_familles')
        .update({ statut: next, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single()
      updated = data
    } else {
      const { data } = await supabase
        .from('contrats_familles')
        .insert({ date: dateStr, statut: next })
        .select()
        .single()
      updated = data
    }

    if (updated) setJours(prev => ({ ...prev, [dateStr]: updated }))
    setSaving(null)
  }

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()) }

  // Construction de la grille
  const daysInMonth   = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7 // 0 = lundi

  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  // Stats du mois
  const statsMonth = Object.values(jours).reduce((acc, j) => {
    acc[j.statut] = (acc[j.statut] || 0) + 1
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── En-tête ── */}
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Livraisons
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Contrats Familles
        </h1>
      </div>

      {/* ── Stats du mois ── */}
      <div className="grid-3">
        {Object.entries(STATUTS).map(([key, s]) => (
          <div key={key} className="stat-box" style={{ borderColor: s.border, background: s.bg }}>
            <span className="stat-label" style={{ color: s.color }}>{s.label}</span>
            <span className="stat-value" style={{ color: s.color }}>{statsMonth[key] || 0}</span>
          </div>
        ))}
      </div>

      {/* ── Navigation mois + légende ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>

        {/* Légende */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {Object.entries(STATUTS).map(([k, s]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 11, height: 11, borderRadius: 3, flexShrink: 0,
                background: s.bg, border: `1px solid ${s.border}`, display: 'inline-block',
              }}/>
              <span style={{ fontSize: 12, color: 'var(--texte-soft)' }}>{s.label}</span>
            </div>
          ))}
          {canEdit && (
            <span style={{ fontSize: 11, color: 'var(--texte-soft)', opacity: 0.55, marginLeft: 4 }}>
              · Cliquer pour changer le statut
            </span>
          )}
        </div>

        {/* Sélecteur mois */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-sm" onClick={prevMonth} style={{ padding: '6px 14px', fontFamily: 'var(--font-corps)' }}>←</button>
          <button
            onClick={goToday}
            style={{
              fontFamily: 'var(--font-titre)', fontSize: 13, color: 'var(--or-pale)',
              width: 200, textAlign: 'center', letterSpacing: '0.08em',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            {MOIS_LABELS[month]} {year}
          </button>
          <button className="btn btn-sm" onClick={nextMonth} style={{ padding: '6px 14px', fontFamily: 'var(--font-corps)' }}>→</button>
        </div>
      </div>

      {/* ── Calendrier ── */}
      <div className="card" style={{ padding: 16 }}>

        {/* En-têtes jours semaine */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {JOURS_SEMAINE.map(j => (
            <div key={j} style={{
              textAlign: 'center', fontSize: 10, letterSpacing: '0.15em',
              textTransform: 'uppercase', color: 'var(--texte-soft)', padding: '4px 0',
            }}>
              {j}
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--texte-soft)' }}>
            Chargement…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {/* Cellules vides avant le 1er */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Jours du mois */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr  = `${year}-${pad(month + 1)}-${pad(day)}`
              const entry    = jours[dateStr]
              const statut   = entry?.statut
              const s        = statut ? STATUTS[statut] : null
              const isToday  = dateStr === todayStr
              const isSaving = saving === dateStr

              return (
                <div
                  key={dateStr}
                  onClick={() => handleClickDay(dateStr)}
                  title={canEdit ? `${day} — cliquer pour changer le statut` : s?.label || 'Pas de statut'}
                  style={{
                    borderRadius: 8,
                    padding: '10px 6px 8px',
                    minHeight: 72,
                    background: s ? s.bg : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isToday ? 'var(--or)' : s ? s.border : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: isToday ? '0 0 0 1px rgba(201,168,76,0.2)' : 'none',
                    cursor: canEdit ? 'pointer' : 'default',
                    transition: 'opacity 0.12s, transform 0.1s',
                    transform: isSaving ? 'scale(0.97)' : 'scale(1)',
                    opacity: isSaving ? 0.6 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    userSelect: 'none',
                  }}
                >
                  {/* Numéro */}
                  <span style={{
                    fontSize: 14, lineHeight: 1,
                    fontWeight: isToday ? 700 : 400,
                    fontFamily: 'var(--font-corps)',
                    color: isToday ? 'var(--or)' : 'var(--texte)',
                  }}>
                    {day}
                  </span>

                  {/* Badge statut */}
                  {statut && (
                    <span style={{
                      fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase',
                      fontWeight: 700, color: s.color,
                      padding: '2px 6px', borderRadius: 3,
                      background: 'rgba(0,0,0,0.25)',
                      lineHeight: 1.4,
                    }}>
                      {isSaving ? '…' : s.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!canEdit && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--texte-soft)', opacity: 0.6 }}>
          Consultation uniquement
        </div>
      )}

      {/* Changement de mot de passe — familles uniquement */}
      {membre.rang === 'familles' && (
        <ChangerMotDePasse surnom={membre.surnom} />
      )}
    </div>
  )
}
