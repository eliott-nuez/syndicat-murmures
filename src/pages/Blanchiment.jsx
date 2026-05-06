import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Blanchiment() {
  const [blanchisseurs, setBlanchisseurs] = useState([])
  const [operations, setOperations]       = useState([])
  const [showForm, setShowForm]           = useState(false)
  const [showFormBlanch, setShowFormBlanch] = useState(false)
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [msg, setMsg]                     = useState({ type: '', text: '' })
  const [now, setNow]                     = useState(new Date())

  const [formOp, setFormOp] = useState({
    blanchisseur_id:   '',
    montant_sale_envoye: '',
    note: '',
  })

  const [formBlanch, setFormBlanch] = useState({
    nom: '', gang: '', taux_pct: '', commission_fixe: '', temps_traitement_min: '',
  })

  useEffect(() => {
    fetchAll()
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: bl }, { data: ops }] = await Promise.all([
      supabase.from('blanchisseurs_disponibilite').select('*').order('nom'),
      supabase.from('historique_blanchiment').select('*').limit(50),
    ])
    setBlanchisseurs(bl || [])
    setOperations(ops || [])
    setLoading(false)
  }

  const handleSubmitOp = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })

    const { error } = await supabase.from('operations_blanchiment').insert({
      blanchisseur_id:    formOp.blanchisseur_id,
      montant_sale_envoye: parseFloat(formOp.montant_sale_envoye),
      note:               formOp.note || null,
      // Les autres champs sont calculés par le trigger SQL
      taux_applique:            0,
      commission_fixe_appliquee: 0,
      montant_propre_recu:      0,
      disponible_le:            new Date().toISOString(),
      envoye_le:                new Date().toISOString(),
    })

    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Opération lancée.' })
    setShowForm(false)
    setFormOp({ blanchisseur_id: '', montant_sale_envoye: '', note: '' })
    fetchAll()
  }

  const handleSubmitBlanch = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('blanchisseurs').insert({
      nom:                  formBlanch.nom,
      gang:                 formBlanch.gang || null,
      taux_pct:             parseFloat(formBlanch.taux_pct),
      commission_fixe:      parseFloat(formBlanch.commission_fixe) || 0,
      temps_traitement_min: parseInt(formBlanch.temps_traitement_min),
    })
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Blanchisseur ajouté.' })
    setShowFormBlanch(false)
    setFormBlanch({ nom: '', gang: '', taux_pct: '', commission_fixe: '', temps_traitement_min: '' })
    fetchAll()
  }

  const terminerOp = async (opId) => {
    await supabase.from('operations_blanchiment')
      .update({ statut: 'Terminé' })
      .eq('id', opId)
    fetchAll()
  }

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  const fmtDate = (d) =>
    new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const selectedBlanch = blanchisseurs.find(b => b.id === formOp.blanchisseur_id)
  const previewNet = selectedBlanch && formOp.montant_sale_envoye
    ? parseFloat(formOp.montant_sale_envoye) * (1 - selectedBlanch.taux_pct / 100) - selectedBlanch.commission_fixe
    : null

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
            Direction
          </div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
            Blanchiment
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-or" onClick={() => setShowFormBlanch(!showFormBlanch)}>
            + Blanchisseur
          </button>
          <button className="btn btn-solid" onClick={() => setShowForm(!showForm)}>
            + Lancer une opération
          </button>
        </div>
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* ── Formulaire blanchisseur ── */}
      {showFormBlanch && (
        <div className="card">
          <div className="card-title">Ajouter un blanchisseur</div>
          <form onSubmit={handleSubmitBlanch}>
            <div className="grid-3" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Nom</label>
                <input className="form-input" required value={formBlanch.nom}
                  onChange={e => setFormBlanch({ ...formBlanch, nom: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Gang</label>
                <input className="form-input" value={formBlanch.gang}
                  onChange={e => setFormBlanch({ ...formBlanch, gang: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Taux prélevé (%)</label>
                <input className="form-input" type="number" min="0" max="99" step="0.1" required
                  value={formBlanch.taux_pct}
                  onChange={e => setFormBlanch({ ...formBlanch, taux_pct: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Commission fixe ($)</label>
                <input className="form-input" type="number" min="0" step="1"
                  value={formBlanch.commission_fixe}
                  onChange={e => setFormBlanch({ ...formBlanch, commission_fixe: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Durée traitement (min)</label>
                <input className="form-input" type="number" min="0" required
                  value={formBlanch.temps_traitement_min}
                  onChange={e => setFormBlanch({ ...formBlanch, temps_traitement_min: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>Ajouter</button>
          </form>
        </div>
      )}

      {/* ── Formulaire opération ── */}
      {showForm && (
        <div className="card">
          <div className="card-title">Nouvelle opération de blanchiment</div>
          <form onSubmit={handleSubmitOp}>
            <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Blanchisseur</label>
                <select className="form-select" required
                  value={formOp.blanchisseur_id}
                  onChange={e => setFormOp({ ...formOp, blanchisseur_id: e.target.value })}
                >
                  <option value="">— Sélectionner —</option>
                  {blanchisseurs.filter(b => b.disponible).map(b => (
                    <option key={b.id} value={b.id}>
                      {b.nom} ({b.gang || 'indép.'}) — {b.taux_pct}% + {fmt(b.commission_fixe)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Montant sale envoyé ($)</label>
                <input className="form-input" type="number" min="0" step="1" required
                  placeholder="Ex : 500000"
                  value={formOp.montant_sale_envoye}
                  onChange={e => setFormOp({ ...formOp, montant_sale_envoye: e.target.value })}
                />
              </div>
            </div>

            {/* Prévisualisation */}
            {previewNet !== null && (
              <div style={{
                background: 'var(--or-glow)',
                border: '1px solid var(--or-border)',
                borderRadius: 6,
                padding: '12px 16px',
                marginBottom: 14,
                display: 'flex',
                gap: 24,
                fontSize: 13,
              }}>
                <span>Envoyé : <strong>{fmt(parseFloat(formOp.montant_sale_envoye))}</strong></span>
                <span>Taux : <strong style={{ color: '#e05555' }}>− {selectedBlanch.taux_pct}%</strong></span>
                <span>Commission : <strong style={{ color: '#e05555' }}>− {fmt(selectedBlanch.commission_fixe)}</strong></span>
                <span>Récupéré : <strong style={{ color: '#5cba8a' }}>{fmt(previewNet)}</strong></span>
                <span>Perte : <strong style={{ color: '#e05555' }}>{fmt(parseFloat(formOp.montant_sale_envoye) - previewNet)}</strong></span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Note</label>
              <input className="form-input" type="text" value={formOp.note}
                onChange={e => setFormOp({ ...formOp, note: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>Lancer</button>
          </form>
        </div>
      )}

      {/* ── Disponibilité blanchisseurs ── */}
      <div className="card">
        <div className="card-title">Blanchisseurs</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Gang</th>
                <th>Taux</th>
                <th>Commission fixe</th>
                <th>Durée</th>
                <th>Statut</th>
                <th>Temps restant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {blanchisseurs.map(b => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 500 }}>{b.nom}</td>
                  <td style={{ color: 'var(--texte-soft)' }}>{b.gang || '—'}</td>
                  <td style={{ color: '#e05555' }}>{b.taux_pct}%</td>
                  <td>{fmt(b.commission_fixe)}</td>
                  <td>{b.temps_traitement_min} min</td>
                  <td>
                    <span className={`badge ${b.disponible ? 'badge-vert' : 'badge-rouge'}`}>
                      {b.disponible ? 'Disponible' : 'Occupé'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--or)', fontFamily: 'var(--font-corps)' }}>
                    {b.disponible ? '—' : `${b.minutes_restantes} min`}
                  </td>
                  <td>
                    {!b.disponible && b.operation_en_cours_id && (
                      <button className="btn btn-or btn-sm"
                        onClick={() => terminerOp(b.operation_en_cours_id)}>
                        ✓ Terminé
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Historique ── */}
      <div className="card">
        <div className="card-title">Historique des opérations</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Blanchisseur</th>
                <th>Gang</th>
                <th>Montant sale</th>
                <th>Récupéré</th>
                <th>Perte</th>
                <th>Taux appliqué</th>
                <th>Statut</th>
                <th>Date envoi</th>
                <th>Disponible le</th>
              </tr>
            </thead>
            <tbody>
              {operations.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 500 }}>{o.blanchisseur}</td>
                  <td style={{ color: 'var(--texte-soft)' }}>{o.gang || '—'}</td>
                  <td>{fmt(o.montant_sale_envoye)}</td>
                  <td style={{ color: '#5cba8a' }}>{fmt(o.montant_propre_recu)}</td>
                  <td style={{ color: '#e05555' }}>− {fmt(o.perte_totale)}</td>
                  <td style={{ color: '#e8a84c' }}>{o.taux_applique}%</td>
                  <td>
                    <span className={`badge ${o.statut === 'Terminé' ? 'badge-vert' : o.statut === 'Annulé' ? 'badge-rouge' : 'badge-orange'}`}>
                      {o.statut}
                    </span>
                  </td>
                  <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(o.envoye_le)}</td>
                  <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(o.disponible_le)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}