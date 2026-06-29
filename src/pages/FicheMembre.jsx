import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getDebutSemaine, getDebutSemaineStr } from '../utils/temps'
import { chargerParamsCommission, calculerCommission } from '../utils/commission'
import { getRangEffectif } from '../utils/viewAs'
import { chargerQuotas } from '../utils/quotas'
import { nowLocalInput, localInputToUTCISO, fmtDateTime, fmtDate as fmtDateOnly } from '../utils/timezone'
import { chargerBrancheParams, calculerBenefice, recalculerBeneficesSemaine } from '../utils/branche'

const COOLDOWNS_H = {
  'ATM':         3,
  'Supérette':   2,
  'Go Fast':    24,
  'Cambriolage': 3,
}

const localNow = nowLocalInput

export default function FicheMembre() {
  const _stored  = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const viewer   = { ..._stored, rang: getRangEffectif() || _stored.rang || 'membre' }

  const [membres, setMembres]     = useState([])
  const [membreId, setMembreId]   = useState('')
  const membre                    = membres.find(m => m.id === membreId) || null

  const [drogues, setDrogues]               = useState([])
  const [activites, setActivites]           = useState([])
  const [ventes, setVentes]                 = useState([])
  const [plantations, setPlantations]       = useState([])
  const [commissionParams, setCommissionParams] = useState({ tranches: [], multiplicateurs: {}, boitierCout: 0 })
  const [quotas, setQuotas] = useState({ actions: 20, branches: 2000, unites: 300 })
  const [msg, setMsg]                       = useState({ type: '', text: '' })

  const [brancheParams, setBrancheParams] = useState(null)
  const [brancheDrogue, setBrancheDrogue] = useState(null)
  const [formPlant, setFormPlant]         = useState({ nb_pots: '', nb_branches: '', date_plantation: localNow(), note: '' })
  const [savingPlant, setSavingPlant]     = useState(false)

  const [formAct, setFormAct] = useState({
    type_code:         'ATM',
    somme_argent_sale: '',
    note:              '',
    heure_faite:       localNow(),
  })
  const [savingAct, setSavingAct]           = useState(false)
  const [editActId, setEditActId]           = useState(null)
  const [editActForm, setEditActForm]       = useState({ type_code: '', somme_argent_sale: '', note: '' })
  const [savingEditAct, setSavingEditAct]   = useState(false)

  const [editVenteId, setEditVenteId]       = useState(null)
  const [editVenteForm, setEditVenteForm]   = useState({ quantite: '', prix_total: '', statut: 'Vendu' })
  const [savingEditVente, setSavingEditVente] = useState(false)

  const [editPlantId, setEditPlantId]       = useState(null)
  const [editPlantForm, setEditPlantForm]   = useState({ nb_pots: '', nb_branches: '', note: '' })
  const [savingEditPlant, setSavingEditPlant] = useState(false)

  const [showAllActs, setShowAllActs]     = useState(false)
  const [showAllVentes, setShowAllVentes] = useState(false)
  const [showAllPlants, setShowAllPlants] = useState(false)

  const [lignesVente, setLignesVente] = useState([emptyLigne()])

  function emptyLigne() {
    return { drogue_id: '', quantite: '', prix_total: '', statut: 'Vendu', _id: Math.random() }
  }

  useEffect(() => {
    supabase.from('membres').select('id, surnom, rang').eq('archive', false).order('surnom')
      .then(({ data }) => setMembres(data || []))
    supabase.from('drogues').select('*').order('nom')
      .then(({ data }) => setDrogues(data || []))
    chargerParamsCommission().then(setCommissionParams)
    supabase.from('drogues').select('*').ilike('nom', '%branche%').maybeSingle().then(({ data }) => setBrancheDrogue(data))
    chargerBrancheParams().then(setBrancheParams)
  }, [])

  useEffect(() => {
    if (membre?.rang) chargerQuotas(membre.rang).then(setQuotas)
  }, [membre?.rang])

  useEffect(() => {
    if (!membreId) { setActivites([]); setVentes([]); setPlantations([]); return }
    fetchActivites()
    fetchVentes()
    fetchPlantations()
    setMsg({ type: '', text: '' })
    setFormAct({ type_code: 'ATM', somme_argent_sale: '', note: '', heure_faite: localNow() })
    setLignesVente([emptyLigne()])
  }, [membreId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlantations = async () => {
    const { data } = await supabase
      .from('plantations')
      .select('id, date_plantation, nb_pots, nb_branches, branches_par_pot, benefice, note')
      .eq('membre_id', membreId)
      .gte('date_plantation', getDebutSemaineStr())
      .order('date_plantation', { ascending: false })
    setPlantations(data || [])
  }

  const fetchActivites = async () => {
    const { data } = await supabase
      .from('activites').select('*').eq('membre_id', membreId)
      .gte('heure_faite', getDebutSemaineStr())
      .order('heure_faite', { ascending: false })
    setActivites(data || [])
  }

  const fetchVentes = async () => {
    const { data } = await supabase
      .from('ventes_drogue').select('*, drogues(nom, prix_revient)')
      .eq('membre_id', membreId)
      .gte('created_at', getDebutSemaine().toISOString())
      .order('created_at', { ascending: false })
    setVentes(data || [])
  }

  const calcProchainDispo = (heure, type) => {
    const h = COOLDOWNS_H[type] || 0
    return new Date(new Date(heure).getTime() + h * 3600 * 1000)
  }

  const handleSubmitActivite = async (e) => {
    e.preventDefault()
    if (!membreId) return
    setSavingAct(true)
    setMsg({ type: '', text: '' })
    const heure_faite    = localInputToUTCISO(formAct.heure_faite)
    const prochain_dispo = calcProchainDispo(new Date(heure_faite), formAct.type_code).toISOString()
    const { error } = await supabase.from('activites').insert({
      membre_id: membreId, type_code: formAct.type_code,
      heure_faite, prochain_dispo,
      somme_argent_sale: parseFloat(formAct.somme_argent_sale) || 0,
      note: formAct.note || null,
    })
    setSavingAct(false)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }) }
    else {
      setMsg({ type: 'success', text: `Activité enregistrée pour ${membre.surnom}.` })
      setFormAct({ ...formAct, somme_argent_sale: '', note: '', heure_faite: localNow() })
      fetchActivites()
    }
  }

  const handleSubmitVentes = async () => {
    if (!membreId) return
    setMsg({ type: '', text: '' })
    const lignesValides = lignesVente.filter(l => l.drogue_id && l.quantite)
    if (!lignesValides.length) return
    const rows = lignesValides.map(l => {
      const drogue   = drogues.find(d => d.id === l.drogue_id)
      const qte      = parseInt(l.quantite) || 0
      let prix_total = 0
      let argent     = 0
      if (l.statut === 'Saisie') {
        prix_total = 0
        argent     = -(qte * (drogue?.prix_revient || 0))
      } else {
        prix_total = parseFloat(l.prix_total) || 0
        argent     = prix_total - (qte * (drogue?.prix_revient || 0))  // bénéfice
      }
      return { membre_id: membreId, drogue_id: l.drogue_id, quantite: qte, prix_total, argent_sale: argent, statut: l.statut }
    })
    const { error } = await supabase.from('ventes_drogue').insert(rows)
    if (error) { setMsg({ type: 'error', text: 'Erreur ventes : ' + error.message }) }
    else {
      setMsg({ type: 'success', text: `Ventes enregistrées pour ${membre.surnom}.` })
      setLignesVente([emptyLigne()])
      fetchVentes()
    }
  }

  const startEditAct = (a) => {
    setEditActId(a.id)
    setEditActForm({ type_code: a.type_code, somme_argent_sale: String(a.somme_argent_sale), note: a.note || '' })
  }
  const cancelEditAct = () => { setEditActId(null); setEditActForm({ type_code: '', somme_argent_sale: '', note: '' }) }
  const handleSaveAct = async () => {
    const somme = parseFloat(editActForm.somme_argent_sale)
    if (isNaN(somme) || somme < 0) { setMsg({ type: 'error', text: 'Montant invalide.' }); return }
    setSavingEditAct(true)
    const { error } = await supabase.from('activites')
      .update({ type_code: editActForm.type_code, somme_argent_sale: somme, note: editActForm.note || null })
      .eq('id', editActId)
    setSavingEditAct(false)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }); return }
    setMsg({ type: 'success', text: 'Activité mise à jour.' })
    cancelEditAct()
    fetchActivites()
  }

  const handleDeleteActivite = async (id) => {
    if (!window.confirm('Supprimer cette activité ?')) return
    const { error } = await supabase.from('activites').delete().eq('id', id)
    if (error) setMsg({ type: 'error', text: 'Erreur : ' + error.message })
    else { setMsg({ type: 'success', text: 'Activité supprimée.' }); fetchActivites() }
  }

  const handleDeleteVente = async (id) => {
    if (!window.confirm('Supprimer cette vente ?')) return
    const { error } = await supabase.from('ventes_drogue').delete().eq('id', id)
    if (error) setMsg({ type: 'error', text: 'Erreur : ' + error.message })
    else { setMsg({ type: 'success', text: 'Vente supprimée.' }); fetchVentes() }
  }

  const startEditVente = (v) => {
    setEditVenteId(v.id)
    setEditVenteForm({ quantite: String(v.quantite), prix_total: String(v.prix_total || 0), statut: v.statut })
  }
  const cancelEditVente = () => { setEditVenteId(null); setEditVenteForm({ quantite: '', prix_total: '', statut: 'Vendu' }) }
  const handleSaveVente = async () => {
    const qte = parseInt(editVenteForm.quantite) || 0
    const prix_total = parseFloat(editVenteForm.prix_total) || 0
    if (!qte) { setMsg({ type: 'error', text: 'Quantité invalide.' }); return }
    const vente = ventes.find(v => v.id === editVenteId)
    const drogue = vente ? drogues.find(d => d.id === vente.drogue_id) : null
    const prixRevient = drogue?.prix_revient || 0
    let argent_sale
    if (editVenteForm.statut === 'Saisie') {
      argent_sale = -(qte * prixRevient)
    } else {
      argent_sale = prix_total - (qte * prixRevient)
    }
    setSavingEditVente(true)
    const { error } = await supabase.from('ventes_drogue')
      .update({ quantite: qte, prix_total, statut: editVenteForm.statut, argent_sale })
      .eq('id', editVenteId)
    setSavingEditVente(false)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }); return }
    setMsg({ type: 'success', text: 'Vente mise à jour.' })
    cancelEditVente()
    fetchVentes()
  }

  const startEditPlant = (p) => {
    setEditPlantId(p.id)
    setEditPlantForm({ nb_pots: String(p.nb_pots), nb_branches: String(p.nb_branches), note: p.note || '' })
  }
  const cancelEditPlant = () => { setEditPlantId(null); setEditPlantForm({ nb_pots: '', nb_branches: '', note: '' }) }
  const handleSavePlant = async () => {
    const nb_pots     = parseInt(editPlantForm.nb_pots) || 0
    const nb_branches = parseInt(editPlantForm.nb_branches) || 0
    if (!nb_pots || !nb_branches) { setMsg({ type: 'error', text: 'Pots et branches obligatoires.' }); return }
    let drogueActive = brancheDrogue
    if (!drogueActive) {
      const { data } = await supabase.from('drogues').select('*').ilike('nom', '%branche%').maybeSingle()
      drogueActive = data; if (drogueActive) setBrancheDrogue(drogueActive)
    }
    if (!drogueActive) { setMsg({ type: 'error', text: 'Drogue "Branche" introuvable.' }); return }
    const branches_par_pot = nb_pots > 0 ? Math.round(nb_branches / nb_pots) : 0
    setSavingEditPlant(true)
    const { error } = await supabase.from('plantations')
      .update({ nb_pots, nb_branches, branches_par_pot, benefice: 0, note: editPlantForm.note || null })
      .eq('id', editPlantId)
    if (!error && drogueActive) await recalculerBeneficesSemaine(drogueActive.id, brancheParams)
    setSavingEditPlant(false)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }); return }
    setMsg({ type: 'success', text: 'Plantation mise à jour.' })
    cancelEditPlant()
    fetchPlantations()
  }

  const handleDeletePlantation = async (id) => {
    if (!window.confirm('Supprimer cette plantation ?')) return
    const { error } = await supabase.from('plantations').delete().eq('id', id)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }); return }
    if (brancheDrogue) await recalculerBeneficesSemaine(brancheDrogue.id, brancheParams)
    setMsg({ type: 'success', text: 'Plantation supprimée.' })
    fetchPlantations()
  }

  const handleSubmitPlantation = async (e) => {
    e.preventDefault()
    if (!membreId) return
    const nb_pots     = parseInt(formPlant.nb_pots) || 0
    const nb_branches = parseInt(formPlant.nb_branches) || 0
    if (!nb_pots || !nb_branches) { setMsg({ type: 'error', text: 'Pots et branches obligatoires.' }); return }
    setSavingPlant(true)
    let drogueActive = brancheDrogue
    if (!drogueActive) {
      const { data } = await supabase.from('drogues').select('*').ilike('nom', '%branche%').maybeSingle()
      drogueActive = data; if (drogueActive) setBrancheDrogue(drogueActive)
    }
    if (!drogueActive) { setMsg({ type: 'error', text: 'Drogue "Branche" introuvable.' }); setSavingPlant(false); return }
    const branches_par_pot = nb_pots > 0 ? Math.round(nb_branches / nb_pots) : 0
    const { error } = await supabase.from('plantations').insert({
      membre_id: membreId, drogue_id: drogueActive.id,
      nb_pots, nb_branches, branches_par_pot, benefice: 0,
      date_plantation: localInputToUTCISO(formPlant.date_plantation),
      note: formPlant.note || null,
    })
    if (!error) await recalculerBeneficesSemaine(drogueActive.id, brancheParams)
    setSavingPlant(false)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }) }
    else {
      setMsg({ type: 'success', text: `Récolte enregistrée pour ${membre?.surnom}.` })
      setFormPlant({ nb_pots: '', nb_branches: '', date_plantation: localNow(), note: '' })
      fetchPlantations()
    }
  }

  const updateLigne = (id, field, value) => {
    setLignesVente(prev => {
      const updated = prev.map(l => l._id === id ? { ...l, [field]: value } : l)
      const last = updated[updated.length - 1]
      if (last.drogue_id) return [...updated, emptyLigne()]
      return updated
    })
  }

  const calc = membre
    ? calculerCommission(activites, ventes, membre.rang, commissionParams, plantations)
    : { totalActBrut: 0, cambriolageTotal: 0, deductionBoitiers: 0, totalPrixTotal: 0, totalBenefice: 0, totalSaisies: 0, totalPlantations: 0, base: 0, multiplicateur: 1, commission_pct: 0, commission: 0, net: 0, nbATM: 0, boitierCout: 0, tranches_detail: [] }
  const {
    totalActBrut, cambriolageTotal, deductionBoitiers,
    totalPrixTotal, totalBenefice, totalSaisies, totalPlantations,
    base, multiplicateur, commission_pct,
    commission, net, nbATM, tranches_detail,
  } = calc

  // Quotas hebdomadaires (configurés par grade depuis l'administration)
  const QUOTA_ACTIONS  = quotas.actions
  const QUOTA_BRANCHES = quotas.branches
  const QUOTA_UNITES   = quotas.unites
  const nbActionsQuota  = activites.length
  const nbBranchesQuota = plantations.reduce((s, p) => s + (p.nb_branches || 0), 0)
  const nbUnitesQuota   = ventes.filter(v => v.statut === 'Vendu').reduce((s, v) => s + (v.quantite || 0), 0)

  const Jauge = ({ label, valeur, objectif, suffixe = '' }) => {
    const pct = Math.min(100, Math.round((valeur / objectif) * 100))
    const ok  = valeur >= objectif
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
          <span style={{ color: 'var(--texte-soft)' }}>{label}</span>
          <span style={{ color: ok ? '#5cba8a' : 'var(--or-pale)', fontWeight: 600 }}>
            {valeur.toLocaleString('fr-FR')} / {objectif.toLocaleString('fr-FR')}{suffixe}{ok ? '  ✓' : ''}
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 5, background: 'rgba(201,168,76,0.12)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 5,
            background: ok ? 'linear-gradient(90deg,#3f8f66,#5cba8a)' : 'linear-gradient(90deg,#9c7d2e,#e8c97a)',
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>
    )
  }

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  const fmtDate = fmtDateTime

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>Direction</div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>Fiche membre</h1>
      </div>

      {/* Sélecteur membre */}
      <div className="card">
        <div className="card-title">Sélectionner un membre</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-select" style={{ minWidth: 240 }} value={membreId}
            onChange={e => setMembreId(e.target.value)}>
            <option value="">— Choisir un membre —</option>
            {membres.map(m => <option key={m.id} value={m.id}>{m.surnom} ({m.rang})</option>)}
          </select>
          {membre && (
            <span style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
              Prise en main · taux effectif {commission_pct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {!membreId && (
        <div style={{ color: 'var(--texte-soft)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
          Sélectionne un membre pour gérer sa fiche.
        </div>
      )}

      {membreId && (
        <>
          {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

          <div className="grid-3">
            <div className="stat-box">
              <span className="stat-label">Base commission</span>
              <span className="stat-value">{fmt(base)}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Commission ({commission_pct.toFixed(1)}%)</span>
              <span className="stat-value" style={{ color: '#e8a84c' }}>− {fmt(commission)}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Total NET</span>
              <span className="stat-value" style={{ color: 'var(--or)' }}>{fmt(net)}</span>
            </div>
          </div>

          {/* Formulaire activité */}
          <div className="card">
            <div className="card-title">Déclarer une activité — {membre.surnom}</div>
            <form onSubmit={handleSubmitActivite}>
              <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Type d'activité</label>
                  <select className="form-select" value={formAct.type_code}
                    onChange={e => setFormAct({ ...formAct, type_code: e.target.value })}>
                    {Object.keys(COOLDOWNS_H).map(t => (
                      <option key={t} value={t}>{t} — cooldown {COOLDOWNS_H[t]}h</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Heure effectuée</label>
                  <input className="form-input" type="datetime-local" required
                    value={formAct.heure_faite}
                    onChange={e => setFormAct({ ...formAct, heure_faite: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Somme récoltée ($)</label>
                  <input className="form-input" type="number" min="0" step="1" required
                    placeholder="Ex : 4500"
                    value={formAct.somme_argent_sale}
                    onChange={e => setFormAct({ ...formAct, somme_argent_sale: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Prochaine dispo (auto)</label>
                  <input className="form-input" type="text" disabled style={{ opacity: 0.5 }}
                    value={formAct.heure_faite
                      ? fmtDate(calcProchainDispo(new Date(localInputToUTCISO(formAct.heure_faite)), formAct.type_code))
                      : '—'} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Note (facultatif)</label>
                <input className="form-input" type="text" placeholder="Remarque, lieu, etc."
                  value={formAct.note} onChange={e => setFormAct({ ...formAct, note: e.target.value })} />
              </div>
              <button type="submit" className="btn btn-solid" disabled={savingAct}>
                {savingAct ? 'Enregistrement...' : `+ Valider l'activité`}
              </button>
            </form>

            {activites.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--texte-soft)' }}>
                    Activités cette semaine ({activites.length})
                  </div>
                  {activites.length > 5 && (
                    <button className="btn btn-or btn-sm" style={{ fontSize: 11 }} onClick={() => setShowAllActs(v => !v)}>
                      {showAllActs ? 'Afficher moins' : `Afficher tout (${activites.length})`}
                    </button>
                  )}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Type</th><th>Heure</th><th>Prochaine dispo</th><th>Somme</th><th>Note</th><th></th></tr></thead>
                    <tbody>
                      {(showAllActs ? activites : activites.slice(0, 5)).map(a => {
                        const isEditing = editActId === a.id
                        if (isEditing) return (
                          <tr key={a.id} style={{ background: 'rgba(201,168,76,0.04)' }}>
                            <td>
                              <select className="form-select" style={{ minWidth: 110, padding: '3px 8px', fontSize: 12 }}
                                value={editActForm.type_code}
                                onChange={e => setEditActForm(f => ({ ...f, type_code: e.target.value }))}>
                                {Object.keys(COOLDOWNS_H).map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(a.heure_faite)}</td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(a.prochain_dispo)}</td>
                            <td>
                              <input className="form-input" type="number" min="0" step="1"
                                style={{ width: 110, padding: '3px 8px', fontSize: 13, fontFamily: 'var(--font-corps)' }}
                                value={editActForm.somme_argent_sale}
                                onChange={e => setEditActForm(f => ({ ...f, somme_argent_sale: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveAct(); if (e.key === 'Escape') cancelEditAct() }}
                                autoFocus />
                            </td>
                            <td>
                              <input className="form-input" type="text"
                                style={{ minWidth: 140, padding: '3px 8px', fontSize: 12 }}
                                placeholder="Note…"
                                value={editActForm.note}
                                onChange={e => setEditActForm(f => ({ ...f, note: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveAct(); if (e.key === 'Escape') cancelEditAct() }} />
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-solid btn-sm" disabled={savingEditAct} onClick={handleSaveAct}>{savingEditAct ? '…' : '✓'}</button>
                                <button className="btn btn-or btn-sm" onClick={cancelEditAct}>✕</button>
                              </div>
                            </td>
                          </tr>
                        )
                        return (
                          <tr key={a.id}>
                            <td>{a.type_code}</td>
                            <td style={{ fontSize: 12 }}>{fmtDate(a.heure_faite)}</td>
                            <td style={{ fontSize: 12 }}>{fmtDate(a.prochain_dispo)}</td>
                            <td style={{ color: 'var(--or-pale)' }}>{fmt(a.somme_argent_sale)}</td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{a.note || '—'}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-or btn-sm" onClick={() => startEditAct(a)} title="Modifier">✎</button>
                                {viewer.rang === 'direction' && (
                                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteActivite(a.id)}>✕</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Formulaire ventes */}
          <div className="card">
            <div className="card-title">Ventes de drogue — {membre.surnom}</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Drogue</th><th>Quantité</th><th>Montant total ($)</th><th>Prix/unité</th><th>Bénéfice prévu</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {lignesVente.map(l => {
                    const drogue      = drogues.find(d => d.id === l.drogue_id)
                    const qte         = parseInt(l.quantite) || 0
                    const total       = parseFloat(l.prix_total) || 0
                    const prixUnit    = qte > 0 && total > 0 ? Math.round(total / qte) : null
                    const benefice    = drogue && l.statut === 'Vendu' && qte && total
                      ? total - drogue.prix_revient * qte : null
                    const perteSaisie = drogue && l.statut === 'Saisie' && qte
                      ? -(qte * drogue.prix_revient) : null
                    return (
                      <tr key={l._id}>
                        <td>
                          <select className="form-select" style={{ minWidth: 140 }}
                            value={l.drogue_id} onChange={e => updateLigne(l._id, 'drogue_id', e.target.value)}>
                            <option value="">— Choisir —</option>
                            {drogues.map(d => <option key={d.id} value={d.id}>{d.nom} (rev. {fmt(d.prix_revient)})</option>)}
                          </select>
                        </td>
                        <td>
                          <input className="form-input" type="number" min="1" style={{ width: 80 }}
                            placeholder="Qté" value={l.quantite}
                            onChange={e => updateLigne(l._id, 'quantite', e.target.value)} />
                        </td>
                        <td>
                          {l.statut === 'Saisie' ? (
                            <span style={{ color: 'var(--texte-soft)', fontSize: 12 }}>— saisie</span>
                          ) : (
                            <input className="form-input" type="number" min="0" style={{ width: 120 }}
                              placeholder="Ex : 15000" value={l.prix_total}
                              onChange={e => updateLigne(l._id, 'prix_total', e.target.value)} />
                          )}
                        </td>
                        <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                          {prixUnit !== null ? fmt(prixUnit) : '—'}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {benefice !== null && <span style={{ color: benefice >= 0 ? 'var(--or-pale)' : '#e05555' }}>{fmt(benefice)}</span>}
                          {perteSaisie !== null && <span style={{ color: '#e05555' }}>− {fmt(Math.abs(perteSaisie))}</span>}
                        </td>
                        <td>
                          <select className="form-select" style={{ minWidth: 110 }}
                            value={l.statut} onChange={e => updateLigne(l._id, 'statut', e.target.value)}>
                            <option value="Vendu">Vendu</option>
                            <option value="Saisie">Saisie</option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn btn-solid" style={{ marginTop: 16 }} onClick={handleSubmitVentes}>
              + Enregistrer les ventes
            </button>

            {ventes.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--texte-soft)' }}>
                    Ventes cette semaine ({ventes.length})
                  </div>
                  {ventes.length > 5 && (
                    <button className="btn btn-or btn-sm" style={{ fontSize: 11 }} onClick={() => setShowAllVentes(v => !v)}>
                      {showAllVentes ? 'Afficher moins' : `Afficher tout (${ventes.length})`}
                    </button>
                  )}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Drogue</th><th>Qté</th><th>Montant total</th><th>Prix/unité</th><th>Bénéfice</th><th>Statut</th><th>Date</th><th></th></tr></thead>
                    <tbody>
                      {(showAllVentes ? ventes : ventes.slice(0, 5)).map(v => {
                        const isEditing = editVenteId === v.id
                        if (isEditing) return (
                          <tr key={v.id} style={{ background: 'rgba(201,168,76,0.04)' }}>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{v.drogues?.nom || '—'}</td>
                            <td>
                              <input className="form-input" type="number" min="1"
                                style={{ width: 70, padding: '3px 8px', fontSize: 12 }}
                                value={editVenteForm.quantite}
                                onChange={e => setEditVenteForm(f => ({ ...f, quantite: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveVente(); if (e.key === 'Escape') cancelEditVente() }}
                                autoFocus />
                            </td>
                            <td>
                              {editVenteForm.statut === 'Saisie' ? (
                                <span style={{ color: 'var(--texte-soft)', fontSize: 12 }}>— saisie</span>
                              ) : (
                                <input className="form-input" type="number" min="0"
                                  style={{ width: 110, padding: '3px 8px', fontSize: 12 }}
                                  value={editVenteForm.prix_total}
                                  onChange={e => setEditVenteForm(f => ({ ...f, prix_total: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSaveVente(); if (e.key === 'Escape') cancelEditVente() }} />
                              )}
                            </td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>—</td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>—</td>
                            <td>
                              <select className="form-select" style={{ minWidth: 90, padding: '3px 8px', fontSize: 12 }}
                                value={editVenteForm.statut}
                                onChange={e => setEditVenteForm(f => ({ ...f, statut: e.target.value }))}>
                                <option value="Vendu">Vendu</option>
                                <option value="Saisie">Saisie</option>
                              </select>
                            </td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(v.created_at)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-solid btn-sm" disabled={savingEditVente} onClick={handleSaveVente}>{savingEditVente ? '…' : '✓'}</button>
                                <button className="btn btn-or btn-sm" onClick={cancelEditVente}>✕</button>
                              </div>
                            </td>
                          </tr>
                        )
                        const prixUnit = v.statut !== 'Saisie' && v.quantite > 0 && v.prix_total > 0
                          ? Math.round(v.prix_total / v.quantite) : null
                        return (
                          <tr key={v.id}>
                            <td>{v.drogues?.nom || '—'}</td>
                            <td>{v.quantite}</td>
                            <td style={{ color: 'var(--texte-soft)' }}>
                              {v.statut === 'Saisie' ? '—' : fmt(v.prix_total || 0)}
                            </td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                              {prixUnit !== null ? fmt(prixUnit) : '—'}
                            </td>
                            <td style={{ color: v.statut === 'Saisie' ? '#e05555' : 'var(--or-pale)' }}>
                              {v.statut === 'Saisie' ? `− ${fmt(Math.abs(v.argent_sale))}` : fmt(v.argent_sale)}
                            </td>
                            <td><span className={`badge ${v.statut === 'Saisie' ? 'badge-rouge' : 'badge-vert'}`}>{v.statut}</span></td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(v.created_at)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-or btn-sm" onClick={() => startEditVente(v)} title="Modifier">✎</button>
                                {viewer.rang === 'direction' && (
                                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteVente(v.id)}>✕</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Formulaire plantation + historique */}
          {(() => {
            const fmNbPots     = parseInt(formPlant.nb_pots) || 0
            const fmNbBranches = parseInt(formPlant.nb_branches) || 0
            const fmBpP        = fmNbPots > 0 && fmNbBranches > 0 ? Math.round(fmNbBranches / fmNbPots) : null
            const fmTotalPotsSem = plantations.reduce((s, p) => s + (p.nb_pots || 0), 0) + fmNbPots
            const fmBenef      = brancheParams && fmNbBranches > 0 && fmNbPots > 0
              ? calculerBenefice(fmNbPots, fmNbBranches, brancheParams, fmTotalPotsSem)
              : null
            return (
              <div className="card">
                <div className="card-title">Récoltes cette semaine — {membre.surnom}</div>
                <form onSubmit={handleSubmitPlantation}>
                  <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Pots plantés *</label>
                      <input className="form-input" type="number" min="1" required placeholder="Ex : 50"
                        value={formPlant.nb_pots} onChange={e => setFormPlant(f => ({ ...f, nb_pots: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Branches récoltées *</label>
                      <input className="form-input" type="number" min="1" required placeholder="Ex : 2500"
                        value={formPlant.nb_branches} onChange={e => setFormPlant(f => ({ ...f, nb_branches: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Branches / pot (auto)</label>
                      <input className="form-input" type="text" disabled
                        value={fmBpP !== null ? `${fmBpP} branches / pot` : '—'}
                        style={{ fontWeight: fmBpP !== null ? 600 : undefined, color: fmBpP === null ? undefined : fmBpP >= 8 ? '#5cba8a' : fmBpP === 7 ? '#e8a84c' : '#e05555' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Bénéfice estimé (auto)</label>
                      <input className="form-input" type="text" disabled
                        value={fmBenef !== null ? fmt(fmBenef) : '—'}
                        style={{ fontWeight: 600, color: fmBenef !== null ? (fmBenef >= 0 ? '#5cba8a' : '#e05555') : undefined }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date de récolte</label>
                      <input className="form-input" type="datetime-local"
                        value={formPlant.date_plantation} onChange={e => setFormPlant(f => ({ ...f, date_plantation: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Note (facultatif)</label>
                      <input className="form-input" type="text" placeholder="Lieu, conditions…"
                        value={formPlant.note} onChange={e => setFormPlant(f => ({ ...f, note: e.target.value }))} />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-solid" disabled={savingPlant}>
                    {savingPlant ? 'Enregistrement...' : '+ Valider la récolte'}
                  </button>
                </form>

                {plantations.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--texte-soft)' }}>
                        Historique ({plantations.length})
                      </div>
                      {plantations.length > 5 && (
                        <button className="btn btn-or btn-sm" style={{ fontSize: 11 }} onClick={() => setShowAllPlants(v => !v)}>
                          {showAllPlants ? 'Afficher moins' : `Afficher tout (${plantations.length})`}
                        </button>
                      )}
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th><th>Pots</th><th>Branches</th><th>Moy/Pot</th><th>Bénéfice</th><th>Note</th><th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(showAllPlants ? plantations : plantations.slice(0, 5)).map(p => {
                            const isEditing = editPlantId === p.id
                            if (isEditing) return (
                              <tr key={p.id} style={{ background: 'rgba(201,168,76,0.04)' }}>
                                <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                                  {fmtDateOnly(p.date_plantation)}
                                </td>
                                <td>
                                  <input className="form-input" type="number" min="1"
                                    style={{ width: 70, padding: '3px 8px', fontSize: 12 }}
                                    value={editPlantForm.nb_pots}
                                    onChange={e => setEditPlantForm(f => ({ ...f, nb_pots: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSavePlant(); if (e.key === 'Escape') cancelEditPlant() }}
                                    autoFocus />
                                </td>
                                <td>
                                  <input className="form-input" type="number" min="1"
                                    style={{ width: 90, padding: '3px 8px', fontSize: 12 }}
                                    value={editPlantForm.nb_branches}
                                    onChange={e => setEditPlantForm(f => ({ ...f, nb_branches: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSavePlant(); if (e.key === 'Escape') cancelEditPlant() }} />
                                </td>
                                <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>—</td>
                                <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>—</td>
                                <td>
                                  <input className="form-input" type="text"
                                    style={{ minWidth: 130, padding: '3px 8px', fontSize: 12 }}
                                    placeholder="Note…"
                                    value={editPlantForm.note}
                                    onChange={e => setEditPlantForm(f => ({ ...f, note: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSavePlant(); if (e.key === 'Escape') cancelEditPlant() }} />
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button className="btn btn-solid btn-sm" disabled={savingEditPlant} onClick={handleSavePlant}>{savingEditPlant ? '…' : '✓'}</button>
                                    <button className="btn btn-or btn-sm" onClick={cancelEditPlant}>✕</button>
                                  </div>
                                </td>
                              </tr>
                            )
                            const moy = p.nb_pots > 0 ? Math.round(p.nb_branches / p.nb_pots) : 0
                            const couleur = moy >= 8 ? '#4caf7d' : moy === 7 ? '#e8a84c' : '#e05555'
                            return (
                              <tr key={p.id}>
                                <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                                  {fmtDateOnly(p.date_plantation)}
                                </td>
                                <td>{p.nb_pots}</td>
                                <td>{p.nb_branches}</td>
                                <td style={{ color: couleur, fontWeight: 600 }}>{moy}</td>
                                <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(p.benefice)}</td>
                                <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{p.note || '—'}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button className="btn btn-or btn-sm" onClick={() => startEditPlant(p)} title="Modifier">✎</button>
                                    {viewer.rang === 'direction' && (
                                      <button className="btn btn-danger btn-sm" onClick={() => handleDeletePlantation(p.id)}>✕</button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Récap */}
          <div className="card">
            <div className="card-title">Récap semaine — {membre.surnom}</div>

            {/* Quotas hebdomadaires */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 14,
              marginBottom: 22, padding: '14px 16px',
              background: 'rgba(201,168,76,0.05)', border: '1px solid var(--or-border)', borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--or)' }}>
                Quotas de la semaine
              </div>
              <Jauge label="Actions effectuées"  valeur={nbActionsQuota}  objectif={QUOTA_ACTIONS} />
              <Jauge label="Branches récoltées"  valeur={nbBranchesQuota} objectif={QUOTA_BRANCHES} />
              <Jauge label="Drogues vendues"     valeur={nbUnitesQuota}   objectif={QUOTA_UNITES} suffixe=" unités" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--texte-soft)' }}>Activités (hors cambriolage)</span>
                <span style={{ color: 'var(--or-pale)' }}>{fmt(totalActBrut)}</span>
              </div>
              {cambriolageTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--texte-soft)' }}>Cambriolage <span style={{ fontSize: 11, opacity: 0.6 }}>(direct, hors commission)</span></span>
                  <span style={{ color: 'var(--or-pale)' }}>{fmt(cambriolageTotal)}</span>
                </div>
              )}
              {nbATM > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--texte-soft)' }}>Boitiers ATM ({nbATM}×)</span>
                  <span style={{ color: '#e05555' }}>− {fmt(deductionBoitiers)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--texte-soft)' }}>Ventes — montant total</span>
                <span style={{ color: 'var(--texte-soft)' }}>{fmt(totalPrixTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--texte-soft)' }}>Ventes — bénéfice</span>
                <span style={{ color: 'var(--or-pale)' }}>{fmt(totalBenefice)}</span>
              </div>
              {totalPlantations > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--texte-soft)' }}>Plantations — bénéfice</span>
                  <span style={{ color: 'var(--or-pale)' }}>{fmt(totalPlantations)}</span>
                </div>
              )}
              {totalSaisies > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--texte-soft)' }}>Pertes saisies</span>
                  <span style={{ color: '#e05555' }}>− {fmt(totalSaisies)}</span>
                </div>
              )}
              <hr className="sep-or" style={{ margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--texte-soft)' }}>Base commission</span>
                <span style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(base)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--texte-soft)' }}>
                  Taux effectif
                  <span style={{ fontSize: 11, opacity: 0.6 }}>
                    {tranches_detail.length > 0
                      ? tranches_detail.map(t => `${t.taux_effectif}% sur ${Math.round(t.portion).toLocaleString('fr-FR')}$`).join(' + ')
                      : `×${multiplicateur}`}
                    {' — '}taux moy. {commission_pct.toFixed(1)}%
                  </span>
                </span>
                <span style={{ color: '#e8a84c' }}>− {fmt(commission)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 16, fontFamily: 'var(--font-corps)',
                padding: '12px 0 8px', borderTop: '1px solid var(--or-border)',
              }}>
                <span style={{ color: 'var(--or)' }}>Total NET</span>
                <span style={{ color: 'var(--or-pale)', fontWeight: 700 }}>{fmt(net)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(201,168,76,0.07)', border: '1px solid var(--or-border)',
                borderRadius: 6, padding: '10px 14px',
              }}>
                <div>
                  <div style={{ color: 'var(--or)', fontFamily: 'var(--font-titre)', fontSize: 12, letterSpacing: '0.1em' }}>
                    Salaire propre
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--texte-soft)', marginTop: 2 }}>
                    Après blanchiment (−35%)
                  </div>
                </div>
                <span style={{ color: 'var(--or-pale)', fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-corps)' }}>
                  {fmt(net * 0.65)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
