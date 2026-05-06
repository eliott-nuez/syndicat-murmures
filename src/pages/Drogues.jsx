import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Drogues() {
  const [drogues, setDrogues]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState({ type: '', text: '' })
  const [showForm, setShowForm] = useState(false)

  // Édition inline par ligne
  const [edits, setEdits] = useState({}) // { [id]: { prix_revient, seuil_alerte } }

  const [form, setForm] = useState({ nom: '', prix_revient: '', seuil_alerte: '' })

  useEffect(() => { fetchDrogues() }, [])

  const fetchDrogues = async () => {
    setLoading(true)
    const { data } = await supabase.from('drogues').select('*').order('nom')
    setDrogues(data || [])
    setLoading(false)
  }

  const startEdit = (d) => {
    setEdits(prev => ({
      ...prev,
      [d.id]: { prix_revient: d.prix_revient ?? '', seuil_alerte: d.seuil_alerte ?? '' },
    }))
  }

  const cancelEdit = (id) => {
    setEdits(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const saveEdit = async (id) => {
    const e = edits[id]
    setSaving(true)
    const { error } = await supabase.from('drogues').update({
      prix_revient:  parseFloat(e.prix_revient) || 0,
      seuil_alerte:  parseInt(e.seuil_alerte)   || 0,
    }).eq('id', id)
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Drogue mise à jour.' })
    cancelEdit(id)
    fetchDrogues()
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    const { error } = await supabase.from('drogues').insert({
      nom:          form.nom,
      prix_revient: parseFloat(form.prix_revient) || 0,
      seuil_alerte: parseInt(form.seuil_alerte)   || 0,
    })
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: `"${form.nom}" ajoutée.` })
    setForm({ nom: '', prix_revient: '', seuil_alerte: '' })
    setShowForm(false)
    fetchDrogues()
  }

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
            Direction
          </div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
            Drogues — Prix & catalogue
          </h1>
        </div>
        <button className="btn btn-solid" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Annuler' : '+ Nouvelle drogue'}
        </button>
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* ── Formulaire création ── */}
      {showForm && (
        <div className="card">
          <div className="card-title">Nouvelle drogue</div>
          <form onSubmit={handleCreate}>
            <div className="grid-3" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Nom</label>
                <input className="form-input" required placeholder="Ex : Cocaïne"
                  value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Prix de revient ($)</label>
                <input className="form-input" type="number" min="0" step="1" required
                  placeholder="Ex : 500"
                  value={form.prix_revient} onChange={e => setForm({ ...form, prix_revient: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Seuil alerte (unités)</label>
                <input className="form-input" type="number" min="0" step="1"
                  placeholder="Ex : 10"
                  value={form.seuil_alerte} onChange={e => setForm({ ...form, seuil_alerte: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Création...' : 'Créer la drogue'}
            </button>
          </form>
        </div>
      )}

      {/* ── Liste drogues ── */}
      <div className="card">
        <div className="card-title">Catalogue ({drogues.length} drogues)</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Prix de revient</th>
                <th>Seuil alerte</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {drogues.map(d => {
                const editing = edits[d.id]
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500 }}>{d.nom}</td>

                    {editing ? (
                      <>
                        <td>
                          <input className="form-input" type="number" min="0" step="1"
                            style={{ width: 120 }}
                            value={editing.prix_revient}
                            onChange={e => setEdits(prev => ({ ...prev, [d.id]: { ...prev[d.id], prix_revient: e.target.value } }))}
                          />
                        </td>
                        <td>
                          <input className="form-input" type="number" min="0" step="1"
                            style={{ width: 100 }}
                            value={editing.seuil_alerte}
                            onChange={e => setEdits(prev => ({ ...prev, [d.id]: { ...prev[d.id], seuil_alerte: e.target.value } }))}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-solid btn-sm" disabled={saving} onClick={() => saveEdit(d.id)}>✓ Sauver</button>
                            <button className="btn btn-or btn-sm" onClick={() => cancelEdit(d.id)}>✕</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(d.prix_revient)}</td>
                        <td style={{ color: d.seuil_alerte > 0 ? 'var(--texte)' : 'var(--texte-soft)' }}>
                          {d.seuil_alerte > 0 ? d.seuil_alerte : '—'}
                        </td>
                        <td>
                          <button className="btn btn-or btn-sm" onClick={() => startEdit(d)}>
                            ✎ Modifier
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
              {drogues.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--texte-soft)', padding: 20 }}>
                  Aucune drogue dans le catalogue.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
