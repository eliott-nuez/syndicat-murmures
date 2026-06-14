import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const VIDE_GARAGE = { id_garage: '', lieu: '', numero: '', nombre_places: '' }

export default function Garage() {
  const membre = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const isResponsable = ['responsable', 'direction'].includes(membre.rang)

  const [garages, setGarages]         = useState([])
  const [emplacements, setEmplacements] = useState([])
  const [voitures, setVoitures]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [msg, setMsg]                 = useState({ type: '', text: '' })

  const [showForm, setShowForm]       = useState(false)
  const [form, setForm]               = useState(VIDE_GARAGE)
  const [saving, setSaving]           = useState(false)

  const [deletingGarageId, setDeletingGarageId] = useState(null)
  const [addingSlotFor, setAddingSlotFor]       = useState(null)

  const [editingEmpId, setEditingEmpId] = useState(null)
  const [editVoitureId, setEditVoitureId] = useState('')
  const [savingEmp, setSavingEmp]       = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: g }, { data: e }, { data: v }] = await Promise.all([
      supabase.from('garages').select('*').order('id_garage'),
      supabase.from('emplacements').select('*, voitures(*)').order('numero'),
      supabase.from('voitures').select('*').order('modele_jeu'),
    ])
    setGarages(g || [])
    setEmplacements(e || [])
    setVoitures(v || [])
    setLoading(false)
  }

  // ── Création garage ──────────────────────────────────────────────────────
  const handleCreateGarage = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    const nbPlaces = parseInt(form.nombre_places) || 0

    const { data: garage, error } = await supabase.from('garages').insert({
      id_garage: form.id_garage,
      lieu: form.lieu || null,
      numero: form.numero || null,
      nombre_places: nbPlaces,
    }).select().single()

    if (error) { setSaving(false); setMsg({ type: 'error', text: error.message }); return }

    if (nbPlaces > 0) {
      const slots = Array.from({ length: nbPlaces }, (_, i) => ({ garage_id: garage.id, numero: i + 1 }))
      const { error: errSlots } = await supabase.from('emplacements').insert(slots)
      if (errSlots) { setSaving(false); setMsg({ type: 'error', text: errSlots.message }); return }
    }

    setSaving(false)
    setMsg({ type: 'success', text: `Garage "${form.id_garage}" créé avec ${nbPlaces} emplacement(s).` })
    setForm(VIDE_GARAGE)
    setShowForm(false)
    fetchAll()
  }

  const handleDeleteGarage = async (g) => {
    if (!window.confirm(`Supprimer le garage "${g.id_garage}" et tous ses emplacements ?`)) return
    setDeletingGarageId(g.id)
    const { error } = await supabase.from('garages').delete().eq('id', g.id)
    setDeletingGarageId(null)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: `Garage "${g.id_garage}" supprimé.` })
    fetchAll()
  }

  // ── Emplacements ──────────────────────────────────────────────────────────
  const handleAddEmplacement = async (garage) => {
    setAddingSlotFor(garage.id)
    const numAuto = (emplacements.filter(e => e.garage_id === garage.id).reduce((max, e) => Math.max(max, e.numero), 0)) + 1
    const { error } = await supabase.from('emplacements').insert({ garage_id: garage.id, numero: numAuto })
    setAddingSlotFor(null)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    fetchAll()
  }

  const handleDeleteEmplacement = async (emp) => {
    if (!window.confirm(`Supprimer l'emplacement n°${emp.numero} ?`)) return
    const { error } = await supabase.from('emplacements').delete().eq('id', emp.id)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    fetchAll()
  }

  const startEditEmplacement = (emp) => {
    setEditingEmpId(emp.id)
    setEditVoitureId(emp.voiture_id || '')
  }
  const cancelEditEmplacement = () => { setEditingEmpId(null); setEditVoitureId('') }

  const saveEmplacement = async (emp) => {
    setSavingEmp(true)
    const voitureId = editVoitureId || null
    const update = voitureId
      ? { voiture_id: voitureId, present: true, occupant_plaque: null }
      : { voiture_id: null, occupant_plaque: null }
    const { error } = await supabase.from('emplacements').update(update).eq('id', emp.id)
    setSavingEmp(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    cancelEditEmplacement()
    fetchAll()
  }

  // Bascule manuelle du statut (en attendant l'automatisation via le bot)
  const toggleStatutAssigne = async (emp) => {
    await supabase.from('emplacements').update({ present: !emp.present, updated_at: new Date().toISOString() }).eq('id', emp.id)
    fetchAll()
  }
  const toggleStatutLibre = async (emp) => {
    if (emp.occupant_plaque) {
      await supabase.from('emplacements').update({ occupant_plaque: null, updated_at: new Date().toISOString() }).eq('id', emp.id)
      fetchAll()
    } else {
      const plaque = window.prompt('Plaque d\'immatriculation du véhicule garé :')
      if (plaque === null) return
      await supabase.from('emplacements').update({ occupant_plaque: plaque.trim() || null, updated_at: new Date().toISOString() }).eq('id', emp.id)
      fetchAll()
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>Stock</div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>Garage</h1>
        </div>
        {isResponsable && (
          <button className="btn btn-solid btn-sm" onClick={() => { setShowForm(!showForm); setMsg({ type: '', text: '' }) }}>
            {showForm ? '✕ Annuler' : '+ Nouveau garage'}
          </button>
        )}
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {isResponsable && showForm && (
        <div className="card">
          <div className="card-title">Nouveau garage</div>
          <form onSubmit={handleCreateGarage}>
            <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">ID garage</label>
                <input className="form-input" required placeholder="Ex : 167782"
                  value={form.id_garage} onChange={e => setForm({ ...form, id_garage: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Lieu</label>
                <input className="form-input" placeholder="Ex : Vinewood"
                  value={form.lieu} onChange={e => setForm({ ...form, lieu: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Numéro de garage</label>
                <input className="form-input" placeholder="Ex : 12"
                  value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Nombre de places</label>
                <input className="form-input" type="number" min="0" step="1" required placeholder="Ex : 8"
                  value={form.nombre_places} onChange={e => setForm({ ...form, nombre_places: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Création...' : 'Créer le garage'}
            </button>
          </form>
        </div>
      )}

      {garages.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--texte-soft)' }}>
          Aucun garage enregistré pour le moment.
        </div>
      )}

      {garages.map(g => {
        const slots = emplacements.filter(e => e.garage_id === g.id)
        return (
          <div className="card" key={g.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <div>
                <div className="card-title" style={{ marginBottom: 2, paddingBottom: 0, border: 'none' }}>
                  Garage {g.id_garage}{g.numero ? ` — n°${g.numero}` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--texte-soft)' }}>
                  {g.lieu || 'Lieu non renseigné'} · {slots.length} emplacement{slots.length > 1 ? 's' : ''}
                </div>
              </div>
              {isResponsable && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-or btn-sm" disabled={addingSlotFor === g.id} onClick={() => handleAddEmplacement(g)}>
                    {addingSlotFor === g.id ? '...' : '+ Emplacement'}
                  </button>
                  <button className="btn btn-danger btn-sm" disabled={deletingGarageId === g.id} onClick={() => handleDeleteGarage(g)}>
                    {deletingGarageId === g.id ? '...' : '🗑 Supprimer'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid-5">
              {slots.map(emp => {
                const ed = editingEmpId === emp.id
                const v = emp.voitures
                return (
                  <div key={emp.id} style={{
                    border: '1px solid var(--or-border)', borderRadius: 'var(--radius-lg)',
                    padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
                    background: 'rgba(255,255,255,0.02)',
                  }}>
                    {ed ? (
                      <>
                        <div style={{ fontSize: 11, color: 'var(--texte-soft)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          Emplacement n°{emp.numero}
                        </div>
                        <select className="form-select" value={editVoitureId} onChange={e => setEditVoitureId(e.target.value)}>
                          <option value="">— Libre (véhicule perso) —</option>
                          {voitures.map(vo => (
                            <option key={vo.id} value={vo.id}>{vo.modele_jeu || vo.modele_discord || vo.immatriculation}{vo.immatriculation ? ` (${vo.immatriculation})` : ''}</option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-solid btn-sm" disabled={savingEmp} onClick={() => saveEmplacement(emp)}>✓ Sauver</button>
                          <button className="btn btn-or btn-sm" onClick={cancelEditEmplacement}>✕</button>
                          <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => handleDeleteEmplacement(emp)}>🗑</button>
                        </div>
                      </>
                    ) : v ? (
                      <>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {v.image ? (
                            <img src={v.image} alt={v.modele_jeu || ''} style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--or-border)' }} />
                          ) : (
                            <div style={{ width: 56, height: 36, borderRadius: 4, border: '1px dashed var(--or-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--texte-soft)' }}>—</div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--or-pale)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.modele_jeu || v.modele_discord || '—'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--texte-soft)' }}>{v.immatriculation || '—'}</div>
                          </div>
                          <span className={`badge ${emp.present ? 'badge-vert' : 'badge-rouge'}`}
                            style={{ cursor: isResponsable ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                            onClick={isResponsable ? () => toggleStatutAssigne(emp) : undefined}>
                            {emp.present ? 'Garage' : 'Sorti'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--texte-soft)' }}>
                          Emplacement n°{emp.numero}
                          {isResponsable && (
                            <button className="btn btn-or btn-sm" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }} onClick={() => startEditEmplacement(emp)}>✎</button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 500 }}>Emplacement n°{emp.numero}</div>
                          <span className={`badge ${emp.occupant_plaque ? 'badge-rouge' : 'badge-vert'}`}
                            style={{ cursor: isResponsable ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                            onClick={isResponsable ? () => toggleStatutLibre(emp) : undefined}>
                            {emp.occupant_plaque ? `Occupé : ${emp.occupant_plaque}` : 'Libre'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--texte-soft)' }}>
                          Place véhicule perso
                          {isResponsable && (
                            <button className="btn btn-or btn-sm" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }} onClick={() => startEditEmplacement(emp)}>✎</button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
              {slots.length === 0 && (
                <div style={{ color: 'var(--texte-soft)', fontSize: 13, padding: 12 }}>
                  {isResponsable ? 'Aucun emplacement. Clique sur « + Emplacement » pour en ajouter.' : 'Aucun emplacement.'}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {isResponsable && (
        <div style={{ fontSize: 11, color: 'var(--texte-soft)' }}>
          Clique sur ✎ pour assigner un véhicule du catalogue à un emplacement (sinon il reste « libre » pour un véhicule personnel).
          Les badges « Garage / Sorti » et « Libre / Occupé » se mettront bientôt à jour automatiquement via le Bot Murmures ; en attendant, clique dessus pour les basculer manuellement.
        </div>
      )}
    </div>
  )
}
