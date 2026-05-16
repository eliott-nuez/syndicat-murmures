import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getDebutSemaine, getDebutSemaineStr } from '../utils/temps'
import { chargerParamsCommission, calculerCommission } from '../utils/commission'

export default function RecapGlobal() {
  const [recaps, setRecaps]             = useState([])
  const [sortKey, setSortKey]           = useState('net')
  const [sortDir, setSortDir]           = useState('desc')
  const [loading, setLoading]           = useState(true)
  const [historiquePlants, setHistoriquePlants] = useState([])

  useEffect(() => {
    fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    setLoading(true)
    const debutStr = getDebutSemaineStr()
    const debutUTC = getDebutSemaine()

    const [commissionParams, { data: membresData }, { data: activitesData }, { data: ventesData }, { data: plantationsData }] = await Promise.all([
      chargerParamsCommission(),
      supabase.from('membres').select('id, surnom, rang').order('surnom'),
      supabase.from('activites').select('membre_id, somme_argent_sale, type_code').gte('heure_faite', debutStr),
      supabase.from('ventes_drogue').select('membre_id, argent_sale, prix_total, statut, quantite, drogue_id').gte('created_at', debutUTC.toISOString()),
      supabase.from('plantations').select('membre_id, benefice, nb_branches').gte('date_plantation', debutStr),
    ])

    const result = (membresData || []).map(m => {
      const acts   = (activitesData   || []).filter(a => a.membre_id === m.id)
      const ventes = (ventesData      || []).filter(v => v.membre_id === m.id)
      const plants = (plantationsData || []).filter(p => p.membre_id === m.id)
      const calc   = calculerCommission(acts, ventes, m.rang, commissionParams, plants)
      const { totalActBrut, cambriolageTotal, totalPrixTotal, totalBenefice, totalPlantations, base, commission_pct, commission, net } = calc
      const nbBranches = plants.reduce((s, p) => s + (p.nb_branches || 0), 0)
      const nbUnites   = ventes.filter(v => v.statut === 'Vendu').reduce((s, v) => s + (v.quantite || 0), 0)
      const quotaOk    = acts.length >= 20 && nbBranches >= 2000 && nbUnites >= 300

      return {
        ...m,
        totalAct: totalActBrut,
        cambriolageTotal,
        totalPrixTotal,
        totalBenefice,
        totalPlantations,
        brut: totalActBrut + cambriolageTotal + totalBenefice + totalPlantations,
        base,
        commission_pct,
        commission,
        net,
        nbActivites: acts.length,
        nbBranches,
        nbUnites,
        quotaOk,
      }
    })

    setRecaps(result)

    const { data: histPlants } = await supabase.from('plantations')
      .select('*, membres(surnom)')
      .gte('date_plantation', debutStr)
      .order('date_plantation', { ascending: false })
    setHistoriquePlants(histPlants || [])

    setLoading(false)
  }

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...recaps].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey]
    if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va
    return sortDir === 'asc'
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va))
  })

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  const SortTh = ({ label, k }) => (
    <th onClick={() => handleSort(k)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  const totaux = recaps.reduce((acc, r) => ({
    totalAct:         acc.totalAct         + r.totalAct,
    cambriolageTotal: acc.cambriolageTotal  + r.cambriolageTotal,
    totalPrixTotal:   acc.totalPrixTotal   + r.totalPrixTotal,
    totalBenefice:    acc.totalBenefice    + r.totalBenefice,
    totalPlantations: acc.totalPlantations + r.totalPlantations,
    brut:             acc.brut             + r.brut,
    base:             acc.base             + r.base,
    commission:       acc.commission       + r.commission,
    net:              acc.net              + r.net,
  }), { totalAct: 0, cambriolageTotal: 0, totalPrixTotal: 0, totalBenefice: 0, totalPlantations: 0, brut: 0, base: 0, commission: 0, net: 0 })

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Vue globale
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Récap semaine — Tous les membres
        </h1>
      </div>

      {/* Totaux */}
      <div className="grid-4">
        <div className="stat-box">
          <span className="stat-label">Total brut gang</span>
          <span className="stat-value">{fmt(totaux.brut)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Activités (hors cambriolage)</span>
          <span className="stat-value">{fmt(totaux.totalAct)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Ventes (bénéfice)</span>
          <span className="stat-value">{fmt(totaux.totalBenefice)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Total NET gang</span>
          <span className="stat-value" style={{ color: 'var(--or)' }}>{fmt(totaux.net)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-title">Détail par membre</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh label="Joueur"            k="surnom" />
                <SortTh label="Rang"              k="rang" />
                <SortTh label="Nb activités"      k="nbActivites" />
                <SortTh label="Activités $"       k="totalAct" />
                <SortTh label="Cambriolage"       k="cambriolageTotal" />
                <SortTh label="Ventes (bénéf.)"   k="totalBenefice" />
                <SortTh label="Plantations"       k="totalPlantations" />
                <SortTh label="Base commission"   k="base" />
                <SortTh label="Commission"        k="commission" />
                <SortTh label="Branches récoltées" k="nbBranches" />
                <SortTh label="Unités vendues"     k="nbUnites" />
                <th>Quota</th>
                <SortTh label="Total NET"         k="net" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.surnom}</td>
                  <td>
                    <span className={`badge ${r.rang === 'direction' ? 'badge-or' : r.rang === 'responsable' ? 'badge-bleu' : 'badge-gris'}`}
                      style={r.rang === 'direction' ? { background: 'var(--or-glow)', color: 'var(--or)', border: '1px solid var(--or-border)' } : {}}>
                      {r.rang}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.nbActivites}</td>
                  <td>{fmt(r.totalAct)}</td>
                  <td style={{ color: 'var(--texte-soft)' }}>{fmt(r.cambriolageTotal)}</td>
                  <td>{fmt(r.totalBenefice)}</td>
                  <td style={{ color: r.totalPlantations > 0 ? 'var(--or-pale)' : 'var(--texte-soft)' }}>{fmt(r.totalPlantations)}</td>
                  <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(r.base)}</td>
                  <td style={{ color: '#e8a84c' }}>− {fmt(r.commission)} <span style={{ fontSize: 10, opacity: 0.7 }}>({r.commission_pct.toFixed(1)}%)</span></td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.nbBranches.toLocaleString('fr-FR')}</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.nbUnites.toLocaleString('fr-FR')}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                      background: r.quotaOk ? '#4caf7d' : '#e05555',
                    }} title={r.quotaOk ? '✓ Quota réalisé (20 actions, 2000 branches, 300 unités)' : '✗ Quota non réalisé'} />
                  </td>
                  <td style={{ color: 'var(--or)', fontWeight: 600, fontFamily: 'var(--font-corps)', fontSize: 15 }}>
                    {fmt(r.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Ligne totaux */}
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--or-border)' }}>
                <td colSpan={3} style={{ color: 'var(--or)', fontWeight: 600, padding: '12px 14px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Totaux
                </td>
                <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(totaux.totalAct)}</td>
                <td style={{ color: 'var(--texte-soft)', fontWeight: 600 }}>{fmt(totaux.cambriolageTotal)}</td>
                <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(totaux.totalBenefice)}</td>
                <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(totaux.totalPlantations)}</td>
                <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(totaux.base)}</td>
                <td style={{ color: '#e8a84c', fontWeight: 600 }}>− {fmt(totaux.commission)}</td>
                <td style={{ textAlign: 'center', color: 'var(--or-pale)', fontWeight: 600 }}>
                  {recaps.reduce((s,r)=>s+r.nbBranches,0).toLocaleString('fr-FR')}
                </td>
                <td style={{ textAlign: 'center', color: 'var(--or-pale)', fontWeight: 600 }}>
                  {recaps.reduce((s,r)=>s+r.nbUnites,0).toLocaleString('fr-FR')}
                </td>
                <td></td>
                <td style={{ color: 'var(--or)', fontWeight: 700, fontFamily: 'var(--font-corps)', fontSize: 16 }}>
                  {fmt(totaux.net)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {historiquePlants.length > 0 && (
        <div className="card">
          <div className="card-title">Historique des récoltes — semaine en cours</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Membre</th>
                  <th style={{ textAlign: 'center' }}>Pots</th>
                  <th style={{ textAlign: 'center' }}>Branches</th>
                  <th style={{ textAlign: 'center' }}>Moy./pot</th>
                  <th>Bénéfice</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {historiquePlants.map(p => (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                      {new Date(p.date_plantation).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td style={{ fontWeight: 500 }}>{p.membres?.surnom || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{(p.nb_pots||0).toLocaleString('fr-FR')}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{(p.nb_branches||0).toLocaleString('fr-FR')}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: !p.branches_par_pot ? 'var(--texte-soft)' : p.branches_par_pot>=8 ? '#5cba8a' : p.branches_par_pot===7 ? '#e8a84c' : '#e05555' }}>
                      {p.branches_par_pot || '—'}
                    </td>
                    <td style={{ fontWeight: 600, color: (p.benefice||0) >= 0 ? '#5cba8a' : '#e05555' }}>{fmt(p.benefice||0)}</td>
                    <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{p.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
