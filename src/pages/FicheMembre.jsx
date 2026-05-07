import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const COOLDOWNS_H = {
  'ATM':         3,
  'Supérette':   2,
  'Go Fast':    24,
  'Cambriolage': 3,
}

const COMMISSION_PCT = 10

function localNow() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function FicheMembre() {
  const [membres, setMembres]     = useState([])
  const [membreId, setMembreId]   = useState('')
  const membre                    = membres.find(m => m.id === membreId) || null

  const [drogues, setDrogues]     = useState([])
  const [activites, setActivites] = useState([])
  const [ventes, setVentes]       = useState([])
  const [commissions, setCommissions] = useState({})
  const [msg, setMsg]             = useState({ type: '', text: '' })

  const [formAct, setFormAct] = useState({
    type_code:         'ATM',
    somme_argent_sale: '',
    note:              '',
    heure_faite:       localNow(),
  })
  const [savingAct, setSavingAct] = useState(false)
  const [lignesVente, setLignesVente] = useState([emptyLigne()])

  function emptyLigne() {
    return { drogue_id: '', quantite: '', prix_total: '', statut: 'Vendu', _id: Math.random() }
  }

  const getDebutSemaine = () => {
    const d = new Date()
    const jour = d.getDay() || 7
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - jour + 1)
    return d
  }

  useEffect(() => {
    supabase.from('membres').select('id, surnom, rang').order('surnom')
      .then(({ data }) => setMembres(data || []))
    supabase.from('drogues').select('*').order('nom')
      .then(({ data }) => setDrogues(data || []))
    supabase.from('parametres').select('*')
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(p => {
          if (p.cle.startsWith('commission_')) map[p.cle.replace('commission_', '')] = Number(p.valeur)
        })
        setCommissions(map)
      })
  }, [])

  useEffect(() => {
    if (!membreId) { setActivites([]); setVentes([]); return }
    fetchActivites()
    fetchVentes()
    setMsg({ type: '', text: '' })
    setFormAct({ type_code: 'ATM', somme_argent_sale: '', note: '', heure_faite: localNow() })
    setLignesVente([emptyLigne()])
  }, [membreId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchActivites = async () => {
    const { data } = await supabase
      .from('activites').select('*').eq('membre_id', membreId)
      .gte('created_at', getDebutSemaine().toISOString())
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

  const localDateStr = (d) => {
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const calcProchainDispo = (heure, type) => {
    const h = COOLDOWNS_H[type] || 0
    const d = new Date(heure)
    d.setHours(d.getHours() + h)
    return localDateStr(d)
  }

  const handleSubmitActivite = async (e) => {
    e.preventDefault()
    if (!membreId) return
    setSavingAct(true)
    setMsg({ type: '', text: '' })
    const heure_faite    = formAct.heure_faite  // heure locale directe
    const prochain_dispo = calcProchainDispo(new Date(heure_faite), formAct.type_code)
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

  const updateLigne = (id, field, value) => {
    setLignesVente(prev => {
      const updated = prev.map(l => l._id === id ? { ...l, [field]: value } : l)
      const last = updated[updated.length - 1]
      if (last.drogue_id) return [...updated, emptyLigne()]
      return updated
    })
  }

  const commissionPct  = membre ? (commissions[membre.rang] ?? COMMISSION_PCT) : COMMISSION_PCT
  const totalAct       = activites.reduce((s, a) => s + (a.somme_argent_sale || 0), 0)
  const totalPrixTotal = ventes.filter(v => v.statut === 'Vendu').reduce((s, v) => s + (v.prix_total || 0), 0)
  const totalBenefice  = ventes.filter(v => v.statut === 'Vendu').reduce((s, v) => s + (v.argent_sale || 0), 0)
  const totalSaisies   = ventes.filter(v => v.statut === 'Saisie').reduce((s, v) => s + Math.abs(v.argent_sale || 0), 0)
  const brut           = totalAct + totalBenefice
  const commission     = totalBenefice * commissionPct / 100
  const net            = brut - commission

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  const fmtDate = (d) =>
    new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

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
              Prise en main · commission {commissionPct}%
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
              <span className="stat-label">Total brut</span>
              <span className="stat-value">{fmt(brut)}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Commission ({commissionPct}%)</span>
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
                      ? fmtDate(calcProchainDispo(new Date(formAct.heure_faite), formAct.type_code))
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
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--texte-soft)', marginBottom: 10 }}>
                  Activités cette semaine
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Type</th><th>Heure</th><th>Prochaine dispo</th><th>Somme</th><th>Note</th></tr></thead>
                    <tbody>
                      {activites.map(a => (
                        <tr key={a.id}>
                          <td>{a.type_code}</td>
                          <td>{fmtDate(a.heure_faite)}</td>
                          <td>{fmtDate(a.prochain_dispo)}</td>
                          <td style={{ color: 'var(--or-pale)' }}>{fmt(a.somme_argent_sale)}</td>
                          <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{a.note || '—'}</td>
                        </tr>
                      ))}
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
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--texte-soft)', marginBottom: 10 }}>
                  Ventes cette semaine
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Drogue</th><th>Qté</th><th>Montant total</th><th>Bénéfice</th><th>Statut</th><th>Date</th></tr></thead>
                    <tbody>
                      {ventes.map(v => (
                        <tr key={v.id}>
                          <td>{v.drogues?.nom || '—'}</td>
                          <td>{v.quantite}</td>
                          <td style={{ color: 'var(--texte-soft)' }}>
                            {v.statut === 'Saisie' ? '—' : fmt(v.prix_total || 0)}
                          </td>
                          <td style={{ color: v.statut === 'Saisie' ? '#e05555' : 'var(--or-pale)' }}>
                            {v.statut === 'Saisie' ? `− ${fmt(Math.abs(v.argent_sale))}` : fmt(v.argent_sale)}
                          </td>
                          <td><span className={`badge ${v.statut === 'Saisie' ? 'badge-rouge' : 'badge-vert'}`}>{v.statut}</span></td>
                          <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmtDate(v.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Récap */}
          <div className="card">
            <div className="card-title">Récap semaine — {membre.surnom}</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Activités</th>
                    <th>Ventes (montant total)</th>
                    <th>Ventes (bénéfice)</th>
                    <th>Pertes (saisies)</th>
                    <th>Total brut</th>
                    <th>Commission {commissionPct}% <span style={{ fontWeight: 400, opacity: 0.7 }}>(sur bénéf.)</span></th>
                    <th>Total NET</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ color: 'var(--or-pale)' }}>{fmt(totalAct)}</td>
                    <td style={{ color: 'var(--texte-soft)' }}>{fmt(totalPrixTotal)}</td>
                    <td style={{ color: 'var(--or-pale)' }}>{fmt(totalBenefice)}</td>
                    <td style={{ color: '#e05555' }}>− {fmt(totalSaisies)}</td>
                    <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(brut)}</td>
                    <td style={{ color: '#e8a84c' }}>− {fmt(commission)}</td>
                    <td style={{ color: 'var(--or)', fontWeight: 600, fontSize: 15, fontFamily: 'var(--font-corps)' }}>{fmt(net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
