import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const COMMISSION_PCT = 10 // ⚠️ À adapter si besoin

export default function RecapGlobal() {
  const [recaps, setRecaps]     = useState([])
  const [sortKey, setSortKey]   = useState('net')
  const [sortDir, setSortDir]   = useState('desc')
  const [loading, setLoading]   = useState(true)

  const getDebutSemaine = () => {
    const d = new Date()
    const jour = d.getDay() || 7
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - jour + 1)
    return d
  }

  useEffect(() => {
    fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    setLoading(true)
    const debut = getDebutSemaine()

    const { data: membresData } = await supabase
      .from('membres')
      .select('id, surnom, rang')
      .order('surnom')

    const { data: activitesData } = await supabase
      .from('activites')
      .select('membre_id, somme_argent_sale')
      .gte('created_at', debut.toISOString())

    const { data: ventesData } = await supabase
      .from('ventes_drogue')
      .select('membre_id, argent_sale, statut, quantite, drogue_id')
      .gte('created_at', debut.toISOString())

    const result = (membresData || []).map(m => {
      const acts   = (activitesData || []).filter(a => a.membre_id === m.id)
      const ventes = (ventesData    || []).filter(v => v.membre_id === m.id)

      const totalAct    = acts.reduce((s, a) => s + (a.somme_argent_sale || 0), 0)
      const totalVentes = ventes.filter(v => v.statut === 'Vendu').reduce((s, v) => s + (v.argent_sale || 0), 0)
      const brut        = totalAct + totalVentes
      const commission  = totalVentes * COMMISSION_PCT / 100
      const net         = brut - commission

      return { ...m, totalAct, totalVentes, brut, commission, net, nbActivites: acts.length }
    })

    setRecaps(result)
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
    totalAct:    acc.totalAct    + r.totalAct,
    totalVentes: acc.totalVentes + r.totalVentes,
    brut:        acc.brut        + r.brut,
    commission:  acc.commission  + r.commission,
    net:         acc.net         + r.net,
  }), { totalAct: 0, totalVentes: 0, brut: 0, commission: 0, net: 0 })

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
          <span className="stat-label">Activités</span>
          <span className="stat-value">{fmt(totaux.totalAct)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Ventes</span>
          <span className="stat-value">{fmt(totaux.totalVentes)}</span>
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
                <SortTh label="Joueur"      k="surnom" />
                <SortTh label="Rang"        k="rang" />
                <SortTh label="Nb activités" k="nbActivites" />
                <SortTh label="Activités $"  k="totalAct" />
                <SortTh label="Ventes $"     k="totalVentes" />
                <SortTh label="Total brut"   k="brut" />
                <SortTh label="Commission"   k="commission" />
                <SortTh label="Total NET"    k="net" />
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
                  <td>{fmt(r.totalVentes)}</td>
                  <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(r.brut)}</td>
                  <td style={{ color: '#e8a84c' }}>− {fmt(r.commission)}</td>
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
                <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(totaux.totalVentes)}</td>
                <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(totaux.brut)}</td>
                <td style={{ color: '#e8a84c', fontWeight: 600 }}>− {fmt(totaux.commission)}</td>
                <td style={{ color: 'var(--or)', fontWeight: 700, fontFamily: 'var(--font-corps)', fontSize: 16 }}>
                  {fmt(totaux.net)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
