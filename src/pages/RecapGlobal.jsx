import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { chargerParamsCommission, calculerCommission } from '../utils/commission'

// ── Helpers ────────────────────────────────────────────────────────────────

function debutSemaineDate(date) {
  const d = new Date(date)
  const dow = d.getDay() || 7
  d.setDate(d.getDate() - (dow - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function toLocalStr(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function genererSemaines() {
  const now   = new Date()
  const lundi = debutSemaineDate(now)
  const semaines = []

  for (let i = 0; i < 13; i++) {
    const debut = new Date(lundi)
    debut.setDate(debut.getDate() - i * 7)
    const fin = new Date(debut)
    fin.setDate(fin.getDate() + 7)

    const num  = getWeekNumber(debut)
    const fmtD = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
    const label = i === 0
      ? `Semaine en cours (S${num} — ${fmtD(debut)} au ${fmtD(new Date(fin.getTime() - 1))})`
      : `S${num} — ${fmtD(debut)} au ${fmtD(new Date(fin.getTime() - 1))}`

    semaines.push({ label, debutLocal: toLocalStr(debut), debutUTC: debut, finUTC: fin })
  }
  return semaines
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

const fmt = (v) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

function StatCard({ label, value, accent }) {
  return (
    <div className="stat-box">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color: accent || 'var(--or-pale)' }}>
        {value}
      </span>
    </div>
  )
}

// ── Composant principal ────────────────────────────────────────────────────

export default function RecapGlobal() {
  const semaines = useRef(genererSemaines()).current

  const [semaineIdx, setSemaineIdx]           = useState(0)
  const [recaps, setRecaps]                   = useState([])
  const [totaux, setTotaux]                   = useState(null)
  const [sortKey, setSortKey]                 = useState('salaireNet')
  const [sortDir, setSortDir]                 = useState('desc')
  const [loading, setLoading]                 = useState(true)
  const [historiquePlants, setHistoriquePlants] = useState([])

  useEffect(() => {
    fetchAll(semaines[semaineIdx])
  }, [semaineIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async (sem) => {
    setLoading(true)

    const [commissionParams, { data: membresData }, { data: activitesData }, { data: ventesData }, { data: plantationsData }] = await Promise.all([
      chargerParamsCommission(),
      supabase.from('membres').select('id, surnom, rang').order('surnom'),
      supabase.from('activites').select('membre_id, somme_argent_sale, type_code')
        .gte('heure_faite', sem.debutLocal).lt('heure_faite', toLocalStr(sem.finUTC)),
      supabase.from('ventes_drogue').select('membre_id, argent_sale, prix_total, statut, quantite, drogue_id')
        .gte('created_at', sem.debutUTC.toISOString()).lt('created_at', sem.finUTC.toISOString()),
      supabase.from('plantations').select('membre_id, benefice, nb_branches')
        .gte('date_plantation', sem.debutLocal).lt('date_plantation', toLocalStr(sem.finUTC)),
    ])

    const result = (membresData || []).map(m => {
      const acts   = (activitesData   || []).filter(a => a.membre_id === m.id)
      const ventes = (ventesData      || []).filter(v => v.membre_id === m.id)
      const plants = (plantationsData || []).filter(p => p.membre_id === m.id)
      const calc   = calculerCommission(acts, ventes, m.rang, commissionParams, plants)

      const { totalActBrut, cambriolageTotal, totalBenefice, totalPlantations, commission_pct, commission, net } = calc
      const nbBranches = plants.reduce((s, p) => s + (p.nb_branches || 0), 0)
      const nbUnites   = ventes.filter(v => v.statut === 'Vendu').reduce((s, v) => s + (v.quantite || 0), 0)
      const quotaOk    = acts.length >= 20 && nbBranches >= 2000 && nbUnites >= 300
      const salaireNet = net * 0.65

      return {
        ...m,
        totalAct: totalActBrut,
        cambriolageTotal,
        totalBenefice,
        totalPlantations,
        commission_pct,
        commission,
        net,
        salaireNet,
        nbActivites: acts.length,
        nbBranches,
        nbUnites,
        quotaOk,
      }
    })

    const t = result.reduce((acc, r) => ({
      totalAct:         acc.totalAct         + r.totalAct,
      cambriolageTotal: acc.cambriolageTotal  + r.cambriolageTotal,
      totalBenefice:    acc.totalBenefice    + r.totalBenefice,
      totalPlantations: acc.totalPlantations + r.totalPlantations,
      commission:       acc.commission       + r.commission,
      net:              acc.net              + r.net,
      salaireNet:       acc.salaireNet       + r.salaireNet,
    }), { totalAct: 0, cambriolageTotal: 0, totalBenefice: 0, totalPlantations: 0, commission: 0, net: 0, salaireNet: 0 })

    setRecaps(result)
    setTotaux(t)

    const { data: histPlants } = await supabase
      .from('plantations')
      .select('*, membres(surnom)')
      .gte('date_plantation', sem.debutLocal)
      .lt('date_plantation', toLocalStr(sem.finUTC))
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

  const SortTh = ({ label, k }) => (
    <th onClick={() => handleSort(k)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── En-tête ── */}
      <div className="no-print">
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Finances
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Comptabilité
        </h1>
      </div>

      {/* ── Sélecteur semaine + PDF ── */}
      <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="form-select"
          style={{ minWidth: 320 }}
          value={semaineIdx}
          onChange={e => setSemaineIdx(Number(e.target.value))}>
          {semaines.map((s, i) => (
            <option key={i} value={i}>{s.label}</option>
          ))}
        </select>
        <button className="btn btn-or" onClick={() => window.print()} disabled={loading}>
          ◈ Exporter PDF
        </button>
      </div>

      {loading ? (
        <div className="loading-screen"><div className="spinner" /></div>
      ) : totaux && (
        <div className="print-zone">

          {/* ── En-tête visible uniquement à l'impression ── */}
          <div className="print-header">
            <div style={{ fontFamily: 'var(--font-titre)', fontSize: 18, color: 'var(--or-pale)', letterSpacing: '0.1em', marginBottom: 3 }}>
              Syndicat des Murmures
            </div>
            <div style={{ fontSize: 12, color: 'var(--texte-soft)' }}>
              Comptabilité — {semaines[semaineIdx].label}
            </div>
          </div>

        <>
          {/* ── Stat boxes ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatCard label="Activités (hors camb.)"  value={fmt(totaux.totalAct)} />
            <StatCard label="Cambriolages (direct)"   value={fmt(totaux.cambriolageTotal)} />
            <StatCard label="Ventes — bénéfice"       value={fmt(totaux.totalBenefice)} />
            <StatCard label="Plantations — bénéfice"  value={fmt(totaux.totalPlantations)} />
            <StatCard label="Commission totale"       value={fmt(totaux.commission)}  accent="#e8a84c" />
            <StatCard label="Total NET gang"          value={fmt(totaux.net)}         accent="var(--or)" />
            <StatCard label="Salaire net gang (−35%)" value={fmt(totaux.salaireNet)}  accent="#5cba8a" />
            <StatCard label="Membres actifs"          value={recaps.filter(r => r.nbActivites > 0).length} />
          </div>

          {/* ── Tableau détail ── */}
          <div className="card">
            <div className="card-title">Détail par membre</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <SortTh label="Joueur"             k="surnom" />
                    <SortTh label="Rang"               k="rang" />
                    <SortTh label="Activités $"        k="totalAct" />
                    <SortTh label="Ventes (bénéf.)"    k="totalBenefice" />
                    <SortTh label="Plantations"        k="totalPlantations" />
                    <SortTh label="Commission"         k="commission" />
                    <SortTh label="Nb activités"       k="nbActivites" />
                    <SortTh label="nb Branches" k="nbBranches" />
                    <SortTh label="nb Drogues"  k="nbUnites" />
                    <SortTh label="Quota"              k="quotaOk" />
                    <SortTh label="Salaire net"        k="salaireNet" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.surnom}</td>
                      <td>
                        <span
                          className={`badge ${r.rang === 'direction' ? 'badge-or' : r.rang === 'responsable' ? 'badge-bleu' : 'badge-gris'}`}
                          style={r.rang === 'direction' ? { background: 'var(--or-glow)', color: 'var(--or)', border: '1px solid var(--or-border)' } : {}}>
                          {r.rang}
                        </span>
                      </td>
                      <td>{fmt(r.totalAct)}</td>
                      <td>{fmt(r.totalBenefice)}</td>
                      <td style={{ color: r.totalPlantations > 0 ? 'var(--or-pale)' : 'var(--texte-soft)' }}>
                        {fmt(r.totalPlantations)}
                      </td>
                      <td style={{ color: '#e8a84c' }}>
                        − {fmt(r.commission)}
                        <span style={{ fontSize: 10, opacity: 0.7 }}> ({r.commission_pct.toFixed(1)}%)</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{r.nbActivites}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>
                        {r.nbBranches.toLocaleString('fr-FR')}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>
                        {r.nbUnites.toLocaleString('fr-FR')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                            background: r.quotaOk ? '#4caf7d' : '#e05555',
                          }}
                          title={r.quotaOk
                            ? '✓ Quota réalisé (20 actions, 2 000 branches, 300 unités)'
                            : '✗ Quota non réalisé (20 actions, 2 000 branches, 300 unités)'}
                        />
                      </td>
                      <td style={{ color: '#5cba8a', fontWeight: 700, fontFamily: 'var(--font-corps)', fontSize: 15 }}>
                        {fmt(r.salaireNet)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--or-border)' }}>
                    <td colSpan={2} style={{ color: 'var(--or)', fontWeight: 600, padding: '12px 14px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Totaux
                    </td>
                    <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(totaux.totalAct)}</td>
                    <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(totaux.totalBenefice)}</td>
                    <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(totaux.totalPlantations)}</td>
                    <td style={{ color: '#e8a84c',       fontWeight: 600 }}>− {fmt(totaux.commission)}</td>
                    <td style={{ textAlign: 'center', color: 'var(--or-pale)', fontWeight: 600 }}>
                      {recaps.reduce((s, r) => s + r.nbActivites, 0).toLocaleString('fr-FR')}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--or-pale)', fontWeight: 600 }}>
                      {recaps.reduce((s, r) => s + r.nbBranches, 0).toLocaleString('fr-FR')}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--or-pale)', fontWeight: 600 }}>
                      {recaps.reduce((s, r) => s + r.nbUnites, 0).toLocaleString('fr-FR')}
                    </td>
                    <td />
                    <td style={{ color: '#5cba8a', fontWeight: 700, fontFamily: 'var(--font-corps)', fontSize: 16 }}>
                      {fmt(totaux.salaireNet)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Note de bas de page (impression uniquement) ── */}
          <div className="print-footer" style={{ marginTop: 20, fontSize: 10, color: 'var(--texte-soft)', textAlign: 'center' }}>
            Document généré le {new Date().toLocaleString('fr-FR')} · Syndicat des Murmures
          </div>

          {/* ── Historique récoltes ── */}
          {historiquePlants.length > 0 && (
            <div className="card">
              <div className="card-title">Historique des récoltes — {semaines[semaineIdx].label}</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Membre</th>
                      <th style={{ textAlign: 'center' }}>Pots</th>
                      <th style={{ textAlign: 'center' }}>Branches</th>
                      <th style={{ textAlign: 'center' }}>Moy./pot</th>
                      <th>Bénéfice</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historiquePlants.map(p => (
                      <tr key={p.id}>
                        <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                          {new Date(p.date_plantation).toLocaleString('fr-FR', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td style={{ fontWeight: 500 }}>{p.membres?.surnom || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{(p.nb_pots || 0).toLocaleString('fr-FR')}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          {(p.nb_branches || 0).toLocaleString('fr-FR')}
                        </td>
                        <td style={{
                          textAlign: 'center', fontWeight: 600,
                          color: !p.branches_par_pot
                            ? 'var(--texte-soft)'
                            : p.branches_par_pot >= 8 ? '#5cba8a'
                            : p.branches_par_pot === 7 ? '#e8a84c'
                            : '#e05555',
                        }}>
                          {p.branches_par_pot || '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: (p.benefice || 0) >= 0 ? '#5cba8a' : '#e05555' }}>
                          {fmt(p.benefice || 0)}
                        </td>
                        <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{p.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
        </div>
      )}
    </div>
  )
}
