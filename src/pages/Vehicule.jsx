import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const VIDE = { immatriculation: '', modele_jeu: '', modele_discord: '', image: '' }

export default function Vehicule() {
  const membre = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const isResponsable = ['responsable', 'direction'].includes(membre.rang)

  const [vehicules, setVehicules] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')

  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(VIDE)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState({ type: '', text: '' })

  const [editId, setEditId]       = useState(null)
  const [editForm, setEditForm]   = useState(VIDE)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => { fetchVehicules() }, [])

  const fetchVehicules = async () => {
    setLoading(true)
    const { data } = await supabase.from('voitures').select('*').order('created_at', { ascending: false })
    setVehicules(data || [])
    setLoading(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    const { error } = await supabase.from('voitures').insert({
      immatriculation: form.immatriculation || null,
      modele_jeu: form.modele_jeu || null,
      modele_discord: form.modele_discord || null,
      image: form.image || null,
    })
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Véhicule ajouté.' })
    setForm(VIDE)
    setShowForm(false)
    fetchVehicules()
  }

  const startEdit = (v) => {
    setEditId(v.id)
    setEditForm({
      immatriculation: v.immatriculation || '',
      modele_jeu: v.modele_jeu || '',
      modele_discord: v.modele_discord || '',
      image: v.image || '',
    })
  }
  const cancelEdit = () => { setEditId(null); setEditForm(VIDE) }

  const saveEdit = async (id) => {
    setSavingEdit(true)
    const { error } = await supabase.from('voitures').update({
      immatriculation: editForm.immatriculation || null,
      modele_jeu: editForm.modele_jeu || null,
      modele_discord: editForm.modele_discord || null,
      image: editForm.image || null,
    }).eq('id', id)
    setSavingEdit(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Véhicule mis à jour.' })
    cancelEdit()
    fetchVehicules()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce véhicule ?')) return
    setDeletingId(id)
    const { error } = await supabase.from('voitures').delete().eq('id', id)
    setDeletingId(null)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Véhicule supprimé.' })
    fetchVehicules()
  }

  const vehiculesFiltres = vehicules.filter(v => {
    if (!search) return true
    const q = search.toLowerCase()
    const champs = [v.immatriculation, v.modele_jeu, v.modele_discord]
    return champs.some(c => (c || '').toLowerCase().includes(q))
  })

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>Stock</div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>Véhicules</h1>
        </div>
        {isResponsable && (
          <button className="btn btn-solid btn-sm" onClick={() => { setShowForm(!showForm); setMsg({ type: '', text: '' }) }}>
            {showForm ? '✕ Annuler' : '+ Nouveau véhicule'}
          </button>
        )}
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {isResponsable && showForm && (
        <div className="card">
          <div className="card-title">Nouveau véhicule</div>
          <form onSubmit={handleCreate}>
            <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Immatriculation</label>
                <input className="form-input" placeholder="Ex : AB-123-CD"
                  value={form.immatriculation} onChange={e => setForm({ ...form, immatriculation: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Modèle en jeu</label>
                <input className="form-input" placeholder="Ex : Schafter V12"
                  value={form.modele_jeu} onChange={e => setForm({ ...form, modele_jeu: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Modèle Discord</label>
                <input className="form-input" placeholder="Ex : Benefactor Schafter V12"
                  value={form.modele_discord} onChange={e => setForm({ ...form, modele_discord: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Image (URL)</label>
                <input className="form-input" placeholder="https://..."
                  value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Ajouter le véhicule'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">Liste des véhicules ({vehicules.length})</div>
        <div style={{ marginBottom: 14 }}>
          <input
            className="form-input"
            type="text"
            placeholder="Rechercher par immatriculation, modèle…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Image</th>
                <th>Immatriculation</th>
                <th>Modèle en jeu</th>
                <th>Modèle Discord</th>
                {isResponsable && <th style={{ width: 170 }}></th>}
              </tr>
            </thead>
            <tbody>
              {vehiculesFiltres.map(v => {
                const ed = editId === v.id
                return (
                  <tr key={v.id}>
                    <td>
                      {v.image ? (
                        <img src={v.image} alt={v.modele_jeu || 'véhicule'}
                          style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--or-border)' }} />
                      ) : (
                        <div style={{ width: 56, height: 36, borderRadius: 4, border: '1px dashed var(--or-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--texte-soft)' }}>—</div>
                      )}
                    </td>
                    {ed ? (
                      <>
                        <td><input className="form-input" style={{ width: 120, padding: '3px 7px', fontSize: 12 }} value={editForm.immatriculation} onChange={e => setEditForm(f => ({ ...f, immatriculation: e.target.value }))} /></td>
                        <td><input className="form-input" style={{ width: 150, padding: '3px 7px', fontSize: 12 }} value={editForm.modele_jeu} onChange={e => setEditForm(f => ({ ...f, modele_jeu: e.target.value }))} /></td>
                        <td><input className="form-input" style={{ width: 170, padding: '3px 7px', fontSize: 12 }} value={editForm.modele_discord} onChange={e => setEditForm(f => ({ ...f, modele_discord: e.target.value }))} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <input className="form-input" style={{ width: 130, padding: '3px 7px', fontSize: 12 }} placeholder="URL image" value={editForm.image} onChange={e => setEditForm(f => ({ ...f, image: e.target.value }))} />
                            <button className="btn btn-solid btn-sm" disabled={savingEdit} onClick={() => saveEdit(v.id)}>✓</button>
                            <button className="btn btn-or btn-sm" onClick={cancelEdit}>✕</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 500 }}>{v.immatriculation || '—'}</td>
                        <td>{v.modele_jeu || '—'}</td>
                        <td style={{ color: 'var(--texte-soft)' }}>{v.modele_discord || '—'}</td>
                        {isResponsable && (
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-or btn-sm" onClick={() => startEdit(v)}>✎ Modifier</button>
                              <button className="btn btn-danger btn-sm" disabled={deletingId === v.id} onClick={() => handleDelete(v.id)}>
                                {deletingId === v.id ? '...' : '🗑'}
                              </button>
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                )
              })}
              {vehiculesFiltres.length === 0 && (
                <tr><td colSpan={isResponsable ? 5 : 4} style={{ textAlign: 'center', color: 'var(--texte-soft)', padding: 20 }}>
                  {search ? 'Aucun résultat.' : 'Aucun véhicule enregistré.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
