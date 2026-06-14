import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const MOIS_LABELS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

const pad = n => String(n).padStart(2, '0')
const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const getMonday = (d) => {
  const date = new Date(d)
  const day  = (date.getDay() + 6) % 7 // 0 = lundi
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

const addDays = (d, n) => {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

export default function ContratsSuiviTable() {
  const now = new Date()
  const [monday, setMonday] = useState(getMonday(now))
  const [contrats, setContrats] = useState([])
  const [suivis, setSuivis]     = useState({}) // { 'contratId_YYYY-MM-DD': row }
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(null) // { contratId, dateStr }
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving]     = useState(false)

  const jours = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const todayStr = toDateStr(now)

  useEffect(() => { fetchAll() }, [monday]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    setLoading(true)
    const debut = toDateStr(monday)
    const fin   = toDateStr(addDays(monday, 6))
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from('contrats').select('*').eq('actif', true).order('created_at'),
      supabase.from('contrats_suivi').select('*').gte('date', debut).lte('date', fin),
    ])
    setContrats(c || [])
    const map = {}
    ;(s || []).forEach(row => { map[`${row.contrat_id}_${row.date}`] = row })
    setSuivis(map)
    setLoading(false)
  }

  const prevWeek  = () => setMonday(m => addDays(m, -7))
  const nextWeek  = () => setMonday(m => addDays(m, 7))
  const goToday   = () => setMonday(getMonday(new Date()))

  const startEdit = (contrat, dateStr) => {
    const existing = suivis[`${contrat.id}_${dateStr}`]
    setEditing({ contratId: contrat.id, dateStr })
    setEditValue(existing?.quantite_realisee != null ? String(existing.quantite_realisee) : '')
  }
  const cancelEdit = () => { setEditing(null); setEditValue('') }

  const saveValue = async (contrat, dateStr, valeur) => {
    setSaving(true)
    const existing = suivis[`${contrat.id}_${dateStr}`]
    let row
    if (existing) {
      const { data } = await supabase.from('contrats_suivi')
        .update({ quantite_realisee: valeur, updated_at: new Date().toISOString() })
        .eq('id', existing.id).select().single()
      row = data
    } else {
      const { data } = await supabase.from('contrats_suivi')
        .insert({ contrat_id: contrat.id, date: dateStr, quantite_realisee: valeur })
        .select().single()
      row = data
    }
    if (row) setSuivis(prev => ({ ...prev, [`${contrat.id}_${dateStr}`]: row }))
    setSaving(false)
    cancelEdit()
  }

  const handleQuickSet = (contrat, dateStr, valeur) => saveValue(contrat, dateStr, valeur)
  const handleCustomSave = (contrat, dateStr) => {
    const v = parseFloat(editValue)
    saveValue(contrat, dateStr, isNaN(v) ? 0 : v)
  }

  const statutCell = (contrat, dateStr) => {
    const entry = suivis[`${contrat.id}_${dateStr}`]
    const valeur = entry?.quantite_realisee
    const dejaPasse = dateStr <= todayStr
    if (valeur == null) {
      return dejaPasse
        ? { label: 'Non rempli', color: '#8a8578', bg: 'rgba(80,80,80,0.12)', border: 'rgba(80,80,80,0.35)' }
        : { label: '—', color: '#8a8578', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)' }
    }
    if (valeur <= 0) {
      return { label: 'Non honoré', color: '#e05555', bg: 'rgba(224,85,85,0.12)', border: 'rgba(224,85,85,0.35)', valeur }
    }
    if (valeur < contrat.quantite) {
      return { label: 'Partiel', color: '#e8a84c', bg: 'rgba(232,168,76,0.12)', border: 'rgba(232,168,76,0.35)', valeur }
    }
    if (valeur > contrat.quantite) {
      return { label: 'Honoré +', color: '#4caf7d', bg: 'rgba(76,175,125,0.12)', border: 'rgba(76,175,125,0.35)', valeur }
    }
    return { label: 'Honoré', color: '#4caf7d', bg: 'rgba(76,175,125,0.12)', border: 'rgba(76,175,125,0.35)', valeur }
  }

  const descriptionContrat = (c) => {
    const action = c.sens === 'achat' ? 'Acheter' : 'Vendre'
    return `${action} ${c.quantite} ${c.marchandise_nom} — ${c.groupe} (tous les ${c.frequence_jours} jour${c.frequence_jours > 1 ? 's' : ''})`
  }

  if (loading) return <div style={{ color: 'var(--texte-soft)', fontSize: 13 }}>Chargement…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Honoré',     color: '#4caf7d', bg: 'rgba(76,175,125,0.12)', border: 'rgba(76,175,125,0.35)' },
            { label: 'Partiel',    color: '#e8a84c', bg: 'rgba(232,168,76,0.12)', border: 'rgba(232,168,76,0.35)' },
            { label: 'Non honoré', color: '#e05555', bg: 'rgba(224,85,85,0.12)', border: 'rgba(224,85,85,0.35)' },
            { label: 'Non rempli', color: '#8a8578', bg: 'rgba(80,80,80,0.12)', border: 'rgba(80,80,80,0.35)' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: s.bg, border: `1px solid ${s.border}`, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: 'var(--texte-soft)' }}>{s.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-sm" onClick={prevWeek} style={{ padding: '6px 14px', fontFamily: 'var(--font-corps)' }}>←</button>
          <button onClick={goToday} style={{
            fontFamily: 'var(--font-titre)', fontSize: 13, color: 'var(--or-pale)',
            width: 220, textAlign: 'center', letterSpacing: '0.06em',
            background: 'none', border: 'none', cursor: 'pointer',
          }}>
            {jours[0].getDate()} {MOIS_LABELS[jours[0].getMonth()]} – {jours[6].getDate()} {MOIS_LABELS[jours[6].getMonth()]} {jours[6].getFullYear()}
          </button>
          <button className="btn btn-sm" onClick={nextWeek} style={{ padding: '6px 14px', fontFamily: 'var(--font-corps)' }}>→</button>
        </div>
      </div>

      {contrats.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--texte-soft)' }}>
          Aucun contrat actif pour le moment.
        </div>
      )}

      {contrats.map(c => (
        <div key={c.id} style={{ border: '1px solid var(--or-border)', borderRadius: 8, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div>
              <span className={`badge ${c.sens === 'achat' ? 'badge-bleu' : 'badge-vert'}`} style={{ marginRight: 8 }}>
                {c.sens === 'achat' ? 'Achat' : 'Vente'}
              </span>
              <strong style={{ color: 'var(--or-pale)' }}>{c.groupe}</strong>
            </div>
            <div style={{ fontSize: 12, color: 'var(--texte-soft)' }}>{descriptionContrat(c)}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {jours.map(d => {
              const dateStr = toDateStr(d)
              const isToday = dateStr === todayStr
              const s = statutCell(c, dateStr)
              const isEditing = editing && editing.contratId === c.id && editing.dateStr === dateStr

              return (
                <div key={dateStr} style={{
                  borderRadius: 8, padding: '10px 8px', minHeight: 90,
                  background: s.bg,
                  border: `1px solid ${isToday ? 'var(--or)' : s.border}`,
                  boxShadow: isToday ? '0 0 0 1px rgba(201,168,76,0.2)' : 'none',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: isToday ? 'var(--or)' : 'var(--texte-soft)' }}>
                    {JOURS_SEMAINE[(d.getDay() + 6) % 7].slice(0, 3)} {d.getDate()}
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <input className="form-input" type="number" min="0" step="1" autoFocus
                        style={{ padding: '3px 6px', fontSize: 12 }}
                        placeholder={`Cible: ${c.quantite}`}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCustomSave(c, dateStr) }} />
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-solid btn-sm" disabled={saving} style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() => handleQuickSet(c, dateStr, c.quantite)}>✓ Honoré</button>
                        <button className="btn btn-danger btn-sm" disabled={saving} style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() => handleQuickSet(c, dateStr, 0)}>✗ Non</button>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-or btn-sm" disabled={saving} style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() => handleCustomSave(c, dateStr)}>OK</button>
                        <button className="btn btn-sm" disabled={saving} style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={cancelEdit}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => startEdit(c, dateStr)} style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: s.color, textTransform: 'uppercase' }}>
                        {s.label}
                      </span>
                      {s.valeur != null && (
                        <span style={{ fontSize: 11, color: 'var(--texte-soft)' }}>
                          {s.valeur} / {c.quantite}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
