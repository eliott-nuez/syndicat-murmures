import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MOIS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function Calendrier() {
  const moi = JSON.parse(localStorage.getItem('sdm_membre') || '{}')

  const today        = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [absences, setAbsences] = useState([])
  const [membres, setMembres]   = useState([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState({ type: '', text: '' })

  const [form, setForm] = useState({
    date_debut: '',
    date_fin:   '',
    note:       '',
  })

  useEffect(() => {
    supabase.from('membres').select('id, surnom').order('surnom')
      .then(({ data }) => setMembres(data || []))
  }, [])

  useEffect(() => {
    fetchAbsences()
  }, [year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAbsences = async () => {
    const debut = new Date(year, month, 1).toISOString().slice(0, 10)
    const fin   = new Date(year, month + 1, 0).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('absences')
      .select('*, membres(surnom)')
      .lte('date_debut', fin)
      .gte('date_fin', debut)
      .order('date_debut')
    setAbsences(data || [])
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.date_fin < form.date_debut) {
      setMsg({ type: 'error', text: 'La date de fin doit être après le début.' })
      return
    }
    setSaving(true)
    setMsg({ type: '', text: '' })
    const { error } = await supabase.from('absences').insert({
      membre_id:  moi.id,
      date_debut: form.date_debut,
      date_fin:   form.date_fin,
      note:       form.note || null,
    })
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Absence enregistrée.' })
    setShowForm(false)
    setForm({ date_debut: '', date_fin: '', note: '' })
    fetchAbsences()
  }

  const supprimerAbsence = async (id, membreId) => {
    if (membreId !== moi.id && moi.rang !== 'direction') return
    await supabase.from('absences').delete().eq('id', id)
    fetchAbsences()
  }

  // Construire la grille du mois
  const buildGrid = () => {
    const premier = new Date(year, month, 1)
    const dernier = new Date(year, month + 1, 0)
    const startDow = (premier.getDay() + 6) % 7 // Lundi = 0
    const cells = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= dernier.getDate(); d++) cells.push(d)
    return cells
  }

  const absencesDuJour = (day) => {
    if (!day) return []
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return absences.filter(a => a.date_debut <= date && a.date_fin >= date)
  }

  const isToday = (day) => {
    if (!day) return false
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  }

  const cells = buildGrid()

  // Couleurs par membre (cycle)
  const COULEURS = ['#4e9af1','#e8a84c','#5cba8a','#e05555','#a855f7','#ec4899','#14b8a6']
  const couleurMembre = (membreId) => {
    const idx = membres.findIndex(m => m.id === membreId)
    return COULEURS[idx % COULEURS.length]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
            Équipe
          </div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
            Calendrier des absences
          </h1>
        </div>
        <button className="btn btn-solid" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Annuler' : '+ Déclarer une absence'}
        </button>
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* ── Formulaire ── */}
      {showForm && (
        <div className="card">
          <div className="card-title">Nouvelle absence — {moi.surnom}</div>
          <form onSubmit={handleSubmit}>
            <div className="grid-3" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Date de début</label>
                <input className="form-input" type="date" required
                  value={form.date_debut}
                  onChange={e => setForm({ ...form, date_debut: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Date de fin</label>
                <input className="form-input" type="date" required
                  value={form.date_fin}
                  onChange={e => setForm({ ...form, date_fin: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Motif (facultatif)</label>
                <input className="form-input" type="text" placeholder="Ex : vacances, IRL..."
                  value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Valider'}
            </button>
          </form>
        </div>
      )}

      {/* ── Légende membres ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {membres.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: couleurMembre(m.id), flexShrink: 0 }} />
            <span style={{ color: 'var(--texte-soft)' }}>{m.surnom}</span>
          </div>
        ))}
      </div>

      {/* ── Calendrier ── */}
      <div className="card">
        {/* Nav mois */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button className="btn btn-or btn-sm" onClick={prevMonth}>‹ Préc.</button>
          <span style={{ fontFamily: 'var(--font-titre)', fontSize: 16, color: 'var(--or-pale)', letterSpacing: '0.1em' }}>
            {MOIS[month]} {year}
          </span>
          <button className="btn btn-or btn-sm" onClick={nextMonth}>Suiv. ›</button>
        </div>

        {/* En-têtes jours */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {JOURS.map(j => (
            <div key={j} style={{ textAlign: 'center', fontSize: 11, color: 'var(--texte-soft)', letterSpacing: '0.08em', padding: '4px 0' }}>
              {j}
            </div>
          ))}
        </div>

        {/* Grille jours */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((day, i) => {
            const abs = absencesDuJour(day)
            return (
              <div key={i} style={{
                minHeight: 72,
                background: day ? (isToday(day) ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)') : 'transparent',
                border: day ? (isToday(day) ? '1px solid var(--or-border)' : '1px solid rgba(255,255,255,0.05)') : 'none',
                borderRadius: 6,
                padding: '6px 8px',
              }}>
                {day && (
                  <>
                    <div style={{
                      fontSize: 12, fontWeight: isToday(day) ? 700 : 400,
                      color: isToday(day) ? 'var(--or)' : 'var(--texte-soft)',
                      marginBottom: 4,
                    }}>
                      {day}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {abs.map(a => (
                        <div key={a.id}
                          title={`${a.membres?.surnom}${a.note ? ` — ${a.note}` : ''}`}
                          onClick={() => supprimerAbsence(a.id, a.membre_id)}
                          style={{
                            background: couleurMembre(a.membre_id),
                            color: '#fff',
                            fontSize: 10,
                            padding: '2px 5px',
                            borderRadius: 3,
                            cursor: (a.membre_id === moi.id || moi.rang === 'direction') ? 'pointer' : 'default',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                          {a.membres?.surnom}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Liste absences du mois ── */}
      {absences.length > 0 && (
        <div className="card">
          <div className="card-title">Absences — {MOIS[month]} {year}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {absences.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderLeft: `3px solid ${couleurMembre(a.membre_id)}`,
                borderRadius: 6,
              }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: couleurMembre(a.membre_id) }}>{a.membres?.surnom}</span>
                  <span style={{ fontSize: 13 }}>
                    {new Date(a.date_debut + 'T12:00').toLocaleDateString('fr-FR')}
                    {a.date_debut !== a.date_fin && ` → ${new Date(a.date_fin + 'T12:00').toLocaleDateString('fr-FR')}`}
                  </span>
                  {a.note && <span style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{a.note}</span>}
                </div>
                {(a.membre_id === moi.id || moi.rang === 'direction') && (
                  <button
                    onClick={() => supprimerAbsence(a.id, a.membre_id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05555', fontSize: 16 }}
                    title="Supprimer">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
