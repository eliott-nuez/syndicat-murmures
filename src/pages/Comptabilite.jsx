import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { chargerParamsCommission, calculerCommission } from '../utils/commission'

// Calcule le lundi de la semaine ISO contenant `date`
function debutSemaineDate(date) {
  const d = new Date(date)
  const dow = d.getDay() || 7
  d.setDate(d.getDate() - (dow - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

// Retourne "YYYY-MM-DDTHH:MM:SS" pour un Date JS (heure locale naïve)
function toLocalStr(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Construit la liste des 13 dernières semaines (semaine en cours + 12 précédentes)
// Chaque entrée: { label: "S19 — 05/05 au 11/05", debutLocal: "2026-05-04T00:00:00", debutUTC: Date, finUTC: Date }
function genererSemaines() {
  const now = new Date()
  const lundi = debutSemaineDate(now)
  const semaines = []

  for (let i = 0; i < 13; i++) {
    const debut = new Date(lundi)
    debut.setDate(debut.getDate() - i * 7)
    const fin = new Date(debut)
    fin.setDate(fin.getDate() + 7)

    const num = getWeekNumber(debut)
    const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
    const label = i === 0
      ? `Semaine en cours (S${num} — ${fmt(debut)} au ${fmt(new Date(fin.getTime() - 1))})`
      : `S${num} — ${fmt(debut)} au ${fmt(new Date(fin.getTime() - 1))}`

    semaines.push({
      label,
      debutLocal: toLocalStr(debut),
      debutUTC: debut,
      finUTC: fin,
    })
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

export default function Comptabilite() {
  const semaines = useRef(genererSemaines()).current
  const [semaineIdx, setSemaineIdx] = useState(0)
  const [donnees, setDonnees] = useState(null)
  const [loading, setLoading] = useState(false)
  const printRef = useRef()

  useEffect(() => {
    charger(semaines[semaineIdx])
  }, [semaineIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const charger = async (sem) => {
    setLoading(true)
    setDonnees(null)

    const [commParams, { data: membres }, { data: activites }, { data: ventes }, { data: plantationsData }] = await Promise.all([
      chargerParamsCommission(),
      supabase.from('membres').select('id, surnom, rang').order('surnom'),
      supabase.from('activites').select('membre_id, somme_argent_sale, type_code').gte('heure_faite', sem.debutLocal).lt('heure_faite', toLocalStr(sem.finUTC)),
      supabase.from('ventes_drogue').select('membre_id, argent_sale, prix_total, statut').gte('created_at', sem.debutUTC.toISOString()).lt('created_at', sem.finUTC.toISOString()),
      supabase.from('plantations').select('membre_id, benefice').gte('date_plantation', sem.debutLocal).lt('date_plantation', toLocalStr(sem.finUTC)),
    ])

    const lignes = (membres || []).map(m => {
      const acts = (activites       || []).filter(a => a.membre_id === m.id)
      const vts  = (ventes          || []).filter(v => v.membre_id === m.id)
      const ps   = (plantationsData || []).filter(p => p.membre_id === m.id)
      const c    = calculerCommission(acts, vts, m.rang, commParams, ps)
      return {
        ...m,
        nbActivites: acts.length,
        totalActBrut:      c.totalActBrut,
        cambriolageTotal:  c.cambriolageTotal,
        deductionBoitiers: c.deductionBoitiers,
        totalActNet:       c.totalActNet,
        nbATM:             c.nbATM,
        totalPrixTotal:    c.totalPrixTotal,
        totalBenefice:     c.totalBenefice,
        totalSaisies:      c.totalSaisies,
        totalPlantations:  c.totalPlantations,
        base:              c.base,
        multiplicateur:    c.multiplicateur,
        commission_pct:    c.commission_pct,
        commission:        c.commission,
        net:               c.net,
        boitierCout:       c.boitierCout,
      }
    })

    const totaux = lignes.reduce((acc, r) => ({
      nbActivites:       acc.nbActivites       + r.nbActivites,
      totalActBrut:      acc.totalActBrut      + r.totalActBrut,
      cambriolageTotal:  acc.cambriolageTotal  + r.cambriolageTotal,
      deductionBoitiers: acc.deductionBoitiers + r.deductionBoitiers,
      totalActNet:       acc.totalActNet       + r.totalActNet,
      totalPrixTotal:    acc.totalPrixTotal    + r.totalPrixTotal,
      totalBenefice:     acc.totalBenefice     + r.totalBenefice,
      totalSaisies:      acc.totalSaisies      + r.totalSaisies,
      totalPlantations:  acc.totalPlantations  + r.totalPlantations,
      base:              acc.base              + r.base,
      commission:        acc.commission        + r.commission,
      net:               acc.net               + r.net,
      cambriolageBonus:  acc.cambriolageBonus  + r.cambriolageTotal,
    }), {
      nbActivites: 0, totalActBrut: 0, cambriolageTotal: 0, deductionBoitiers: 0,
      totalActNet: 0, totalPrixTotal: 0, totalBenefice: 0, totalSaisies: 0, totalPlantations: 0,
      base: 0, commission: 0, net: 0, cambriolageBonus: 0,
    })

    setDonnees({ lignes, totaux, semaine: sem, commParams })
    setLoading(false)
  }

  const handlePrint = () => window.print()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* En-tête (masquée à l'impression) */}
      <div className="no-print">
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Finances
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Comptabilité
        </h1>
      </div>

      {/* Sélecteur semaine + bouton imprimer */}
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
        <button className="btn btn-or" onClick={handlePrint} disabled={!donnees}>
          ◈ Exporter PDF
        </button>
      </div>

      {loading && <div className="loading-screen"><div className="spinner" /></div>}

      {donnees && (
        <div ref={printRef} className="print-zone">
          {/* En-tête d'impression */}
          <div className="print-header">
            <div style={{ fontFamily: 'var(--font-titre)', fontSize: 20, color: 'var(--or-pale)', letterSpacing: '0.1em', marginBottom: 4 }}>
              Syndicat des Murmures
            </div>
            <div style={{ fontSize: 13, color: 'var(--texte-soft)' }}>
              Comptabilité — {donnees.semaine.label}
            </div>
          </div>

          {/* Stats résumé */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <StatCard label="Activités (hors camb.)" value={fmt(donnees.totaux.totalActBrut)} />
            <StatCard label="Cambriolages (direct)" value={fmt(donnees.totaux.cambriolageTotal)} />
            <StatCard label="Ventes — bénéfice" value={fmt(donnees.totaux.totalBenefice)} />
            <StatCard label="Plantations — bénéfice" value={fmt(donnees.totaux.totalPlantations)} />
            <StatCard label="Base commission totale" value={fmt(donnees.totaux.base)} />
            <StatCard label="Commission totale" value={fmt(donnees.totaux.commission)} accent="#e8a84c" />
            <StatCard label="Boitiers ATM déduits" value={fmt(donnees.totaux.deductionBoitiers)} accent="#e05555" />
            <StatCard label="Total NET gang" value={fmt(donnees.totaux.net + donnees.totaux.cambriolageTotal)} accent="var(--or)" big />
          </div>

          {/* Table principale */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Détail par membre</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Membre</th>
                    <th>Rang</th>
                    <th style={{ textAlign: 'center' }}>Acts</th>
                    <th>Act. $</th>
                    <th>Cambriolage</th>
                    <th>Boitiers</th>
                    <th>Ventes total</th>
                    <th>Ventes bénéf.</th>
                    <th>Plantations</th>
                    <th>Base comm.</th>
                    <th>Taux</th>
                    <th>Commission</th>
                    <th style={{ color: 'var(--or)' }}>NET</th>
                  </tr>
                </thead>
                <tbody>
                  {donnees.lignes.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.surnom}</td>
                      <td>
                        <span className={`badge ${r.rang === 'direction' ? 'badge-or' : r.rang === 'responsable' ? 'badge-bleu' : 'badge-gris'}`}
                          style={r.rang === 'direction' ? { background: 'var(--or-glow)', color: 'var(--or)', border: '1px solid var(--or-border)' } : {}}>
                          {r.rang}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{r.nbActivites}</td>
                      <td>{fmt(r.totalActBrut)}</td>
                      <td style={{ color: 'var(--texte-soft)' }}>{r.cambriolageTotal > 0 ? fmt(r.cambriolageTotal) : '—'}</td>
                      <td style={{ color: r.nbATM > 0 ? '#e05555' : 'var(--texte-soft)' }}>
                        {r.nbATM > 0 ? `− ${fmt(r.deductionBoitiers)}` : '—'}
                      </td>
                      <td style={{ color: 'var(--texte-soft)' }}>{fmt(r.totalPrixTotal)}</td>
                      <td>{fmt(r.totalBenefice)}</td>
                      <td style={{ color: r.totalPlantations > 0 ? '#5cba8a' : 'var(--texte-soft)' }}>
                        {r.totalPlantations > 0 ? fmt(r.totalPlantations) : '—'}
                      </td>
                      <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(r.base)}</td>
                      <td style={{ fontSize: 12 }}>{r.commission_pct.toFixed(1)}%</td>
                      <td style={{ color: '#e8a84c' }}>− {fmt(r.commission)}</td>
                      <td style={{ color: 'var(--or)', fontWeight: 700, fontFamily: 'var(--font-corps)', fontSize: 14 }}>
                        {fmt(r.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--or-border)' }}>
                    <td colSpan={3} style={{ color: 'var(--or)', fontWeight: 600, padding: '12px 14px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Totaux
                    </td>
                    <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(donnees.totaux.totalActBrut)}</td>
                    <td style={{ color: 'var(--texte-soft)', fontWeight: 600 }}>{fmt(donnees.totaux.cambriolageTotal)}</td>
                    <td style={{ color: '#e05555', fontWeight: 600 }}>− {fmt(donnees.totaux.deductionBoitiers)}</td>
                    <td style={{ color: 'var(--texte-soft)', fontWeight: 600 }}>{fmt(donnees.totaux.totalPrixTotal)}</td>
                    <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(donnees.totaux.totalBenefice)}</td>
                    <td style={{ color: '#5cba8a', fontWeight: 600 }}>{fmt(donnees.totaux.totalPlantations)}</td>
                    <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(donnees.totaux.base)}</td>
                    <td></td>
                    <td style={{ color: '#e8a84c', fontWeight: 600 }}>− {fmt(donnees.totaux.commission)}</td>
                    <td style={{ color: 'var(--or)', fontWeight: 700, fontFamily: 'var(--font-corps)', fontSize: 15 }}>
                      {fmt(donnees.totaux.net)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Note de bas de page */}
          <div style={{ marginTop: 20, fontSize: 11, color: 'var(--texte-soft)', textAlign: 'center' }}>
            Document généré le {new Date().toLocaleString('fr-FR')} · Syndicat des Murmures
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, accent, big }) {
  return (
    <div className="stat-box" style={big ? { gridColumn: 'span 1' } : {}}>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color: accent || 'var(--or-pale)', fontSize: big ? 22 : undefined }}>
        {value}
      </span>
    </div>
  )
}
