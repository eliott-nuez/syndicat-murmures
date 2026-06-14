import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const RANGS = ['membre', 'responsable', 'direction']
const RANGS_QUOTA = ['membre', 'responsable', 'direction']
const TYPES_QUOTA = [
  { code: 'actions',  label: 'Actions effectuées', suffixe: '' },
  { code: 'branches', label: 'Branches récoltées', suffixe: '' },
  { code: 'unites',   label: 'Drogues vendues',    suffixe: ' unités' },
]

const TABS = [
  { key: 'bot',            label: 'Bot',            icon: '🤖' },
  { key: 'membres',        label: 'Membres',        icon: '👥' },
  { key: 'quotas',         label: 'Quotas',         icon: '🎯' },
  { key: 'commission',     label: 'Commission',     icon: '💰' },
  { key: 'avertissements', label: 'Avertissements', icon: '⚠️' },
]

export default function Administration() {
  const [activeTab, setActiveTab] = useState('bot')

  // ── Membres ────────────────────────────────────────────────────────────────
  const [membres, setMembres] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading]  = useState(true)
  const [saving, setSaving]    = useState(false)
  const [msg, setMsg]          = useState({ type: '', text: '' })
  const [form, setForm]        = useState({ surnom: '', mot_de_passe: '', rang: 'membre', actif: true })
  const [editRang, setEditRang] = useState({})
  const [editMdp, setEditMdp]  = useState({})
  const [newMdp, setNewMdp]    = useState({})
  const [editInfoId, setEditInfoId]   = useState(null)
  const [editInfoForm, setEditInfoForm] = useState({})
  const [savingInfo, setSavingInfo]   = useState(false)
  const [deletingId, setDeletingId]   = useState(null)

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

  // ── Quotas ─────────────────────────────────────────────────────────────────
  const [quotas, setQuotas]           = useState([])
  const [editQuota, setEditQuota]     = useState({}) // { [`${rang}_${type}`]: valeur }
  const [savingQuota, setSavingQuota] = useState(false)
  const [msgQuota, setMsgQuota]       = useState({ type: '', text: '' })

  const fetchQuotas = async () => {
    const { data } = await supabase.from('quotas').select('*')
    setQuotas(data || [])
  }

  const getQuota = (rang, type) => {
    const q = quotas.find(q => q.rang === rang && q.type_quota === type)
    return q ? q.objectif : ''
  }

  const handleSaveQuotas = async () => {
    if (Object.keys(editQuota).length === 0) return
    setSavingQuota(true); setMsgQuota({ type: '', text: '' })
    const upserts = Object.entries(editQuota).map(([key, val]) => {
      const [rang, type_quota] = key.split('_')
      return { rang, type_quota, objectif: Number(val) || 0 }
    })
    const { error } = await supabase.from('quotas').upsert(upserts, { onConflict: 'rang,type_quota' })
    setSavingQuota(false)
    if (error) { setMsgQuota({ type: 'error', text: error.message }); return }
    setMsgQuota({ type: 'success', text: 'Quotas sauvegardés.' })
    setEditQuota({})
    fetchQuotas()
  }

  const handleQuotaChange = (rang, type, val) => {
    setEditQuota(prev => ({ ...prev, [`${rang}_${type}`]: val }))
  }
  const quotaValue = (rang, type) => {
    const key = `${rang}_${type}`
    return key in editQuota ? editQuota[key] : getQuota(rang, type)
  }

  // ── Avertissements ─────────────────────────────────────────────────────────
  const [avertissements, setAvertissements]   = useState([])
  const [showFormAvert, setShowFormAvert]     = useState(false)
  const [formAvert, setFormAvert]             = useState({ membre_id: '', motif: '' })
  const [savingAvert, setSavingAvert]         = useState(false)
  const [msgAvert, setMsgAvert]               = useState({ type: '', text: '' })
  const [editAvertId, setEditAvertId]         = useState(null)
  const [editAvertMotif, setEditAvertMotif]   = useState('')

  const fetchAvertissements = async () => {
    const { data } = await supabase.from('avertissements').select('*').order('created_at', { ascending: false })
    setAvertissements(data || [])
  }

  const handleCreateAvert = async (e) => {
    e.preventDefault()
    if (!formAvert.membre_id || !formAvert.motif.trim()) return
    setSavingAvert(true); setMsgAvert({ type: '', text: '' })
    const stored = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
    const cible  = membres.find(m => m.id === formAvert.membre_id)
    const { error } = await supabase.from('avertissements').insert({
      membre_id: formAvert.membre_id,
      membre_surnom: cible?.surnom || null,
      motif: formAvert.motif.trim(),
      auteur_id: stored.id || null,
      auteur_surnom: stored.surnom || null,
    })
    setSavingAvert(false)
    if (error) { setMsgAvert({ type: 'error', text: error.message }); return }
    setMsgAvert({ type: 'success', text: 'Avertissement enregistré.' })
    setShowFormAvert(false)
    setFormAvert({ membre_id: '', motif: '' })
    fetchAvertissements()
  }

  const handleDeleteAvert = async (id) => {
    if (!window.confirm('Supprimer cet avertissement ?')) return
    await supabase.from('avertissements').delete().eq('id', id)
    fetchAvertissements()
  }

  const startEditAvert = (a) => { setEditAvertId(a.id); setEditAvertMotif(a.motif) }
  const cancelEditAvert = () => { setEditAvertId(null); setEditAvertMotif('') }
  const handleUpdateAvert = async (id) => {
    if (!editAvertMotif.trim()) return
    await supabase.from('avertissements').update({ motif: editAvertMotif.trim() }).eq('id', id)
    cancelEditAvert()
    fetchAvertissements()
  }

  // ── Commission ─────────────────────────────────────────────────────────────
  const [tranches, setTranches]             = useState([])
  const [multis, setMultis]                 = useState({ membre: 3, responsable: 2, direction: 1 })
  const [commMode, setCommMode]             = useState('multiplicateur') // 'multiplicateur' | 'variable'
  const [formTranche, setFormTranche]       = useState({ min_montant: '', max_montant: '', taux_pct: '', taux_membre: '', taux_responsable: '', taux_direction: '' })
  const [showFormTranche, setShowFormTranche] = useState(false)
  const [savingComm, setSavingComm]         = useState(false)
  const [msgComm, setMsgComm]              = useState({ type: '', text: '' })
  const [editTranche, setEditTranche]       = useState({}) // { [id]: { min_montant, max_montant, taux_pct, taux_membre, taux_responsable, taux_direction } }


  useEffect(() => {
    fetchMembres()
    fetchCommission()
    fetchQuotas()
    fetchAvertissements()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchMembres = async () => {
    setLoading(true)
    const { data } = await supabase.from('membres')
      .select('id, surnom, nom, prenom, rang, actif, created_at, tel_legal, tel_illegal, rib, matricule, id_intranet')
      .order('surnom')
    setMembres(data || [])
    setLoading(false)
  }

  const fetchCommission = async () => {
    const [{ data: tranchesData }, { data: paramsData }] = await Promise.all([
      supabase.from('tranches_commission').select('*').order('ordre'),
      supabase.from('parametres').select('cle, valeur, valeur_texte').in('cle', [
        'commission_multiplicateur_membre', 'commission_multiplicateur_responsable', 'commission_multiplicateur_direction',
        'commission_mode',
      ]),
    ])
    setTranches(tranchesData || [])
    const map = {}
    ;(paramsData || []).forEach(p => {
      if (p.cle === 'commission_mode') { setCommMode(p.valeur_texte || 'multiplicateur'); return }
      map[p.cle.replace('commission_multiplicateur_', '')] = Number(p.valeur)
    })
    setMultis(prev => ({ ...prev, ...map }))
  }

  // ── Membres handlers ────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true); setMsg({ type: '', text: '' })

    // 1. Créer l'utilisateur dans Supabase Auth (via serverless avec service role)
    const authRes = await fetch('/api/create-membre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surnom: form.surnom, password: form.mot_de_passe }),
    })
    const authData = await authRes.json()
    if (!authRes.ok) {
      setSaving(false)
      setMsg({ type: 'error', text: `Erreur Auth : ${authData.error}` })
      return
    }

    // 2. Insérer dans la table membres (sans mot de passe — Auth uniquement)
    const { error } = await supabase.from('membres').insert({
      surnom: form.surnom, rang: form.rang, actif: form.actif,
    })
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: `Membre "${form.surnom}" créé.` })
    setShowForm(false)
    setForm({ surnom: '', mot_de_passe: '', rang: 'membre', actif: true })
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
    // Mise à jour uniquement dans Supabase Auth (plus de stockage en clair en table)
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

  const startEditInfo = (m) => {
    setEditInfoId(m.id)
    setEditInfoForm({
      nom: m.nom || '', prenom: m.prenom || '',
      tel_legal: m.tel_legal || '', tel_illegal: m.tel_illegal || '',
      rib: m.rib || '', matricule: m.matricule || '', id_intranet: m.id_intranet || '',
    })
  }
  const cancelEditInfo = () => { setEditInfoId(null); setEditInfoForm({}) }
  const handleSaveInfo = async (id) => {
    setSavingInfo(true)
    const { error } = await supabase.from('membres').update(editInfoForm).eq('id', id)
    setSavingInfo(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Informations mises à jour.' })
    cancelEditInfo()
    fetchMembres()
  }

  const handleDeleteMembre = async (m) => {
    if (!window.confirm(`Supprimer définitivement le membre "${m.surnom}" ? Cette action est irréversible.`)) return
    setDeletingId(m.id)
    try {
      const res  = await fetch('/api/delete-membre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surnom: m.surnom }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ type: 'error', text: `Erreur Auth : ${data.error}` }); setDeletingId(null); return }
      const { error } = await supabase.from('membres').delete().eq('id', m.id)
      setDeletingId(null)
      if (error) { setMsg({ type: 'error', text: error.message }); return }
      setMsg({ type: 'success', text: `Membre "${m.surnom}" supprimé.` })
      fetchMembres()
    } catch (err) {
      setDeletingId(null)
      setMsg({ type: 'error', text: err.message })
    }
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

  const handleToggleCommMode = async () => {
    const next = commMode === 'multiplicateur' ? 'variable' : 'multiplicateur'
    setSavingComm(true); setMsgComm({ type: '', text: '' })
    const { error } = await supabase.from('parametres').upsert(
      { cle: 'commission_mode', valeur: 0, valeur_texte: next },
      { onConflict: 'cle' }
    )
    setSavingComm(false)
    if (error) { setMsgComm({ type: 'error', text: error.message }); return }
    setCommMode(next)
    setMsgComm({ type: 'success', text: `Mode de commission : ${next === 'variable' ? 'Variable (% directs par grade)' : 'Multiplicateur'}.` })
  }

  const handleCreateTranche = async (e) => {
    e.preventDefault()
    const maxOrdre = tranches.reduce((m, t) => Math.max(m, t.ordre), 0)
    const { error } = await supabase.from('tranches_commission').insert({
      ordre: maxOrdre + 1,
      min_montant: parseFloat(formTranche.min_montant) || 0,
      max_montant: formTranche.max_montant === '' ? null : parseFloat(formTranche.max_montant),
      taux_pct: parseFloat(formTranche.taux_pct) || 0,
      taux_membre:      formTranche.taux_membre      === '' ? null : parseFloat(formTranche.taux_membre),
      taux_responsable: formTranche.taux_responsable === '' ? null : parseFloat(formTranche.taux_responsable),
      taux_direction:   formTranche.taux_direction   === '' ? null : parseFloat(formTranche.taux_direction),
    })
    if (error) { setMsgComm({ type: 'error', text: error.message }); return }
    setMsgComm({ type: 'success', text: 'Tranche ajoutée.' })
    setShowFormTranche(false)
    setFormTranche({ min_montant: '', max_montant: '', taux_pct: '', taux_membre: '', taux_responsable: '', taux_direction: '' })
    fetchCommission()
  }

  const handleDeleteTranche = async (id) => {
    if (!window.confirm('Supprimer cette tranche ?')) return
    await supabase.from('tranches_commission').delete().eq('id', id)
    fetchCommission()
  }

  const startEditTranche = (t) => setEditTranche(prev => ({
    ...prev,
    [t.id]: {
      min_montant: String(t.min_montant), max_montant: t.max_montant !== null ? String(t.max_montant) : '', taux_pct: String(t.taux_pct),
      taux_membre:      t.taux_membre      !== null && t.taux_membre      !== undefined ? String(t.taux_membre)      : '',
      taux_responsable: t.taux_responsable !== null && t.taux_responsable !== undefined ? String(t.taux_responsable) : '',
      taux_direction:   t.taux_direction   !== null && t.taux_direction   !== undefined ? String(t.taux_direction)   : '',
    }
  }))
  const cancelEditTranche = (id) => setEditTranche(prev => { const n = { ...prev }; delete n[id]; return n })
  const handleUpdateTranche = async (id) => {
    const e = editTranche[id]
    const min = parseFloat(e.min_montant)
    const max = e.max_montant === '' ? null : parseFloat(e.max_montant)
    const taux = parseFloat(e.taux_pct)
    if (isNaN(min) || min < 0) { setMsgComm({ type: 'error', text: 'Montant min invalide.' }); return }
    if (max !== null && (isNaN(max) || max <= min)) { setMsgComm({ type: 'error', text: 'Montant max doit être supérieur au min.' }); return }
    if (isNaN(taux) || taux < 0 || taux > 100) { setMsgComm({ type: 'error', text: 'Taux invalide (0–100).' }); return }
    const payload = {
      min_montant: min, max_montant: max, taux_pct: taux,
      taux_membre:      e.taux_membre      === '' ? null : parseFloat(e.taux_membre),
      taux_responsable: e.taux_responsable === '' ? null : parseFloat(e.taux_responsable),
      taux_direction:   e.taux_direction   === '' ? null : parseFloat(e.taux_direction),
    }
    const { error } = await supabase.from('tranches_commission').update(payload).eq('id', id)
    if (error) { setMsgComm({ type: 'error', text: error.message }); return }
    setMsgComm({ type: 'success', text: 'Tranche mise à jour.' })
    cancelEditTranche(id)
    fetchCommission()
  }

  const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR')
  const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  // ── Recherche membres ───────────────────────────────────────────────────────
  const searchLower = search.trim().toLowerCase()
  const membresFiltres = searchLower === '' ? membres : membres.filter(m => {
    const champs = [m.surnom, m.nom, m.prenom, m.rang, m.id, m.tel_legal, m.tel_illegal, m.rib, m.matricule, m.id_intranet, fmtDate(m.created_at)]
    return champs.some(c => (c || '').toString().toLowerCase().includes(searchLower))
  })

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>Direction</div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>Administration</h1>
      </div>

      {/* ── Onglets ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--or-border)', paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px',
              fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
              color: activeTab === tab.key ? 'var(--or-pale)' : 'rgba(201,168,76,0.5)',
              background: activeTab === tab.key ? 'var(--or-glow)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--or)' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}>
            <span>{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* ══════════════════════════ ONGLET BOT ══════════════════════════ */}
      {activeTab === 'bot' && (
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
      )}

      {/* ══════════════════════════ ONGLET MEMBRES ══════════════════════════ */}
      {activeTab === 'membres' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <input className="form-input" placeholder="🔎 Rechercher un membre (surnom, nom, prénom, rang, id, téléphone, RIB, matricule, ID intranet, date...)"
              style={{ minWidth: 360, flex: 1 }} value={search} onChange={e => setSearch(e.target.value)} />
            <button className="btn btn-solid" onClick={() => setShowForm(!showForm)}>
              {showForm ? '✕ Annuler' : '+ Créer un membre'}
            </button>
          </div>

          {/* ── Formulaire création membre ── */}
          {showForm && (
            <div className="card">
              <div className="card-title">Nouveau membre</div>
              <form onSubmit={handleCreate}>
                <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                  <div className="form-group"><label className="form-label">Surnom *</label><input className="form-input" required value={form.surnom} onChange={e => setForm({ ...form, surnom: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Mot de passe *</label><input className="form-input" type="password" required value={form.mot_de_passe} onChange={e => setForm({ ...form, mot_de_passe: e.target.value })} /></div>
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

          {/* ── Liste membres ── */}
          <div className="card">
            <div className="card-title">Membres ({membresFiltres.length}{membresFiltres.length !== membres.length ? ` / ${membres.length}` : ''})</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Surnom</th><th>Nom</th><th>Prénom</th><th>Rang</th><th>ID unique</th><th>ID intranet</th>
                    <th>Tél. légal</th><th>Tél. illégal</th><th>RIB</th><th>Statut</th><th>Créé le</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {membresFiltres.map(m => {
                    const ed = editInfoId === m.id
                    return (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 600 }}>{m.surnom}</td>
                        {ed ? (
                          <>
                            <td><input className="form-input" style={{ width: 100, padding: '3px 7px', fontSize: 12 }} value={editInfoForm.nom} onChange={e => setEditInfoForm(f => ({ ...f, nom: e.target.value }))} /></td>
                            <td><input className="form-input" style={{ width: 100, padding: '3px 7px', fontSize: 12 }} value={editInfoForm.prenom} onChange={e => setEditInfoForm(f => ({ ...f, prenom: e.target.value }))} /></td>
                          </>
                        ) : (
                          <>
                            <td style={{ color: 'var(--texte-soft)' }}>{m.nom || '—'}</td>
                            <td style={{ color: 'var(--texte-soft)' }}>{m.prenom || '—'}</td>
                          </>
                        )}
                        <td>
                          {editRang[m.id] ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select className="form-select" style={{ minWidth: 110 }} defaultValue={m.rang}
                                onChange={e => setEditRang(prev => ({ ...prev, [m.id]: e.target.value }))}>
                                {RANGS.map(r => <option key={r}>{r}</option>)}
                              </select>
                              <button className="btn btn-solid btn-sm" onClick={() => handleUpdateRang(m.id, editRang[m.id] === true ? m.rang : editRang[m.id])}>✓</button>
                              <button className="btn btn-or btn-sm" onClick={() => setEditRang(prev => ({ ...prev, [m.id]: false }))}>✕</button>
                            </div>
                          ) : (
                            <span onClick={() => setEditRang(prev => ({ ...prev, [m.id]: true }))}
                              className={`badge ${m.rang === 'direction' ? '' : m.rang === 'responsable' ? 'badge-bleu' : 'badge-gris'}`}
                              style={{ cursor: 'pointer', whiteSpace: 'nowrap', ...(m.rang === 'direction' ? { background: 'var(--or-glow)', color: 'var(--or)', border: '1px solid var(--or-border)' } : {}) }}>
                              {m.rang} ✎
                            </span>
                          )}
                        </td>
                        {ed ? (
                          <>
                            <td><input className="form-input" style={{ width: 90, padding: '3px 7px', fontSize: 12 }} value={editInfoForm.matricule} onChange={e => setEditInfoForm(f => ({ ...f, matricule: e.target.value }))} placeholder="ID RP" /></td>
                            <td><input className="form-input" style={{ width: 100, padding: '3px 7px', fontSize: 12 }} value={editInfoForm.id_intranet} onChange={e => setEditInfoForm(f => ({ ...f, id_intranet: e.target.value }))} placeholder="ID intranet" /></td>
                            <td><input className="form-input" style={{ width: 100, padding: '3px 7px', fontSize: 12 }} value={editInfoForm.tel_legal} onChange={e => setEditInfoForm(f => ({ ...f, tel_legal: e.target.value }))} /></td>
                            <td><input className="form-input" style={{ width: 100, padding: '3px 7px', fontSize: 12 }} value={editInfoForm.tel_illegal} onChange={e => setEditInfoForm(f => ({ ...f, tel_illegal: e.target.value }))} /></td>
                            <td><input className="form-input" style={{ width: 120, padding: '3px 7px', fontSize: 12 }} value={editInfoForm.rib} onChange={e => setEditInfoForm(f => ({ ...f, rib: e.target.value }))} /></td>
                          </>
                        ) : (
                          <>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{m.matricule || '—'}</td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{m.id_intranet || '—'}</td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{m.tel_legal || '—'}</td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{m.tel_illegal || '—'}</td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{m.rib || '—'}</td>
                          </>
                        )}
                        <td>
                          <button onClick={() => handleToggleActif(m.id, m.actif)}
                            className={`badge ${m.actif ? 'badge-vert' : 'badge-rouge'}`}
                            style={{ cursor: 'pointer', border: 'none', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>
                            {m.actif ? 'Connecté' : 'Hors ligne'}
                          </button>
                        </td>
                        <td style={{ color: 'var(--texte-soft)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(m.created_at)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {ed ? (
                              <>
                                <button className="btn btn-solid btn-sm" disabled={savingInfo} onClick={() => handleSaveInfo(m.id)}>✓</button>
                                <button className="btn btn-or btn-sm" onClick={cancelEditInfo}>✕</button>
                              </>
                            ) : (
                              <button className="btn btn-or btn-sm" onClick={() => startEditInfo(m)}>✎ Infos</button>
                            )}
                            {editMdp[m.id] ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <input className="form-input" type="password" placeholder="Nouveau MDP" style={{ width: 110, padding: '3px 7px', fontSize: 12 }}
                                  value={newMdp[m.id] || ''} onChange={e => setNewMdp(prev => ({ ...prev, [m.id]: e.target.value }))} />
                                <button className="btn btn-solid btn-sm" onClick={() => handleUpdateMdp(m.id)}>✓</button>
                                <button className="btn btn-or btn-sm" onClick={() => setEditMdp(prev => ({ ...prev, [m.id]: false }))}>✕</button>
                              </div>
                            ) : (
                              <button className="btn btn-or btn-sm" onClick={() => setEditMdp(prev => ({ ...prev, [m.id]: true }))}>🔑 MDP</button>
                            )}
                            <button className="btn btn-danger btn-sm" disabled={deletingId === m.id} onClick={() => handleDeleteMembre(m)}>
                              {deletingId === m.id ? '...' : '🗑 Suppr.'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {membresFiltres.length === 0 && (
                    <tr><td colSpan={11} style={{ color: 'var(--texte-soft)', textAlign: 'center' }}>Aucun membre ne correspond à la recherche.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--texte-soft)', marginTop: 10 }}>
              Champs affichés : Surnom · Nom · Prénom · Rang · ID unique (matricule) · ID intranet · Tél. légal · Tél. illégal · RIB · Statut · Date de création.
              Clique sur « ✎ Infos » pour modifier nom, prénom, matricule, ID intranet, téléphones et RIB ; sur le rang pour le changer ; sur « 🔑 MDP » pour forcer un nouveau mot de passe.
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════ ONGLET QUOTAS ══════════════════════════ */}
      {activeTab === 'quotas' && (
        <div className="card">
          <div className="card-title">Quotas hebdomadaires par grade</div>
          {msgQuota.text && <div className={`alert alert-${msgQuota.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 14 }}>{msgQuota.text}</div>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type de quota</th>
                  {RANGS_QUOTA.map(r => <th key={r} style={{ textTransform: 'capitalize' }}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {TYPES_QUOTA.map(t => (
                  <tr key={t.code}>
                    <td style={{ fontWeight: 600 }}>{t.label}{t.suffixe && <span style={{ color: 'var(--texte-soft)', fontWeight: 400 }}> ({t.suffixe.trim()})</span>}</td>
                    {RANGS_QUOTA.map(r => (
                      <td key={r}>
                        <input className="form-input" type="number" min="0" step="1"
                          style={{ width: 110, padding: '4px 8px', fontSize: 13 }}
                          value={quotaValue(r, t.code)}
                          onChange={e => handleQuotaChange(r, t.code, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="btn btn-solid btn-sm" disabled={savingQuota || Object.keys(editQuota).length === 0} onClick={handleSaveQuotas}>
              {savingQuota ? 'Sauvegarde...' : 'Sauvegarder les quotas'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--texte-soft)' }}>
              Ces objectifs alimentent les jauges affichées sur le Dashboard, la fiche perso et la fiche membre, selon le rang de chacun.
            </span>
          </div>
        </div>
      )}

      {/* ══════════════════════════ ONGLET COMMISSION ══════════════════════════ */}
      {activeTab === 'commission' && (
        <div className="card">
          <div className="card-title">Système de commission</div>
          {msgComm.text && <div className={`alert alert-${msgComm.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 14 }}>{msgComm.text}</div>}

          {/* Mode de calcul */}
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--or-sombre)', marginBottom: 6 }}>
                Mode de calcul
              </div>
              <div style={{ fontSize: 13, color: 'var(--texte)' }}>
                {commMode === 'variable'
                  ? 'Variable — le % de chaque tranche est saisi directement par grade (les multiplicateurs ne sont pas appliqués).'
                  : 'Multiplicateur — taux de base × multiplicateur du rang.'}
              </div>
            </div>
            <button className="btn btn-or btn-sm" disabled={savingComm} onClick={handleToggleCommMode}>
              {savingComm ? '...' : commMode === 'variable' ? '↺ Repasser en mode Multiplicateur' : '⇄ Passer en mode Variable'}
            </button>
          </div>

          {/* Multiplicateurs (uniquement pertinents en mode multiplicateur) */}
          <div style={{ marginBottom: 24, opacity: commMode === 'variable' ? 0.45 : 1 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--or-sombre)', marginBottom: 12 }}>
              Multiplicateurs par rang {commMode === 'variable' && <span style={{ textTransform: 'none', letterSpacing: 0 }}>(ignorés en mode Variable)</span>}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
              {['membre', 'responsable', 'direction'].map(rang => (
                <div key={rang} className="form-group" style={{ minWidth: 140 }}>
                  <label className="form-label" style={{ textTransform: 'capitalize' }}>{rang}</label>
                  <input className="form-input" type="number" min="0" step="0.1" disabled={commMode === 'variable'}
                    value={multis[rang] ?? ''}
                    onChange={e => setMultis(prev => ({ ...prev, [rang]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button className="btn btn-solid btn-sm" disabled={savingComm || commMode === 'variable'} onClick={handleSaveMultis}>
              {savingComm ? 'Sauvegarde...' : 'Sauvegarder multiplicateurs'}
            </button>
          </div>

          {/* Tranches */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--or-sombre)' }}>
                Tranches de commission {commMode === 'variable' ? '(% directs par grade)' : '(taux de base)'}
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
                {commMode === 'variable' ? (
                  <>
                    <div className="form-group" style={{ minWidth: 90 }}>
                      <label className="form-label">% Membre</label>
                      <input className="form-input" type="number" min="0" max="100" step="0.1" value={formTranche.taux_membre} onChange={e => setFormTranche({ ...formTranche, taux_membre: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ minWidth: 90 }}>
                      <label className="form-label">% Responsable</label>
                      <input className="form-input" type="number" min="0" max="100" step="0.1" value={formTranche.taux_responsable} onChange={e => setFormTranche({ ...formTranche, taux_responsable: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ minWidth: 90 }}>
                      <label className="form-label">% Direction</label>
                      <input className="form-input" type="number" min="0" max="100" step="0.1" value={formTranche.taux_direction} onChange={e => setFormTranche({ ...formTranche, taux_direction: e.target.value })} />
                    </div>
                  </>
                ) : (
                  <div className="form-group" style={{ minWidth: 100 }}>
                    <label className="form-label">Taux base (%)</label>
                    <input className="form-input" type="number" min="0" max="100" step="0.1" required value={formTranche.taux_pct} onChange={e => setFormTranche({ ...formTranche, taux_pct: e.target.value })} />
                  </div>
                )}
                <button type="submit" className="btn btn-solid btn-sm">Ajouter</button>
              </form>
            )}

            {/* Alerte chevauchement */}
            {(() => {
              const sorted = [...tranches].sort((a, b) => a.ordre - b.ordre)
              const overlaps = []
              for (let i = 0; i < sorted.length - 1; i++) {
                const curr = sorted[i], next = sorted[i + 1]
                if (curr.max_montant !== null && next.min_montant < curr.max_montant)
                  overlaps.push(`${fmt(next.min_montant)} chevauche la tranche précédente (max ${fmt(curr.max_montant)})`)
                if (curr.max_montant !== null && next.min_montant > curr.max_montant)
                  overlaps.push(`Trou entre ${fmt(curr.max_montant)} et ${fmt(next.min_montant)} — zone sans commission`)
              }
              return overlaps.length > 0 ? (
                <div className="alert alert-error" style={{ marginBottom: 12 }}>
                  ⚠ Problème de tranches détecté : {overlaps.join(' · ')}
                </div>
              ) : null
            })()}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Min ($)</th>
                    <th>Max ($)</th>
                    {commMode === 'variable' ? (
                      <>
                        <th>% Membre</th>
                        <th>% Responsable</th>
                        <th>% Direction</th>
                      </>
                    ) : (
                      <>
                        <th>Taux base</th>
                        {['membre', 'responsable', 'direction'].map(r => (
                          <th key={r} style={{ textTransform: 'capitalize' }}>
                            {r} ×{multis[r]}
                          </th>
                        ))}
                      </>
                    )}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...tranches].sort((a, b) => a.ordre - b.ordre).map(t => {
                    const ed = editTranche[t.id]
                    return (
                      <tr key={t.id}>
                        {ed ? (
                          <>
                            <td>
                              <input className="form-input" type="number" min="0" step="1"
                                style={{ width: 100, padding: '3px 7px', fontSize: 13 }}
                                value={ed.min_montant}
                                onChange={e => setEditTranche(prev => ({ ...prev, [t.id]: { ...prev[t.id], min_montant: e.target.value } }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleUpdateTranche(t.id); if (e.key === 'Escape') cancelEditTranche(t.id) }} />
                            </td>
                            <td>
                              <input className="form-input" type="number" min="0" step="1"
                                style={{ width: 100, padding: '3px 7px', fontSize: 13 }}
                                placeholder="∞"
                                value={ed.max_montant}
                                onChange={e => setEditTranche(prev => ({ ...prev, [t.id]: { ...prev[t.id], max_montant: e.target.value } }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleUpdateTranche(t.id); if (e.key === 'Escape') cancelEditTranche(t.id) }} />
                            </td>
                            {commMode === 'variable' ? (
                              <>
                                {['taux_membre', 'taux_responsable', 'taux_direction'].map(champ => (
                                  <td key={champ}>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                      <input className="form-input" type="number" min="0" max="100" step="0.1"
                                        style={{ width: 70, padding: '3px 7px', fontSize: 13 }}
                                        value={ed[champ]}
                                        onChange={e => setEditTranche(prev => ({ ...prev, [t.id]: { ...prev[t.id], [champ]: e.target.value } }))}
                                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateTranche(t.id); if (e.key === 'Escape') cancelEditTranche(t.id) }} />
                                      <span style={{ fontSize: 13 }}>%</span>
                                    </div>
                                  </td>
                                ))}
                              </>
                            ) : (
                              <>
                                <td>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <input className="form-input" type="number" min="0" max="100" step="0.1"
                                      style={{ width: 70, padding: '3px 7px', fontSize: 13 }}
                                      value={ed.taux_pct}
                                      onChange={e => setEditTranche(prev => ({ ...prev, [t.id]: { ...prev[t.id], taux_pct: e.target.value } }))}
                                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateTranche(t.id); if (e.key === 'Escape') cancelEditTranche(t.id) }}
                                      autoFocus />
                                    <span style={{ fontSize: 13 }}>%</span>
                                  </div>
                                </td>
                                {['membre', 'responsable', 'direction'].map(r => (
                                  <td key={r} style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                                    {((parseFloat(ed.taux_pct) || 0) * (Number(multis[r]) || 1)).toFixed(1)}%
                                  </td>
                                ))}
                              </>
                            )}
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-solid btn-sm" disabled={savingComm} onClick={() => handleUpdateTranche(t.id)}>✓</button>
                                <button className="btn btn-or btn-sm" onClick={() => cancelEditTranche(t.id)}>✕</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 13 }}>{fmt(t.min_montant)}</td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 13 }}>{t.max_montant !== null ? fmt(t.max_montant) : '∞'}</td>
                            {commMode === 'variable' ? (
                              <>
                                <td style={{ color: 'var(--or)', fontWeight: 600 }}>{t.taux_membre ?? '—'}{t.taux_membre != null ? '%' : ''}</td>
                                <td style={{ color: 'var(--or)', fontWeight: 600 }}>{t.taux_responsable ?? '—'}{t.taux_responsable != null ? '%' : ''}</td>
                                <td style={{ color: 'var(--or)', fontWeight: 600 }}>{t.taux_direction ?? '—'}{t.taux_direction != null ? '%' : ''}</td>
                              </>
                            ) : (
                              <>
                                <td style={{ fontWeight: 600 }}>{t.taux_pct}%</td>
                                {['membre', 'responsable', 'direction'].map(r => (
                                  <td key={r} style={{ color: 'var(--or)', fontWeight: 600 }}>
                                    {(t.taux_pct * (Number(multis[r]) || 1)).toFixed(1)}%
                                  </td>
                                ))}
                              </>
                            )}
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-or btn-sm" onClick={() => startEditTranche(t)}>✎</button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTranche(t.id)}>✕</button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                  {tranches.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--texte-soft)', textAlign: 'center' }}>Aucune tranche configurée</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--texte-soft)', marginTop: 10 }}>
              {commMode === 'variable'
                ? 'Mode Variable : le taux effectif appliqué est directement le % saisi pour le grade du membre (les multiplicateurs ne sont pas utilisés).'
                : <>Taux effectif = taux base × multiplicateur du rang. Ex : base 3% × membre ×{multis.membre} = {(3 * (Number(multis.membre) || 1)).toFixed(1)}% effectif.</>}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════ ONGLET AVERTISSEMENTS ══════════════════════════ */}
      {activeTab === 'avertissements' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Avertissements ({avertissements.length})</div>
            <button className="btn btn-solid btn-sm" onClick={() => setShowFormAvert(!showFormAvert)}>
              {showFormAvert ? '✕ Annuler' : '+ Donner un avertissement'}
            </button>
          </div>

          {msgAvert.text && <div className={`alert alert-${msgAvert.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 14 }}>{msgAvert.text}</div>}

          {showFormAvert && (
            <form onSubmit={handleCreateAvert} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', background: 'var(--noir)', padding: 14, borderRadius: 6, border: '1px solid var(--or-border)', marginBottom: 18, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ minWidth: 200 }}>
                <label className="form-label">Membre concerné *</label>
                <select className="form-select" required value={formAvert.membre_id} onChange={e => setFormAvert({ ...formAvert, membre_id: e.target.value })}>
                  <option value="">— Choisir —</option>
                  {membres.map(m => <option key={m.id} value={m.id}>{m.surnom}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 320, flex: 1 }}>
                <label className="form-label">Motif *</label>
                <input className="form-input" required value={formAvert.motif} onChange={e => setFormAvert({ ...formAvert, motif: e.target.value })} placeholder="Ex : absence répétée non justifiée" />
              </div>
              <button type="submit" className="btn btn-solid btn-sm" disabled={savingAvert}>{savingAvert ? 'Envoi...' : 'Enregistrer'}</button>
            </form>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Membre</th><th>Motif</th><th>Donné par</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                {avertissements.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.membre_surnom || '—'}</td>
                    <td style={{ maxWidth: 380 }}>
                      {editAvertId === a.id ? (
                        <input className="form-input" style={{ width: '100%', padding: '3px 7px', fontSize: 13 }}
                          value={editAvertMotif} onChange={e => setEditAvertMotif(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdateAvert(a.id); if (e.key === 'Escape') cancelEditAvert() }}
                          autoFocus />
                      ) : (
                        <span style={{ color: 'var(--texte)' }}>{a.motif}</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{a.auteur_surnom || '—'}</td>
                    <td style={{ color: 'var(--texte-soft)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {editAvertId === a.id ? (
                          <>
                            <button className="btn btn-solid btn-sm" onClick={() => handleUpdateAvert(a.id)}>✓</button>
                            <button className="btn btn-or btn-sm" onClick={cancelEditAvert}>✕</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-or btn-sm" onClick={() => startEditAvert(a)}>✎</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAvert(a.id)}>🗑</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {avertissements.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--texte-soft)', textAlign: 'center' }}>Aucun avertissement enregistré.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--texte-soft)', marginTop: 10 }}>
            Visibles et modifiables uniquement par la direction.
          </div>
        </div>
      )}
    </div>
  )
}
