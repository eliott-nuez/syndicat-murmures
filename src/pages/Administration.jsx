import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const RANGS = ['membre', 'responsable', 'direction']
const TYPES_ACTIVITE = ['', 'ATM', 'Cambriolage', 'Supérette', 'Go Fast', 'Plantation']

export default function Administration() {
  // ── Membres ────────────────────────────────────────────────────────────────
  const [membres, setMembres] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading]  = useState(true)
  const [saving, setSaving]    = useState(false)
  const [msg, setMsg]          = useState({ type: '', text: '' })
  const [form, setForm]        = useState({ surnom: '', nom: '', prenom: '', mot_de_passe: '', rang: 'membre', actif: true })
  const [editRang, setEditRang] = useState({})
  const [editMdp, setEditMdp]  = useState({})
  const [newMdp, setNewMdp]    = useState({})

  // ── Bot Control ────────────────────────────────────────────────────────────
  const [botAction, setBotAction]   = useState(null) // null | 'loading' | 'done' | 'error'
  const [botOutput, setBotOutput]   = useState('')

  const botControl = async (action) => {
    setBotAction('loading'); setBotOutput(null)
    try {
      const res  = await fetch('/api/bot-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      setBotOutput({ action, ...data })
      setBotAction(res.ok ? 'done' : 'error')
    } catch (err) {
      setBotOutput({ error: err.message })
      setBotAction('error')
    }
  }

  const BotStatusBadge = ({ data }) => {
    if (!data) return null
    if (data.action === 'bot-status') {
      const { etat, detail } = data
      const cfg = {
        'OK':       { cls: 'badge-vert',   icon: '✅', label: 'Fonctionne bien' },
        'Problème': { cls: 'badge-orange', icon: '⚠️', label: `Problème : ${detail}` },
        'KO':       { cls: 'badge-rouge',  icon: '❌', label: `KO — ${detail}` },
      }[etat] ?? { cls: 'badge-rouge', icon: '❌', label: 'KO' }
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <span className={`badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
          {etat === 'OK' && <span style={{ fontSize: 12, color: 'var(--texte-soft)' }}>{detail}</span>}
        </div>
      )
    }
    if (data.action === 'bot-restart' || data.action === 'bot-reset-status') {
      return <div style={{ marginTop: 12, color: 'var(--or-pale)', fontSize: 13 }}>✔ {data.message}</div>
    }
    if (data.logs) {
      return (
        <pre style={{
          background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 14, marginTop: 12,
          fontSize: 11, color: 'var(--texte)', overflowX: 'auto',
          whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto',
        }}>{data.logs}</pre>
      )
    }
    if (data.error) {
      return <div style={{ marginTop: 12, color: '#e05555', fontSize: 13 }}>❌ {data.error}</div>
    }
    return null
  }

  // ── Commission ─────────────────────────────────────────────────────────────
  const [tranches, setTranches]             = useState([])
  const [multis, setMultis]                 = useState({ membre: 3, responsable: 2, direction: 1 })
  const [formTranche, setFormTranche]       = useState({ min_montant: '', max_montant: '', taux_pct: '' })
  const [showFormTranche, setShowFormTranche] = useState(false)
  const [savingComm, setSavingComm]         = useState(false)
  const [msgComm, setMsgComm]              = useState({ type: '', text: '' })

  useEffect(() => {
    fetchMembres()
    fetchCommission()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchMembres = async () => {
    setLoading(true)
    const { data } = await supabase.from('membres').select('id, surnom, nom, prenom, rang, actif, created_at').order('surnom')
    setMembres(data || [])
    setLoading(false)
  }

  const fetchCommission = async () => {
    const [{ data: tranchesData }, { data: paramsData }] = await Promise.all([
      supabase.from('tranches_commission').select('*').order('ordre'),
      supabase.from('parametres').select('cle, valeur').in('cle', [
        'commission_multiplicateur_membre', 'commission_multiplicateur_responsable', 'commission_multiplicateur_direction',
      ]),
    ])
    setTranches(tranchesData || [])
    const map = {}
    ;(paramsData || []).forEach(p => { map[p.cle.replace('commission_multiplicateur_', '')] = Number(p.valeur) })
    setMultis(prev => ({ ...prev, ...map }))
  }

  // ── Membres handlers ────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true); setMsg({ type: '', text: '' })
    const { error } = await supabase.from('membres').insert({
      surnom: form.surnom, nom: form.nom || null, prenom: form.prenom || null,
      mot_de_passe: form.mot_de_passe, rang: form.rang, actif: form.actif,
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
    const { data: mem, error: memErr } = await supabase.from('membres').select('surnom').eq('id', id).single()
    if (memErr || !mem) { setMsg({ type: 'error', text: 'Membre introuvable.' }); return }
    const { error: tableErr } = await supabase.from('membres').update({ mot_de_passe: mdp }).eq('id', id)
    if (tableErr) { setMsg({ type: 'error', text: 'Erreur table: ' + tableErr.message }); return }
    const { error: rpcErr } = await supabase.rpc('admin_update_auth_password', { p_surnom: mem.surnom, p_password: mdp })
    if (rpcErr) { setMsg({ type: 'error', text: 'Erreur Auth: ' + rpcErr.message }); return }
    setMsg({ type: 'success', text: 'Mot de passe mis à jour.' })
    setEditMdp(prev => ({ ...prev, [id]: false }))
    setNewMdp(prev => ({ ...prev, [id]: '' }))
  }

  const handleToggleActif = async (id, actif) => {
    await supabase.from('membres').update({ actif: !actif }).eq('id', id)
    fetchMembres()
  }

  // ── Commission handlers ─────────────────────────────────────────────────────
  const handleSaveMultis = async () => {
    setSavingComm(true); setMsgComm({ type: '', text: '' })
    const upserts = Object.entries(multis).map(([rang, val]) => ({
      cle: `commission_multiplicateur_${rang}`, valeur: Number(val),
    }))
    const { error } = await supabase.from('parametres').upsert(upserts, { onConflict: 'cle' })
    setSavingComm(false)
    setMsgComm(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Multiplicateurs sauvegardés.' })
  }

  const handleCreateTranche = async (e) => {
    e.preventDefault()
    const maxOrdre = tranches.reduce((m, t) => Math.max(m, t.ordre), 0)
    const { error } = await supabase.from('tranches_commission').insert({
      ordre: maxOrdre + 1,
      min_montant: parseFloat(formTranche.min_montant) || 0,
      max_montant: formTranche.max_montant === '' ? null : parseFloat(formTranche.max_montant),
      taux_pct: parseFloat(formTranche.taux_pct) || 0,
    })
    if (error) { setMsgComm({ type: 'error', text: error.message }); return }
    setMsgComm({ type: 'success', text: 'Tranche ajoutée.' })
    setShowFormTranche(false)
    setFormTranche({ min_montant: '', max_montant: '', taux_pct: '' })
    fetchCommission()
  }

  const handleDeleteTranche = async (id) => {
    if (!window.confirm('Supprimer cette tranche ?')) return
    await supabase.from('tranches_commission').delete().eq('id', id)
    fetchCommission()
  }

  const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR')
  const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>Direction</div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>Administration</h1>
        </div>
        <button className="btn btn-solid" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Annuler' : '+ Créer un membre'}
        </button>
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* ── Bot Control ── */}
      <div className="card">
        <div className="card-title">Contrôle du bot Discord</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: botOutput ? 16 : 0 }}>
          <button className="btn btn-solid" disabled={botAction === 'loading'} onClick={() => botControl('bot-restart')}>
            {botAction === 'loading' ? '⏳ En cours...' : '🔄 Redémarrer le bot'}
          </button>
          <button className="btn btn-or" disabled={botAction === 'loading'} onClick={() => botControl('bot-status')}>
            📊 Statut
          </button>
          <button className="btn btn-or" disabled={botAction === 'loading'} onClick={() => botControl('bot-reset-status')}>
            🔁 Reset statut
          </button>
          <button className="btn btn-or" disabled={botAction === 'loading'} onClick={() => botControl('bot-logs')}>
            📋 Derniers logs
          </button>
        </div>
        <BotStatusBadge data={botOutput} />
      </div>

      {/* ── Système de commission ────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">Système de commission</div>
        {msgComm.text && <div className={`alert alert-${msgComm.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 14 }}>{msgComm.text}</div>}

        {/* Multiplicateurs */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--or-sombre)', marginBottom: 12 }}>
            Multiplicateurs par rang
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            {['membre', 'responsable', 'direction'].map(rang => (
              <div key={rang} className="form-group" style={{ minWidth: 140 }}>
                <label className="form-label" style={{ textTransform: 'capitalize' }}>{rang}</label>
                <input className="form-input" type="number" min="0" step="0.1"
                  value={multis[rang] ?? ''}
                  onChange={e => setMultis(prev => ({ ...prev, [rang]: e.target.value }))} />
              </div>
            ))}
          </div>
          <button className="btn btn-solid btn-sm" disabled={savingComm} onClick={handleSaveMultis}>
            {savingComm ? 'Sauvegarde...' : 'Sauvegarder multiplicateurs'}
          </button>
        </div>

        {/* Tranches */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--or-sombre)' }}>
              Tranches de commission (taux de base)
            </div>
            <button className="btn btn-or btn-sm" onClick={() => setShowFormTranche(!showFormTranche)}>
              {showFormTranche ? '✕' : '+ Tranche'}
            </button>
          </div>

          {showFormTranche && (
            <form onSubmit={handleCreateTranche} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', background: 'var(--noir)', padding: 14, borderRadius: 6, border: '1px solid var(--or-border)', marginBottom: 14, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ minWidth: 120 }}>
                <label className="form-label">Min ($)</label>
                <input className="form-input" type="number" min="0" required value={formTranche.min_montant} onChange={e => setFormTranche({ ...formTranche, min_montant: e.target.value })} />
              </div>
              <div className="form-group" style={{ minWidth: 120 }}>
                <label className="form-label">Max ($ ou vide = ∞)</label>
                <input className="form-input" type="number" min="0" value={formTranche.max_montant} onChange={e => setFormTranche({ ...formTranche, max_montant: e.target.value })} placeholder="∞" />
              </div>
              <div className="form-group" style={{ minWidth: 100 }}>
                <label className="form-label">Taux base (%)</label>
                <input className="form-input" type="number" min="0" max="100" step="0.1" required value={formTranche.taux_pct} onChange={e => setFormTranche({ ...formTranche, taux_pct: e.target.value })} />
              </div>
              <button type="submit" className="btn btn-solid btn-sm">Ajouter</button>
            </form>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tranche</th>
                  <th>Taux base</th>
                  {['membre', 'responsable', 'direction'].map(r => (
                    <th key={r} style={{ textTransform: 'capitalize' }}>
                      {r} ×{multis[r]} = <span style={{ color: 'var(--or)' }}>{((Number(multis[r]) || 0) * 0).toFixed(0)}%</span>
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...tranches].sort((a, b) => a.ordre - b.ordre).map(t => (
                  <tr key={t.id}>
                    <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                      {fmt(t.min_montant)} → {t.max_montant !== null ? fmt(t.max_montant) : '∞'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{t.taux_pct}%</td>
                    {['membre', 'responsable', 'direction'].map(r => (
                      <td key={r} style={{ color: 'var(--or)', fontWeight: 600 }}>
                        {(t.taux_pct * (Number(multis[r]) || 1)).toFixed(1)}%
                      </td>
                    ))}
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTranche(t.id)}>✕</button>
                    </td>
                  </tr>
                ))}
                {tranches.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--texte-soft)', textAlign: 'center' }}>Aucune tranche configurée</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--texte-soft)', marginTop: 10 }}>
            Taux effectif = taux base × multiplicateur du rang. Ex : base 3% × membre ×{multis.membre} = {(3 * (Number(multis.membre) || 1)).toFixed(1)}% effectif.
          </div>
        </div>
      </div>

      {/* ── Formulaire création membre ───────────────────────────────────────── */}
      {showForm && (
        <div className="card">
          <div className="card-title">Nouveau membre</div>
          <form onSubmit={handleCreate}>
            <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group"><label className="form-label">Surnom *</label><input className="form-input" required value={form.surnom} onChange={e => setForm({ ...form, surnom: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Mot de passe *</label><input className="form-input" type="password" required value={form.mot_de_passe} onChange={e => setForm({ ...form, mot_de_passe: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Prénom</label><input className="form-input" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Nom</label><input className="form-input" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Rang</label><select className="form-select" value={form.rang} onChange={e => setForm({ ...form, rang: e.target.value })}>{RANGS.map(r => <option key={r}>{r}</option>)}</select></div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <label className="form-label">Actif</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8 }}>
                  <input type="checkbox" id="actif" checked={form.actif} onChange={e => setForm({ ...form, actif: e.target.checked })} style={{ accentColor: 'var(--or)', width: 16, height: 16 }} />
                  <label htmlFor="actif" style={{ fontSize: 13, color: 'var(--texte)' }}>Compte actif</label>
                </div>
              </div>
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>{saving ? 'Création...' : 'Créer le membre'}</button>
          </form>
        </div>
      )}

      {/* ── Liste membres ────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">Membres ({membres.length})</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Surnom</th><th>Prénom / Nom</th><th>Rang</th><th>Statut</th><th>Créé le</th><th>Mot de passe</th><th></th></tr>
            </thead>
            <tbody>
              {membres.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.surnom}</td>
                  <td style={{ color: 'var(--texte-soft)' }}>{[m.prenom, m.nom].filter(Boolean).join(' ') || '—'}</td>
                  <td>
                    {editRang[m.id] ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select className="form-select" style={{ minWidth: 120 }} defaultValue={m.rang}
                          onChange={e => setEditRang(prev => ({ ...prev, [m.id]: e.target.value }))}>
                          {RANGS.map(r => <option key={r}>{r}</option>)}
                        </select>
                        <button className="btn btn-solid btn-sm" onClick={() => handleUpdateRang(m.id, editRang[m.id] === true ? m.rang : editRang[m.id])}>✓</button>
                        <button className="btn btn-or btn-sm" onClick={() => setEditRang(prev => ({ ...prev, [m.id]: false }))}>✕</button>
                      </div>
                    ) : (
                      <span onClick={() => setEditRang(prev => ({ ...prev, [m.id]: true }))}
                        className={`badge ${m.rang === 'direction' ? '' : m.rang === 'responsable' ? 'badge-bleu' : 'badge-gris'}`}
                        style={{ cursor: 'pointer', ...(m.rang === 'direction' ? { background: 'var(--or-glow)', color: 'var(--or)', border: '1px solid var(--or-border)' } : {}) }}>
                        {m.rang} ✎
                      </span>
                    )}
                  </td>
                  <td>
                    <button onClick={() => handleToggleActif(m.id, m.actif)}
                      className={`badge ${m.actif ? 'badge-vert' : 'badge-rouge'}`}
                      style={{ cursor: 'pointer', border: 'none', fontFamily: 'var(--font-ui)' }}>
                      {m.actif ? 'Connecté' : 'Hors ligne'}
                    </button>
                  </td>
                  <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(m.created_at)}</td>
                  <td>
                    {editMdp[m.id] ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="form-input" type="password" placeholder="Nouveau MDP" style={{ width: 130 }}
                          value={newMdp[m.id] || ''} onChange={e => setNewMdp(prev => ({ ...prev, [m.id]: e.target.value }))} />
                        <button className="btn btn-solid btn-sm" onClick={() => handleUpdateMdp(m.id)}>✓</button>
                        <button className="btn btn-or btn-sm" onClick={() => setEditMdp(prev => ({ ...prev, [m.id]: false }))}>✕</button>
                      </div>
                    ) : (
                      <button className="btn btn-or btn-sm" onClick={() => setEditMdp(prev => ({ ...prev, [m.id]: true }))}>Changer MDP</button>
                    )}
                  </td>
                  <td><span style={{ color: 'var(--texte-soft)', fontSize: 11 }}>—</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
