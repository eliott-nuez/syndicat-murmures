import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Drogues() {
  const [drogues, setDrogues]         = useState([])
  const [consommables, setConsommables] = useState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [msg, setMsg]                 = useState({ type: '', text: '' })
  const [showFormDrogue, setShowFormDrogue]   = useState(false)
  const [showFormConso, setShowFormConso]     = useState(false)

  const [editsDrogues, setEditsDrogues] = useState({})
  const [editsConso, setEditsConso]     = useState({})

  const [formDrogue, setFormDrogue] = useState({ nom: '', prix_revient: '', seuil_alerte: '' })
  const [formConso, setFormConso]   = useState({ nom: '', cout: '', type_argent: 'propre', type_activite: '' })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('drogues').select('*').order('nom'),
      supabase.from('consommables').select('*').order('nom'),
    ])
    setDrogues(d || [])
    setConsommables(c || [])
    setLoading(false)
  }

  // ── Drogues ──────────────────────────────────────────

  const startEditDrogue = (d) => {
    setEditsDrogues(prev => ({ ...prev, [d.id]: { prix_revient: d.prix_revient ?? '', seuil_alerte: d.seuil_alerte ?? '' } }))
  }
  const cancelEditDrogue = (id) => {
    setEditsDrogues(prev => { const n = { ...prev }; delete n[id]; return n })
  }
  const saveEditDrogue = async (id) => {
    const e = editsDrogues[id]
    setSaving(true)
    const { error } = await supabase.from('drogues').update({
      prix_revient: parseFloat(e.prix_revient) || 0,
      seuil_alerte: parseInt(e.seuil_alerte)   || 0,
    }).eq('id', id)
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Drogue mise à jour.' })
    cancelEditDrogue(id)
    fetchAll()
  }
  const handleCreateDrogue = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    const { error } = await supabase.from('drogues').insert({
      nom:          formDrogue.nom,
      prix_revient: parseFloat(formDrogue.prix_revient) || 0,
      seuil_alerte: parseInt(formDrogue.seuil_alerte)   || 0,
    })
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: `"${formDrogue.nom}" ajoutée.` })
    setFormDrogue({ nom: '', prix_revient: '', seuil_alerte: '' })
    setShowFormDrogue(false)
    fetchAll()
  }

  // ── Consommables ──────────────────────────────────────

  const startEditConso = (c) => {
    setEditsConso(prev => ({ ...prev, [c.id]: { nom: c.nom, cout: c.cout ?? '', type_argent: c.type_argent ?? 'propre', type_activite: c.type_activite ?? '', actif: c.actif } }))
  }
  const cancelEditConso = (id) => {
    setEditsConso(prev => { const n = { ...prev }; delete n[id]; return n })
  }
  const saveEditConso = async (id) => {
    const e = editsConso[id]
    setSaving(true)
    const { error } = await supabase.from('consommables').update({
      nom:           e.nom,
      cout:          parseFloat(e.cout) || 0,
      type_argent:   e.type_argent,
      type_activite: e.type_activite || null,
      actif:         e.actif,
    }).eq('id', id)
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Consommable mis à jour.' })
    cancelEditConso(id)
    fetchAll()
  }
  const handleCreateConso = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    const { error } = await supabase.from('consommables').insert({
      nom:           formConso.nom,
      cout:          parseFloat(formConso.cout) || 0,
      type_argent:   formConso.type_argent,
      type_activite: formConso.type_activite || null,
      actif:         true,
    })
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: `"${formConso.nom}" ajouté.` })
    setFormConso({ nom: '', cout: '', type_argent: 'propre', type_activite: '' })
    setShowFormConso(false)
    fetchAll()
  }

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Direction
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Catalogue
        </h1>
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* ── Section Drogues ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 13, letterSpacing: '0.15em', color: 'var(--or)', textTransform: 'uppercase' }}>
          Drogues
        </div>
        <button className="btn btn-solid btn-sm" onClick={() => setShowFormDrogue(!showFormDrogue)}>
          {showFormDrogue ? '✕ Annuler' : '+ Nouvelle drogue'}
        </button>
      </div>

      {showFormDrogue && (
        <div className="card">
          <div className="card-title">Nouvelle drogue</div>
          <form onSubmit={handleCreateDrogue}>
            <div className="grid-3" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Nom</label>
                <input className="form-input" required placeholder="Ex : Cocaïne"
                  value={formDrogue.nom} onChange={e => setFormDrogue({ ...formDrogue, nom: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Prix de revient ($)</label>
                <input className="form-input" type="number" min="0" step="1" required placeholder="Ex : 500"
                  value={formDrogue.prix_revient} onChange={e => setFormDrogue({ ...formDrogue, prix_revient: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Seuil alerte (unités)</label>
                <input className="form-input" type="number" min="0" step="1" placeholder="Ex : 10"
                  value={formDrogue.seuil_alerte} onChange={e => setFormDrogue({ ...formDrogue, seuil_alerte: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Création...' : 'Créer la drogue'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">Catalogue drogues ({drogues.length})</div>
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
                const editing = editsDrogues[d.id]
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500 }}>{d.nom}</td>
                    {editing ? (
                      <>
                        <td>
                          <input className="form-input" type="number" min="0" step="1" style={{ width: 120 }}
                            value={editing.prix_revient}
                            onChange={e => setEditsDrogues(prev => ({ ...prev, [d.id]: { ...prev[d.id], prix_revient: e.target.value } }))} />
                        </td>
                        <td>
                          <input className="form-input" type="number" min="0" step="1" style={{ width: 100 }}
                            value={editing.seuil_alerte}
                            onChange={e => setEditsDrogues(prev => ({ ...prev, [d.id]: { ...prev[d.id], seuil_alerte: e.target.value } }))} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-solid btn-sm" disabled={saving} onClick={() => saveEditDrogue(d.id)}>✓ Sauver</button>
                            <button className="btn btn-or btn-sm" onClick={() => cancelEditDrogue(d.id)}>✕</button>
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
                          <button className="btn btn-or btn-sm" onClick={() => startEditDrogue(d)}>✎ Modifier</button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
              {drogues.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--texte-soft)', padding: 20 }}>Aucune drogue dans le catalogue.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section Consommables ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 13, letterSpacing: '0.15em', color: 'var(--or)', textTransform: 'uppercase' }}>
          Consommables
        </div>
        <button className="btn btn-solid btn-sm" onClick={() => setShowFormConso(!showFormConso)}>
          {showFormConso ? '✕ Annuler' : '+ Nouveau consommable'}
        </button>
      </div>

      {showFormConso && (
        <div className="card">
          <div className="card-title">Nouveau consommable</div>
          <form onSubmit={handleCreateConso}>
            <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Nom</label>
                <input className="form-input" required placeholder="Ex : Boitier de piratage"
                  value={formConso.nom} onChange={e => setFormConso({ ...formConso, nom: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Coût ($)</label>
                <input className="form-input" type="number" min="0" step="1" required placeholder="Ex : 240"
                  value={formConso.cout} onChange={e => setFormConso({ ...formConso, cout: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Type d'argent</label>
                <select className="form-select" value={formConso.type_argent}
                  onChange={e => setFormConso({ ...formConso, type_argent: e.target.value })}>
                  <option value="propre">Argent propre</option>
                  <option value="sale">Argent sale</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Activité liée (optionnel)</label>
                <input className="form-input" placeholder="Ex : ATM, Cambriolage…"
                  value={formConso.type_activite} onChange={e => setFormConso({ ...formConso, type_activite: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Création...' : 'Créer le consommable'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">Liste consommables ({consommables.length})</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Coût</th>
                <th>Type argent</th>
                <th>Activité</th>
                <th>Statut</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {consommables.map(c => {
                const editing = editsConso[c.id]
                return (
                  <tr key={c.id}>
                    {editing ? (
                      <>
                        <td>
                          <input className="form-input" style={{ width: 180 }}
                            value={editing.nom}
                            onChange={e => setEditsConso(prev => ({ ...prev, [c.id]: { ...prev[c.id], nom: e.target.value } }))} />
                        </td>
                        <td>
                          <input className="form-input" type="number" min="0" step="1" style={{ width: 100 }}
                            value={editing.cout}
                            onChange={e => setEditsConso(prev => ({ ...prev, [c.id]: { ...prev[c.id], cout: e.target.value } }))} />
                        </td>
                        <td>
                          <select className="form-select" style={{ minWidth: 130 }}
                            value={editing.type_argent}
                            onChange={e => setEditsConso(prev => ({ ...prev, [c.id]: { ...prev[c.id], type_argent: e.target.value } }))}>
                            <option value="propre">Propre</option>
                            <option value="sale">Sale</option>
                          </select>
                        </td>
                        <td>
                          <input className="form-input" style={{ width: 130 }} placeholder="ATM…"
                            value={editing.type_activite}
                            onChange={e => setEditsConso(prev => ({ ...prev, [c.id]: { ...prev[c.id], type_activite: e.target.value } }))} />
                        </td>
                        <td>
                          <select className="form-select" style={{ minWidth: 90 }}
                            value={editing.actif ? 'true' : 'false'}
                            onChange={e => setEditsConso(prev => ({ ...prev, [c.id]: { ...prev[c.id], actif: e.target.value === 'true' } }))}>
                            <option value="true">Actif</option>
                            <option value="false">Inactif</option>
                          </select>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-solid btn-sm" disabled={saving} onClick={() => saveEditConso(c.id)}>✓ Sauver</button>
                            <button className="btn btn-or btn-sm" onClick={() => cancelEditConso(c.id)}>✕</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 500 }}>{c.nom}</td>
                        <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(c.cout)}</td>
                        <td>
                          <span className={`badge ${c.type_argent === 'propre' ? 'badge-bleu' : 'badge-orange'}`}>
                            {c.type_argent}
                          </span>
                        </td>
                        <td style={{ color: 'var(--texte-soft)' }}>{c.type_activite || '—'}</td>
                        <td>
                          <span className={`badge ${c.actif ? 'badge-vert' : 'badge-gris'}`}>
                            {c.actif ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-or btn-sm" onClick={() => startEditConso(c)}>✎ Modifier</button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
              {consommables.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--texte-soft)', padding: 20 }}>Aucun consommable.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
