import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const VIDE = {
  sens: 'achat',
  groupe: '',
  marchandise_type: 'drogue',
  marchandise_nom: '',
  quantite: '',
  frequence_jours: '1',
  paiement_type: 'argent_sale',
  paiement_quantite: '',
  paiement_marchandise_nom: '',
  bonus: '',
  commentaire: '',
}

const fmtMontant = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

export default function ContratGestion() {
  const [contrats, setContrats]   = useState([])
  const [drogues, setDrogues]     = useState([])
  const [consommables, setConsommables] = useState([])
  const [loading, setLoading]     = useState(true)
  const [msg, setMsg]             = useState({ type: '', text: '' })

  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(VIDE)
  const [saving, setSaving]       = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState(VIDE)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: c }, { data: d }, { data: cons }] = await Promise.all([
      supabase.from('contrats').select('*').order('created_at', { ascending: false }),
      supabase.from('drogues').select('*').order('nom'),
      supabase.from('consommables').select('*').eq('actif', true).order('nom'),
    ])
    setContrats(c || [])
    setDrogues(d || [])
    setConsommables(cons || [])
    setLoading(false)
  }

  const optionsMarchandise = (type) => type === 'drogue' ? drogues : consommables

  const toPayload = (f) => ({
    sens: f.sens,
    groupe: f.groupe.trim(),
    marchandise_type: f.marchandise_type,
    marchandise_nom: f.marchandise_nom,
    quantite: parseFloat(f.quantite) || 0,
    frequence_jours: parseInt(f.frequence_jours) || 1,
    paiement_type: f.paiement_type,
    paiement_quantite: parseFloat(f.paiement_quantite) || 0,
    paiement_marchandise_nom: f.paiement_type === 'argent_sale' ? null : (f.paiement_marchandise_nom || null),
    bonus: f.bonus.trim() || null,
    commentaire: f.commentaire.trim() || null,
  })

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    if (!form.groupe.trim() || !form.marchandise_nom || !form.quantite || !form.paiement_quantite) {
      setMsg({ type: 'error', text: 'Merci de remplir tous les champs obligatoires.' })
      setSaving(false); return
    }
    if (form.paiement_type !== 'argent_sale' && !form.paiement_marchandise_nom) {
      setMsg({ type: 'error', text: 'Merci de préciser la marchandise de paiement.' })
      setSaving(false); return
    }
    const { error } = await supabase.from('contrats').insert(toPayload(form))
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Contrat créé.' })
    setForm(VIDE)
    setShowForm(false)
    fetchAll()
  }

  const startEdit = (c) => {
    setEditingId(c.id)
    setEditForm({
      sens: c.sens,
      groupe: c.groupe,
      marchandise_type: c.marchandise_type,
      marchandise_nom: c.marchandise_nom,
      quantite: String(c.quantite),
      frequence_jours: String(c.frequence_jours),
      paiement_type: c.paiement_type,
      paiement_quantite: String(c.paiement_quantite),
      paiement_marchandise_nom: c.paiement_marchandise_nom || '',
      bonus: c.bonus || '',
      commentaire: c.commentaire || '',
      actif: c.actif,
    })
  }
  const cancelEdit = () => { setEditingId(null); setEditForm(VIDE) }

  const saveEdit = async (id) => {
    if (!editForm.groupe.trim() || !editForm.marchandise_nom || !editForm.quantite || !editForm.paiement_quantite) {
      setMsg({ type: 'error', text: 'Merci de remplir tous les champs obligatoires.' })
      return
    }
    if (editForm.paiement_type !== 'argent_sale' && !editForm.paiement_marchandise_nom) {
      setMsg({ type: 'error', text: 'Merci de préciser la marchandise de paiement.' })
      return
    }
    setSavingEdit(true)
    const { error } = await supabase.from('contrats').update({
      ...toPayload(editForm),
      actif: editForm.actif,
    }).eq('id', id)
    setSavingEdit(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Contrat mis à jour.' })
    cancelEdit()
    fetchAll()
  }

  const handleDelete = async (c) => {
    if (!window.confirm(`Supprimer le contrat ${c.sens === 'achat' ? "d'achat" : 'de vente'} avec "${c.groupe}" ?`)) return
    setDeletingId(c.id)
    const { error } = await supabase.from('contrats').delete().eq('id', c.id)
    setDeletingId(null)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Contrat supprimé.' })
    fetchAll()
  }

  const toggleActif = async (c) => {
    await supabase.from('contrats').update({ actif: !c.actif }).eq('id', c.id)
    fetchAll()
  }

  const descriptionContrat = (c) => {
    const action = c.sens === 'achat' ? 'achète' : 'vend'
    const prep   = c.sens === 'achat' ? 'à' : 'à'
    const paiement = c.paiement_type === 'argent_sale'
      ? fmtMontant(c.paiement_quantite)
      : `${c.paiement_quantite} ${c.paiement_marchandise_nom}`
    return `Nous ${action} ${c.quantite} ${c.marchandise_nom} ${prep} ${c.groupe} pour ${paiement}, tous les ${c.frequence_jours} jour${c.frequence_jours > 1 ? 's' : ''}.`
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const renderMarchandiseSelect = (f, setF, prefix = '') => (
    <>
      <div className="form-group">
        <label className="form-label">Type</label>
        <select className="form-select" value={f[`${prefix}marchandise_type`]}
          onChange={e => setF(s => ({ ...s, [`${prefix}marchandise_type`]: e.target.value, [`${prefix}marchandise_nom`]: '' }))}>
          <option value="drogue">Drogue</option>
          <option value="consommable">Consommable</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Marchandise</label>
        <select className="form-select" value={f[`${prefix}marchandise_nom`]}
          onChange={e => setF(s => ({ ...s, [`${prefix}marchandise_nom`]: e.target.value }))}>
          <option value="">— Choisir —</option>
          {optionsMarchandise(f[`${prefix}marchandise_type`]).map(o => (
            <option key={o.id} value={o.nom}>{o.nom}</option>
          ))}
        </select>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>Contrats</div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>Gestion des contrats</h1>
        </div>
        <button className="btn btn-solid btn-sm" onClick={() => { setShowForm(!showForm); setMsg({ type: '', text: '' }) }}>
          {showForm ? '✕ Annuler' : '+ Nouveau contrat'}
        </button>
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {showForm && (
        <div className="card">
          <div className="card-title">Nouveau contrat</div>
          <form onSubmit={handleCreate}>
            <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Nous nous engageons à</label>
                <select className="form-select" value={form.sens} onChange={e => setForm({ ...form, sens: e.target.value })}>
                  <option value="achat">Acheter</option>
                  <option value="vente">Vendre</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Quantité</label>
                <input className="form-input" type="number" min="0" step="1" required placeholder="Ex : 2000"
                  value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} />
              </div>
              {renderMarchandiseSelect(form, setForm)}
              <div className="form-group">
                <label className="form-label">{form.sens === 'achat' ? 'Au groupe' : 'Au groupe (client)'}</label>
                <input className="form-input" required placeholder="Ex : Ballas"
                  value={form.groupe} onChange={e => setForm({ ...form, groupe: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Tous les (jours)</label>
                <input className="form-input" type="number" min="1" step="1" required placeholder="Ex : 1"
                  value={form.frequence_jours} onChange={e => setForm({ ...form, frequence_jours: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">En échange de</label>
                <select className="form-select" value={form.paiement_type}
                  onChange={e => setForm({ ...form, paiement_type: e.target.value, paiement_marchandise_nom: '' })}>
                  <option value="argent_sale">Argent sale</option>
                  <option value="drogue">Drogue</option>
                  <option value="consommable">Consommable</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Quantité / montant</label>
                <input className="form-input" type="number" min="0" step="1" required placeholder="Ex : 5000"
                  value={form.paiement_quantite} onChange={e => setForm({ ...form, paiement_quantite: e.target.value })} />
              </div>
              {form.paiement_type !== 'argent_sale' && (
                <div className="form-group">
                  <label className="form-label">Marchandise de paiement</label>
                  <select className="form-select" value={form.paiement_marchandise_nom}
                    onChange={e => setForm({ ...form, paiement_marchandise_nom: e.target.value })}>
                    <option value="">— Choisir —</option>
                    {optionsMarchandise(form.paiement_type).map(o => (
                      <option key={o.id} value={o.nom}>{o.nom}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Bonus supplémentaire ?</label>
                <input className="form-input" placeholder="Ex : +10% de branches offertes"
                  value={form.bonus} onChange={e => setForm({ ...form, bonus: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Commentaire</label>
              <textarea className="form-input" rows={2} placeholder="Détails, conditions particulières…"
                value={form.commentaire} onChange={e => setForm({ ...form, commentaire: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Création...' : 'Créer le contrat'}
            </button>
          </form>
        </div>
      )}

      {contrats.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--texte-soft)' }}>
          Aucun contrat enregistré pour le moment.
        </div>
      )}

      {contrats.map(c => {
        const ed = editingId === c.id
        return (
          <div className="card" key={c.id} style={{ opacity: c.actif ? 1 : 0.55 }}>
            {ed ? (
              <>
                <div className="card-title">Modifier le contrat</div>
                <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Nous nous engageons à</label>
                    <select className="form-select" value={editForm.sens} onChange={e => setEditForm({ ...editForm, sens: e.target.value })}>
                      <option value="achat">Acheter</option>
                      <option value="vente">Vendre</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantité</label>
                    <input className="form-input" type="number" min="0" step="1" required
                      value={editForm.quantite} onChange={e => setEditForm({ ...editForm, quantite: e.target.value })} />
                  </div>
                  {renderMarchandiseSelect(editForm, setEditForm)}
                  <div className="form-group">
                    <label className="form-label">Groupe</label>
                    <input className="form-input" required
                      value={editForm.groupe} onChange={e => setEditForm({ ...editForm, groupe: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tous les (jours)</label>
                    <input className="form-input" type="number" min="1" step="1" required
                      value={editForm.frequence_jours} onChange={e => setEditForm({ ...editForm, frequence_jours: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">En échange de</label>
                    <select className="form-select" value={editForm.paiement_type}
                      onChange={e => setEditForm({ ...editForm, paiement_type: e.target.value, paiement_marchandise_nom: '' })}>
                      <option value="argent_sale">Argent sale</option>
                      <option value="drogue">Drogue</option>
                      <option value="consommable">Consommable</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantité / montant</label>
                    <input className="form-input" type="number" min="0" step="1" required
                      value={editForm.paiement_quantite} onChange={e => setEditForm({ ...editForm, paiement_quantite: e.target.value })} />
                  </div>
                  {editForm.paiement_type !== 'argent_sale' && (
                    <div className="form-group">
                      <label className="form-label">Marchandise de paiement</label>
                      <select className="form-select" value={editForm.paiement_marchandise_nom}
                        onChange={e => setEditForm({ ...editForm, paiement_marchandise_nom: e.target.value })}>
                        <option value="">— Choisir —</option>
                        {optionsMarchandise(editForm.paiement_type).map(o => (
                          <option key={o.id} value={o.nom}>{o.nom}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Bonus supplémentaire ?</label>
                    <input className="form-input"
                      value={editForm.bonus} onChange={e => setEditForm({ ...editForm, bonus: e.target.value })} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">Commentaire</label>
                  <textarea className="form-input" rows={2}
                    value={editForm.commentaire} onChange={e => setEditForm({ ...editForm, commentaire: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-solid btn-sm" disabled={savingEdit} onClick={() => saveEdit(c.id)}>
                    {savingEdit ? '...' : '✓ Sauver'}
                  </button>
                  <button className="btn btn-or btn-sm" onClick={cancelEdit}>✕ Annuler</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`badge ${c.sens === 'achat' ? 'badge-bleu' : 'badge-vert'}`}>
                      {c.sens === 'achat' ? 'Achat' : 'Vente'}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--or-pale)' }}>{c.groupe}</span>
                    <span
                      className={`badge ${c.actif ? 'badge-vert' : 'badge-gris'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleActif(c)}
                      title="Cliquer pour basculer actif/inactif">
                      {c.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-or btn-sm" onClick={() => startEdit(c)}>✎ Modifier</button>
                    <button className="btn btn-danger btn-sm" disabled={deletingId === c.id} onClick={() => handleDelete(c)}>
                      {deletingId === c.id ? '...' : '🗑'}
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 14, color: 'var(--texte)', marginBottom: c.bonus || c.commentaire ? 8 : 0 }}>
                  {descriptionContrat(c)}
                </p>
                {c.bonus && (
                  <div style={{ fontSize: 13, color: 'var(--or-pale)' }}>
                    <strong>Bonus :</strong> {c.bonus}
                  </div>
                )}
                {c.commentaire && (
                  <div style={{ fontSize: 13, color: 'var(--texte-soft)', marginTop: 4 }}>
                    {c.commentaire}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
