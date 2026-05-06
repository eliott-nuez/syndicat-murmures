import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const RANGS = ['membre', 'responsable', 'direction']

export default function Administration() {
  const [membres, setMembres] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState({ type: '', text: '' })

  const [form, setForm] = useState({
    surnom: '', nom: '', prenom: '',
    mot_de_passe: '', rang: 'membre', actif: true,
  })

  const [editRang, setEditRang]   = useState({})
  const [editMdp, setEditMdp]     = useState({})
  const [newMdp, setNewMdp]       = useState({})

  useEffect(() => { fetchMembres() }, [])

  const fetchMembres = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('membres')
      .select('id, surnom, nom, prenom, rang, actif, created_at')
      .order('surnom')
    setMembres(data || [])
    setLoading(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })

    const { error } = await supabase.from('membres').insert({
      surnom:       form.surnom,
      nom:          form.nom || null,
      prenom:       form.prenom || null,
      mot_de_passe: form.mot_de_passe,
      rang:         form.rang,
      actif:        form.actif,
    })

    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: `Membre "${form.surnom}" créé.` })
    setShowForm(false)
    setForm({ surnom: '', nom: '', prenom: '', mot_de_passe: '', rang: 'membre', actif: true })
    fetchMembres()
  }

  const handleUpdateRang = async (id, rang) => {
    await supabase.from('membres').update({ rang }).eq('id', id)
    setMsg({ type: 'success', text: 'Rang mis à jour.' })
    setEditRang(prev => ({ ...prev, [id]: false }))
    fetchMembres()
  }

  const handleUpdateMdp = async (id) => {
    const mdp = newMdp[id]
    if (!mdp || mdp.length < 4) { setMsg({ type: 'error', text: 'Mot de passe trop court.' }); return }
    await supabase.from('membres').update({ mot_de_passe: mdp }).eq('id', id)
    setMsg({ type: 'success', text: 'Mot de passe mis à jour.' })
    setEditMdp(prev => ({ ...prev, [id]: false }))
    setNewMdp(prev => ({ ...prev, [id]: '' }))
  }

  const handleToggleActif = async (id, actif) => {
    await supabase.from('membres').update({ actif: !actif }).eq('id', id)
    fetchMembres()
  }

  const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR')

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
            Direction
          </div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
            Administration
          </h1>
        </div>
        <button className="btn btn-solid" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Annuler' : '+ Créer un membre'}
        </button>
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* ── Formulaire création ── */}
      {showForm && (
        <div className="card">
          <div className="card-title">Nouveau membre</div>
          <form onSubmit={handleCreate}>
            <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Surnom *</label>
                <input className="form-input" required value={form.surnom}
                  onChange={e => setForm({ ...form, surnom: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Mot de passe *</label>
                <input className="form-input" type="password" required value={form.mot_de_passe}
                  onChange={e => setForm({ ...form, mot_de_passe: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Prénom</label>
                <input className="form-input" value={form.prenom}
                  onChange={e => setForm({ ...form, prenom: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Nom</label>
                <input className="form-input" value={form.nom}
                  onChange={e => setForm({ ...form, nom: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Rang</label>
                <select className="form-select" value={form.rang}
                  onChange={e => setForm({ ...form, rang: e.target.value })}>
                  {RANGS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <label className="form-label">Actif</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8 }}>
                  <input type="checkbox" id="actif" checked={form.actif}
                    onChange={e => setForm({ ...form, actif: e.target.checked })}
                    style={{ accentColor: 'var(--or)', width: 16, height: 16 }} />
                  <label htmlFor="actif" style={{ fontSize: 13, color: 'var(--texte)' }}>
                    Compte actif
                  </label>
                </div>
              </div>
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Création...' : 'Créer le membre'}
            </button>
          </form>
        </div>
      )}

      {/* ── Liste membres ── */}
      <div className="card">
        <div className="card-title">Membres ({membres.length})</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Surnom</th>
                <th>Prénom / Nom</th>
                <th>Rang</th>
                <th>Statut</th>
                <th>Créé le</th>
                <th>Mot de passe</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {membres.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.surnom}</td>
                  <td style={{ color: 'var(--texte-soft)' }}>{[m.prenom, m.nom].filter(Boolean).join(' ') || '—'}</td>

                  {/* Rang éditable */}
                  <td>
                    {editRang[m.id] ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select className="form-select" style={{ minWidth: 120 }}
                          defaultValue={m.rang}
                          onChange={e => setEditRang(prev => ({ ...prev, [m.id]: e.target.value }))}
                        >
                          {RANGS.map(r => <option key={r}>{r}</option>)}
                        </select>
                        <button className="btn btn-solid btn-sm"
                          onClick={() => handleUpdateRang(m.id, editRang[m.id] === true ? m.rang : editRang[m.id])}>
                          ✓
                        </button>
                        <button className="btn btn-or btn-sm"
                          onClick={() => setEditRang(prev => ({ ...prev, [m.id]: false }))}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => setEditRang(prev => ({ ...prev, [m.id]: true }))}
                        className={`badge ${m.rang === 'direction' ? '' : m.rang === 'responsable' ? 'badge-bleu' : 'badge-gris'}`}
                        style={{
                          cursor: 'pointer',
                          ...(m.rang === 'direction' ? { background: 'var(--or-glow)', color: 'var(--or)', border: '1px solid var(--or-border)' } : {}),
                        }}
                        title="Cliquer pour modifier">
                        {m.rang} ✎
                      </span>
                    )}
                  </td>

                  {/* Actif toggle */}
                  <td>
                    <button
                      onClick={() => handleToggleActif(m.id, m.actif)}
                      className={`badge ${m.actif ? 'badge-vert' : 'badge-rouge'}`}
                      style={{ cursor: 'pointer', border: 'none', fontFamily: 'var(--font-ui)' }}
                    >
                      {m.actif ? 'Connecté' : 'Hors ligne'}
                    </button>
                  </td>

                  <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(m.created_at)}</td>

                  {/* MDP */}
                  <td>
                    {editMdp[m.id] ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input className="form-input" type="password" placeholder="Nouveau MDP"
                          style={{ width: 130 }}
                          value={newMdp[m.id] || ''}
                          onChange={e => setNewMdp(prev => ({ ...prev, [m.id]: e.target.value }))}
                        />
                        <button className="btn btn-solid btn-sm"
                          onClick={() => handleUpdateMdp(m.id)}>✓</button>
                        <button className="btn btn-or btn-sm"
                          onClick={() => setEditMdp(prev => ({ ...prev, [m.id]: false }))}>✕</button>
                      </div>
                    ) : (
                      <button className="btn btn-or btn-sm"
                        onClick={() => setEditMdp(prev => ({ ...prev, [m.id]: true }))}>
                        Changer MDP
                      </button>
                    )}
                  </td>

                  <td>
                    {/* Placeholder pour d'autres actions futures */}
                    <span style={{ color: 'var(--texte-soft)', fontSize: 11 }}>—</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
