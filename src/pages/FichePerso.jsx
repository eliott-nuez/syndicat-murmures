import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getDebutSemaine, getDebutSemaineStr } from '../utils/temps'
import { chargerParamsCommission, calculerCommission } from '../utils/commission'
import { getRangEffectif } from '../utils/viewAs'
import { chargerQuotas } from '../utils/quotas'
import { nowLocalInput, localInputToUTCISO, fmtDateTime, fmtDate as fmtDateOnly, detectTz, setUserTz, getUserTz, TZ_LIST } from '../utils/timezone'
import { chargerBrancheParams, calculerBenefice, recalculerBeneficesSemaine, toSale } from '../utils/branche'

const COOLDOWNS_H = {
  'ATM':         3,
  'Supérette':   2,
  'Go Fast':    24,
  'Cambriolage': 3,
}

const localNow = nowLocalInput

export default function FichePerso() {
  const membre      = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const rangEffectif = getRangEffectif() || membre.rang || 'membre'

  const [brancheParams, setBrancheParams] = useState(null)
  const [drogues, setDrogues]               = useState([])
  const [activites, setActivites]           = useState([])
  const [ventes, setVentes]                 = useState([])
  const [plantations, setPlantations]       = useState([])
  const [commissionParams, setCommissionParams] = useState({ tranches: [], multiplicateurs: {}, boitierCout: 0 })
  const [quotas, setQuotas] = useState({ actions: 20, branches: 2000, unites: 300 })
  const [msg, setMsg]                       = useState({ type: '', text: '' })
  const [msgMdp, setMsgMdp]                 = useState({ type: '', text: '' })
  const [branche, setBranche]               = useState(null)
  const [membresListe, setMembresListe]     = useState([])
  const [formPlant, setFormPlant]           = useState({ membre_id: membre.id, nb_pots: '', nb_branches: '', date_plantation: localNow(), note: '' })
  const [savingPlant, setSavingPlant]       = useState(false)

  // Form activité
  const [formAct, setFormAct] = useState({
    type_code: 'ATM',
    somme_argent_sale: '',
    note: '',
    heure_faite: localNow(),
  })
  const [savingAct, setSavingAct]           = useState(false)
  const [editActId, setEditActId]           = useState(null)
  const [editActForm, setEditActForm]       = useState({ type_code: '', somme_argent_sale: '', note: '' })
  const [savingEditAct, setSavingEditAct]   = useState(false)

  // Edition vente
  const [editVenteId, setEditVenteId]       = useState(null)
  const [editVenteForm, setEditVenteForm]   = useState({ quantite: '', prix_total: '', statut: 'Vendu' })
  const [savingEditVente, setSavingEditVente] = useState(false)

  // Edition plantation
  const [editPlantId, setEditPlantId]       = useState(null)
  const [editPlantForm, setEditPlantForm]   = useState({ nb_pots: '', nb_branches: '', note: '' })
  const [savingEditPlant, setSavingEditPlant] = useState(false)

  // Afficher plus / moins
  const [showAllActs, setShowAllActs]     = useState(false)
  const [showAllVentes, setShowAllVentes] = useState(false)
  const [showAllPlants, setShowAllPlants] = useState(false)

  // Form vente (lignes dynamiques)
  const [lignesVente, setLignesVente] = useState([emptyLigne()])

  // Form mot de passe
  const [mdpForm, setMdpForm] = useState({ actuel: '', nouveau: '', confirm: '' })
  const [savingMdp, setSavingMdp] = useState(false)

  function emptyLigne() {
    return { drogue_id: '', quantite: '', prix_total: '', statut: 'Vendu', _id: Math.random() }
  }

  useEffect(() => {
    fetchDrogues()
    fetchActivitesSemaine()
    fetchVentesSemaine()
    fetchPlantationsSemaine()
    chargerParamsCommission().then(setCommissionParams)
    chargerQuotas(getRangEffectif() || membre.rang).then(setQuotas)
    supabase.from('drogues').select('*').ilike('nom', '%branche%').maybeSingle().then(({ data }) => setBranche(data))
    chargerBrancheParams().then(setBrancheParams)
    if (['responsable','direction'].includes(getRangEffectif() || membre.rang)) {
      supabase.from('membres').select('id, surnom, rang').eq('archive', false).order('surnom').then(({ data }) => setMembresListe(data || []))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlantationsSemaine = async () => {
    const { data } = await supabase
      .from('plantations')
      .select('id, nb_pots, nb_branches, branches_par_pot, benefice, date_plantation, note')
      .eq('membre_id', membre.id)
      .gte('date_plantation', getDebutSemaineStr())
      .order('date_plantation', { ascending: false })
    setPlantations(data || [])
  }

  const fetchDrogues = async () => {
    const { data } = await supabase.from('drogues').select('*').order('nom')
    setDrogues(data || [])
  }

  const fetchActivitesSemaine = async () => {
    const { data } = await supabase
      .from('activites')
      .select('*')
      .eq('membre_id', membre.id)
      .gte('heure_faite', getDebutSemaineStr())
      .order('heure_faite', { ascending: false })
    setActivites(data || [])
  }

  const fetchVentesSemaine = async () => {
    const { data } = await supabase
      .from('ventes_drogue')
      .select('*, drogues(nom, prix_revient)')
      .eq('membre_id', membre.id)
      .gte('created_at', getDebutSemaine().toISOString())
      .order('created_at', { ascending: false })
    setVentes(data || [])
  }

  const calcProchainDispo = (heure, type) => {
    const h = COOLDOWNS_H[type] || 0
    return new Date(new Date(heure).getTime() + h * 3600 * 1000)
  }

  // ── Édition vente ──
  const startEditVente = (v) => {
    setEditVenteId(v.id)
    setEditVenteForm({ quantite: String(v.quantite), prix_total: String(v.prix_total || ''), statut: v.statut })
  }
  const cancelEditVente = () => setEditVenteId(null)
  const handleSaveVente = async () => {
    const qte  = parseInt(editVenteForm.quantite) || 0
    const prix = parseFloat(editVenteForm.prix_total) || 0
    const vente = ventes.find(v => v.id === editVenteId)
    const prixRevient = vente?.drogues?.prix_revient || 0
    const argent_sale = editVenteForm.statut === 'Saisie' ? -(qte * prixRevient) : prix - (qte * prixRevient)
    setSavingEditVente(true)
    const { error } = await supabase.from('ventes_drogue')
      .update({ quantite: qte, prix_total: editVenteForm.statut === 'Saisie' ? 0 : prix, statut: editVenteForm.statut, argent_sale })
      .eq('id', editVenteId)
    setSavingEditVente(false)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }); return }
    setMsg({ type: 'success', text: 'Vente mise à jour.' })
    cancelEditVente(); fetchVentesSemaine()
  }

  // ── Édition plantation ──
  const startEditPlant = (p) => {
    setEditPlantId(p.id)
    setEditPlantForm({ nb_pots: String(p.nb_pots || ''), nb_branches: String(p.nb_branches || ''), note: p.note || '' })
  }
  const cancelEditPlant = () => setEditPlantId(null)
  const handleSavePlant = async () => {
    const nb_pots     = parseInt(editPlantForm.nb_pots) || 0
    const nb_branches = parseInt(editPlantForm.nb_branches) || 0
    if (!nb_pots || !nb_branches) { setMsg({ type: 'error', text: 'Pots et branches obligatoires.' }); return }
    const branches_par_pot = Math.round(nb_branches / nb_pots)
    setSavingEditPlant(true)
    const { error } = await supabase.from('plantations')
      .update({ nb_pots, nb_branches, branches_par_pot, benefice: 0, note: editPlantForm.note || null })
      .eq('id', editPlantId)
    if (!error && branche) await recalculerBeneficesSemaine(branche.id, brancheParams)
    setSavingEditPlant(false)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }); return }
    setMsg({ type: 'success', text: 'Récolte mise à jour.' })
    cancelEditPlant(); fetchPlantationsSemaine()
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
    fetchActivitesSemaine()
  }

  const handleSubmitActivite = async (e) => {
    e.preventDefault()
    setSavingAct(true)
    setMsg({ type: '', text: '' })

    const heure_faite    = localInputToUTCISO(formAct.heure_faite)
    const prochain_dispo = calcProchainDispo(new Date(heure_faite), formAct.type_code).toISOString()

    const { error } = await supabase.from('activites').insert({
      membre_id:         membre.id,
      type_code:         formAct.type_code,
      heure_faite,
      prochain_dispo,
      somme_argent_sale: parseFloat(formAct.somme_argent_sale) || 0,
      note:              formAct.note || null,
    })

    setSavingAct(false)
    if (error) {
      setMsg({ type: 'error', text: 'Erreur : ' + error.message })
    } else {
      setMsg({ type: 'success', text: 'Activité enregistrée.' })
      setFormAct({ ...formAct, somme_argent_sale: '', note: '', heure_faite: localNow() })
      fetchActivitesSemaine()
    }
  }

  const handleSubmitVentes = async () => {
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
      return { membre_id: membre.id, drogue_id: l.drogue_id, quantite: qte, prix_total, argent_sale: argent, statut: l.statut }
    })

    const { error } = await supabase.from('ventes_drogue').insert(rows)
    if (error) {
      setMsg({ type: 'error', text: 'Erreur ventes : ' + error.message })
    } else {
      setMsg({ type: 'success', text: 'Ventes enregistrées.' })
      setLignesVente([emptyLigne()])
      fetchVentesSemaine()
    }
  }

  const handleChangeMdp = async (e) => {
    e.preventDefault()
    setMsgMdp({ type: '', text: '' })
    if (mdpForm.nouveau !== mdpForm.confirm) {
      setMsgMdp({ type: 'error', text: 'Les mots de passe ne correspondent pas.' })
      return
    }
    if (mdpForm.nouveau.length < 4) {
      setMsgMdp({ type: 'error', text: 'Mot de passe trop court (4 caractères min).' })
      return
    }
    setSavingMdp(true)
    // Vérifier l'ancien mot de passe via Supabase Auth (jamais en clair en base)
    const email = `${membre.surnom.trim().toLowerCase()}@sdm.local`
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: mdpForm.actuel })
    if (signInErr) {
      setMsgMdp({ type: 'error', text: 'Mot de passe actuel incorrect.' })
      setSavingMdp(false)
      return
    }
    // Mettre à jour uniquement dans Supabase Auth
    await supabase.auth.updateUser({ password: mdpForm.nouveau })
    setSavingMdp(false)
    setMsgMdp({ type: 'success', text: 'Mot de passe mis à jour.' })
    setMdpForm({ actuel: '', nouveau: '', confirm: '' })
  }

  const updateLigne = (id, field, value) => {
    setLignesVente(prev => {
      const updated = prev.map(l => l._id === id ? { ...l, [field]: value } : l)
      const last = updated[updated.length - 1]
      if (last.drogue_id) return [...updated, emptyLigne()]
      return updated
    })
  }

  const handleSubmitPlantation = async (e) => {
    e.preventDefault()
    const nb_pots     = parseInt(formPlant.nb_pots) || 0
    const nb_branches = parseInt(formPlant.nb_branches) || 0
    if (!nb_pots || !nb_branches) { setMsg({ type: 'error', text: 'Pots et branches obligatoires.' }); return }
    setSavingPlant(true)
    let drogueActive = branche
    if (!drogueActive) {
      const { data } = await supabase.from('drogues').select('*').ilike('nom', '%branche%').maybeSingle()
      drogueActive = data; if (drogueActive) setBranche(drogueActive)
    }
    if (!drogueActive) { setMsg({ type: 'error', text: 'Drogue "Branche" introuvable.' }); setSavingPlant(false); return }
    const branches_par_pot = nb_pots > 0 ? Math.round(nb_branches / nb_pots) : 0
    const { error } = await supabase.from('plantations').insert({
      membre_id: formPlant.membre_id || membre.id,
      drogue_id: drogueActive.id,
      nb_pots, nb_branches, branches_par_pot, benefice: 0,
      date_plantation: localInputToUTCISO(formPlant.date_plantation),
      note: formPlant.note || null,
    })
    if (!error) await recalculerBeneficesSemaine(drogueActive.id, brancheParams)
    setSavingPlant(false)
    if (error) { setMsg({ type: 'error', text: 'Erreur : ' + error.message }) }
    else {
      setMsg({ type: 'success', text: 'Récolte enregistrée.' })
      setFormPlant(f => ({ ...f, nb_pots: '', nb_branches: '', date_plantation: localNow(), note: '' }))
      fetchPlantationsSemaine()
    }
  }

  const calc = calculerCommission(activites, ventes, rangEffectif, commissionParams, plantations)
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
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Espace personnel
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Ma fiche — {membre.surnom}
        </h1>
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* ── Activité ── */}
      <div className="card">
        <div className="card-title">Déclarer une activité</div>
        <form onSubmit={handleSubmitActivite}>
          <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Type d'activité</label>
              <select className="form-select"
                value={formAct.type_code}
                onChange={e => setFormAct({ ...formAct, type_code: e.target.value })}>
                {Object.keys(COOLDOWNS_H).map(t => (
                  <option key={t} value={t}>{t} — cooldown {COOLDOWNS_H[t]}h</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Heure effectuée</label>
              <input className="form-input" type="datetime-local"
                value={formAct.heure_faite}
                onChange={e => setFormAct({ ...formAct, heure_faite: e.target.value })}
                required />
            </div>
            <div className="form-group">
              <label className="form-label">Somme récoltée ($)</label>
              <input className="form-input" type="number" min="0" step="1"
                placeholder="Ex : 4500"
                value={formAct.somme_argent_sale}
                onChange={e => setFormAct({ ...formAct, somme_argent_sale: e.target.value })}
                required />
            </div>
            <div className="form-group">
              <label className="form-label">Prochaine dispo (auto)</label>
              <input className="form-input" type="text" disabled
                value={formAct.heure_faite
                  ? fmtDate(calcProchainDispo(new Date(localInputToUTCISO(formAct.heure_faite)), formAct.type_code))
                  : '—'}
                style={{ opacity: 0.5 }} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Note (facultatif)</label>
            <input className="form-input" type="text"
              placeholder="Remarque, lieu, etc."
              value={formAct.note}
              onChange={e => setFormAct({ ...formAct, note: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-solid" disabled={savingAct}>
            {savingAct ? 'Enregistrement...' : '+ Valider l\'activité'}
          </button>
        </form>

        {activites.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--texte-soft)' }}>
                Activités cette semaine ({activites.length})
              </div>
              {activites.length > 5 && (
                <button className="btn btn-or btn-sm" onClick={() => setShowAllActs(v => !v)}>
                  {showAllActs ? 'Afficher moins' : `Afficher plus (${activites.length - 5} de plus)`}
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
                          <button className="btn btn-or btn-sm" onClick={() => startEditAct(a)} title="Modifier">✎</button>
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

      {/* ── Ventes drogue ── */}
      <div className="card">
        <div className="card-title">Ventes de drogue</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Drogue</th>
                <th>Quantité</th>
                <th>Montant total ($)</th>
                <th>Prix/unité</th>
                <th>Bénéfice prévu</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {lignesVente.map(l => {
                const drogue     = drogues.find(d => d.id === l.drogue_id)
                const qte        = parseInt(l.quantite) || 0
                const total      = parseFloat(l.prix_total) || 0
                const prixUnit   = qte > 0 && total > 0 ? Math.round(total / qte) : null
                const benefice   = drogue && l.statut === 'Vendu' && qte && total
                  ? total - drogue.prix_revient * qte
                  : null
                const perteSaisie = drogue && l.statut === 'Saisie' && qte
                  ? -(qte * drogue.prix_revient)
                  : null

                return (
                  <tr key={l._id}>
                    <td>
                      <select className="form-select" style={{ minWidth: 140 }}
                        value={l.drogue_id}
                        onChange={e => updateLigne(l._id, 'drogue_id', e.target.value)}>
                        <option value="">— Choisir —</option>
                        {drogues.map(d => (
                          <option key={d.id} value={d.id}>{d.nom} (rev. {fmt(d.prix_revient)})</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="form-input" type="number" min="1" style={{ width: 80 }}
                        placeholder="Qté"
                        value={l.quantite}
                        onChange={e => updateLigne(l._id, 'quantite', e.target.value)} />
                    </td>
                    <td>
                      {l.statut === 'Saisie' ? (
                        <span style={{ color: 'var(--texte-soft)', fontSize: 12 }}>— saisie</span>
                      ) : (
                        <input className="form-input" type="number" min="0" style={{ width: 120 }}
                          placeholder="Ex : 15000"
                          value={l.prix_total}
                          onChange={e => updateLigne(l._id, 'prix_total', e.target.value)} />
                      )}
                    </td>
                    <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                      {prixUnit !== null ? fmt(prixUnit) : '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {benefice !== null && (
                        <span style={{ color: benefice >= 0 ? 'var(--or-pale)' : '#e05555' }}>
                          {fmt(benefice)}
                        </span>
                      )}
                      {perteSaisie !== null && (
                        <span style={{ color: '#e05555' }}>− {fmt(Math.abs(perteSaisie))}</span>
                      )}
                    </td>
                    <td>
                      <select className="form-select" style={{ minWidth: 110 }}
                        value={l.statut}
                        onChange={e => updateLigne(l._id, 'statut', e.target.value)}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--texte-soft)' }}>
                Ventes cette semaine ({ventes.length})
              </div>
              {ventes.length > 5 && (
                <button className="btn btn-or btn-sm" onClick={() => setShowAllVentes(v => !v)}>
                  {showAllVentes ? 'Afficher moins' : `Afficher plus (${ventes.length - 5} de plus)`}
                </button>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Drogue</th><th>Qté</th><th>Montant total</th><th>Bénéfice</th><th>Statut</th><th>Date</th><th></th></tr></thead>
                <tbody>
                  {(showAllVentes ? ventes : ventes.slice(0, 5)).map(v => {
                    const isEditing = editVenteId === v.id
                    if (isEditing) return (
                      <tr key={v.id} style={{ background: 'rgba(201,168,76,0.04)' }}>
                        <td style={{ color: 'var(--texte-soft)' }}>{v.drogues?.nom || '—'}</td>
                        <td>
                          <input className="form-input" type="number" min="1"
                            style={{ width: 70, padding: '3px 7px', fontSize: 13 }}
                            value={editVenteForm.quantite}
                            onChange={e => setEditVenteForm(f => ({ ...f, quantite: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Escape') cancelEditVente() }}
                            autoFocus />
                        </td>
                        <td>
                          {editVenteForm.statut === 'Saisie' ? (
                            <span style={{ color: 'var(--texte-soft)', fontSize: 12 }}>— saisie</span>
                          ) : (
                            <input className="form-input" type="number" min="0"
                              style={{ width: 110, padding: '3px 7px', fontSize: 13 }}
                              value={editVenteForm.prix_total}
                              onChange={e => setEditVenteForm(f => ({ ...f, prix_total: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Escape') cancelEditVente() }} />
                          )}
                        </td>
                        <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>—</td>
                        <td>
                          <select className="form-select" style={{ minWidth: 90, padding: '3px 7px', fontSize: 12 }}
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
                    return (
                      <tr key={v.id}>
                        <td>{v.drogues?.nom || '—'}</td>
                        <td>{v.quantite}</td>
                        <td style={{ color: 'var(--texte-soft)' }}>
                          {v.statut === 'Saisie' ? '—' : fmt(v.prix_total || 0)}
                        </td>
                        <td style={{ color: v.statut === 'Saisie' ? '#e05555' : 'var(--or-pale)' }}>
                          {v.statut === 'Saisie' ? `− ${fmt(Math.abs(v.argent_sale))}` : fmt(v.argent_sale)}
                        </td>
                        <td>
                          <span className={`badge ${v.statut === 'Saisie' ? 'badge-rouge' : 'badge-vert'}`}>
                            {v.statut}
                          </span>
                        </td>
                        <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(v.created_at)}</td>
                        <td>
                          <button className="btn btn-or btn-sm" onClick={() => startEditVente(v)} title="Modifier">✎</button>
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

      {/* ── Récolte cannabis ── */}
      {(() => {
        const plantNbPots     = parseInt(formPlant.nb_pots) || 0
        const plantNbBranches = parseInt(formPlant.nb_branches) || 0
        const plantBpP        = plantNbPots > 0 && plantNbBranches > 0 ? Math.round(plantNbBranches / plantNbPots) : null
        const totalPotsSemaineAvecCelui = plantations.reduce((s, p) => s + (p.nb_pots || 0), 0) + plantNbPots
        const plantBenefice   = brancheParams && plantNbBranches > 0 && plantNbPots > 0
          ? calculerBenefice(plantNbPots, plantNbBranches, brancheParams, totalPotsSemaineAvecCelui)
          : null
        const prixReventeSale = brancheParams
          ? toSale(brancheParams.branche_prix_revente_branche.valeur, brancheParams.branche_prix_revente_branche.monnaie)
          : 0
        return (
          <div className="card">
            <div className="card-title">Récolte de cannabis</div>
            {brancheParams && (
              <div style={{ fontSize: 12, color: 'var(--texte-soft)', marginBottom: 14 }}>
                Prix revente : <span style={{ color: 'var(--or-pale)' }}>{fmt(prixReventeSale)}/branche</span>
                {' · '}coûts configurables par la direction (onglet Branches)
              </div>
            )}
            <form onSubmit={handleSubmitPlantation}>
              <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                {['responsable','direction'].includes(rangEffectif) && (
                  <div className="form-group">
                    <label className="form-label">Membre</label>
                    <select className="form-select" value={formPlant.membre_id}
                      onChange={e => setFormPlant(f => ({ ...f, membre_id: e.target.value }))}>
                      {membresListe.map(m => <option key={m.id} value={m.id}>{m.surnom} ({m.rang}){m.id === membre.id ? ' — moi' : ''}</option>)}
                    </select>
                  </div>
                )}
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
                    value={plantBpP !== null ? `${plantBpP} branches / pot` : '—'}
                    style={{ fontWeight: plantBpP !== null ? 600 : undefined, color: plantBpP === null ? undefined : plantBpP >= 8 ? '#5cba8a' : plantBpP === 7 ? '#e8a84c' : '#e05555' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Bénéfice estimé (auto)</label>
                  <input className="form-input" type="text" disabled
                    value={plantBenefice !== null ? fmt(plantBenefice) : '—'}
                    style={{ fontWeight: 600, color: plantBenefice !== null ? (plantBenefice >= 0 ? '#5cba8a' : '#e05555') : undefined }} />
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--texte-soft)' }}>
                    Historique ({plantations.length})
                  </div>
                  {plantations.length > 5 && (
                    <button className="btn btn-or btn-sm" style={{ fontSize: 11 }} onClick={() => setShowAllPlants(v => !v)}>
                      {showAllPlants ? 'Afficher moins' : `Afficher plus (${plantations.length - 5} de plus)`}
                    </button>
                  )}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Pots</th><th>Branches</th><th>Moy/pot</th><th>Bénéfice</th><th>Note</th><th></th></tr>
                    </thead>
                    <tbody>
                      {(showAllPlants ? plantations : plantations.slice(0, 5)).map(p => {
                        const isEditing = editPlantId === p.id
                        const moy = p.nb_pots > 0 ? Math.round(p.nb_branches / p.nb_pots) : 0
                        const couleur = moy >= 8 ? '#4caf7d' : moy === 7 ? '#e8a84c' : '#e05555'
                        if (isEditing) {
                          const epots = parseInt(editPlantForm.nb_pots) || 0
                          const ebranches = parseInt(editPlantForm.nb_branches) || 0
                          const emoy = epots > 0 && ebranches > 0 ? Math.round(ebranches / epots) : null
                          const eTotalPots = plantations.reduce((s, x) => s + (x.id === editPlantId ? epots : (x.nb_pots || 0)), 0)
                          const ebenef = brancheParams && ebranches > 0 && epots > 0
                            ? calculerBenefice(epots, ebranches, brancheParams, eTotalPots)
                            : null
                          return (
                            <tr key={p.id} style={{ background: 'rgba(201,168,76,0.04)' }}>
                              <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                                {fmtDateOnly(p.date_plantation)}
                              </td>
                              <td>
                                <input className="form-input" type="number" min="1"
                                  style={{ width: 80, padding: '3px 7px', fontSize: 13 }}
                                  value={editPlantForm.nb_pots}
                                  onChange={e => setEditPlantForm(f => ({ ...f, nb_pots: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Escape') cancelEditPlant() }}
                                  autoFocus />
                              </td>
                              <td>
                                <input className="form-input" type="number" min="1"
                                  style={{ width: 90, padding: '3px 7px', fontSize: 13 }}
                                  value={editPlantForm.nb_branches}
                                  onChange={e => setEditPlantForm(f => ({ ...f, nb_branches: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Escape') cancelEditPlant() }} />
                              </td>
                              <td style={{ fontWeight: 600, color: emoy !== null ? (emoy >= 8 ? '#4caf7d' : emoy === 7 ? '#e8a84c' : '#e05555') : 'var(--texte-soft)' }}>
                                {emoy !== null ? emoy : '—'}
                              </td>
                              <td style={{ color: ebenef !== null ? 'var(--or-pale)' : 'var(--texte-soft)', fontWeight: 600 }}>
                                {ebenef !== null ? fmt(ebenef) : '—'}
                              </td>
                              <td>
                                <input className="form-input" type="text"
                                  style={{ minWidth: 120, padding: '3px 7px', fontSize: 12 }}
                                  placeholder="Note…"
                                  value={editPlantForm.note}
                                  onChange={e => setEditPlantForm(f => ({ ...f, note: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Escape') cancelEditPlant() }} />
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button className="btn btn-solid btn-sm" disabled={savingEditPlant} onClick={handleSavePlant}>{savingEditPlant ? '…' : '✓'}</button>
                                  <button className="btn btn-or btn-sm" onClick={cancelEditPlant}>✕</button>
                                </div>
                              </td>
                            </tr>
                          )
                        }
                        return (
                          <tr key={p.id}>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                              {fmtDateOnly(p.date_plantation)}
                            </td>
                            <td>{p.nb_pots}</td>
                            <td style={{ fontWeight: 600 }}>{p.nb_branches}</td>
                            <td style={{ fontWeight: 600, color: couleur }}>{moy}</td>
                            <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(p.benefice)}</td>
                            <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{p.note || '—'}</td>
                            <td>
                              <button className="btn btn-or btn-sm" onClick={() => startEditPlant(p)} title="Modifier">✎</button>
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

      {/* ── Récap semaine ── */}
      <div className="card">
        <div className="card-title">Récap semaine</div>

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

      {/* ── Fuseau horaire ── */}
      <FuseauHoraire membreId={membre.id} />

      {/* ── Changer mot de passe ── */}
      <div className="card">
        <div className="card-title">Changer mon mot de passe</div>
        {msgMdp.text && (
          <div className={`alert alert-${msgMdp.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
            {msgMdp.text}
          </div>
        )}
        <form onSubmit={handleChangeMdp}>
          <div className="grid-3" style={{ gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Mot de passe actuel</label>
              <input className="form-input" type="password" required
                value={mdpForm.actuel}
                onChange={e => setMdpForm({ ...mdpForm, actuel: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Nouveau mot de passe</label>
              <input className="form-input" type="password" required
                value={mdpForm.nouveau}
                onChange={e => setMdpForm({ ...mdpForm, nouveau: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmer</label>
              <input className="form-input" type="password" required
                value={mdpForm.confirm}
                onChange={e => setMdpForm({ ...mdpForm, confirm: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-or" disabled={savingMdp}>
            {savingMdp ? 'Mise à jour...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}

function FuseauHoraire({ membreId }) {
  const [tz, setTz] = useState(getUserTz())
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const detected = detectTz()

  const handleSave = async (newTz) => {
    setSaving(true); setMsg({ type: '', text: '' })
    try {
      await setUserTz(membreId, newTz)
      setTz(newTz)
      setMsg({ type: 'success', text: 'Fuseau horaire mis à jour.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally { setSaving(false) }
  }

  const now = new Date()
  const apercu = now.toLocaleString('fr-FR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="card">
      <div className="card-title">Fuseau horaire</div>
      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 14 }}>
          {msg.text}
        </div>
      )}
      <div style={{ fontSize: 13, color: 'var(--texte-soft)', marginBottom: 14 }}>
        Toutes les heures saisies sont converties en UTC pour le stockage, puis affichées dans ton fuseau horaire.
        Détecté automatiquement&nbsp;: <span style={{ color: 'var(--or-pale)' }}>{detected}</span>.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ minWidth: 220 }}>
          <label className="form-label">Mon fuseau horaire</label>
          <select className="form-select" value={tz} onChange={e => handleSave(e.target.value)} disabled={saving}>
            {!TZ_LIST.includes(tz) && <option value={tz}>{tz}</option>}
            {TZ_LIST.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        {tz !== detected && (
          <button className="btn btn-or" disabled={saving} onClick={() => handleSave(detected)}>
            Détecter automatiquement
          </button>
        )}
        <div style={{ fontSize: 12, color: 'var(--texte-soft)' }}>
          Heure actuelle : <strong style={{ color: 'var(--or-pale)' }}>{apercu}</strong>
        </div>
      </div>
    </div>
  )
}
