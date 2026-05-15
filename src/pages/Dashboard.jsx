import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getDebutSemaine, getDebutSemaineStr } from '../utils/temps'
import { chargerParamsCommission, calculerCommission } from '../utils/commission'

// Types d'activites avec leurs cooldowns (en heures)
// Modifier ici si les cooldowns changent
const COOLDOWNS = {
  'ATM':         3,
  'Supérette':   2,
  'Go Fast':    24,
  'Cambriolage': 3,
}

// Labels affichés
const LABELS = {
  'ATM':         'ATM',
  'Supérette':   'Supérette',
  'Go Fast':     'Go Fast',
  'Cambriolage': 'Cambriolage',
}

// Normalise les timestamps Supabase "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS" (heure locale)
function parseTS(str) {
  if (!str) return null
  return new Date(typeof str === 'string' ? str.replace(' ', 'T') : str)
}

// Retourne { dispo: true } ou { dispo: false, label: "2h 34m" }
function getDispoStatus(prochainDispo) {
  if (!prochainDispo) return { dispo: true, jamaisFait: true }
  const diff = parseTS(prochainDispo) - new Date()
  if (diff <= 0) return { dispo: true }
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const label = h > 0
    ? `${h}h ${m.toString().padStart(2, '0')}m`
    : `${m}m`
  return { dispo: false, label }
}

export default function Dashboard() {
  const membre      = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const isDirection = membre.rang === 'direction'

  const [dispos, setDispos]         = useState({})
  const [totauxGang, setTotauxGang] = useState(null)
  const [connectes, setConnectes]   = useState('—')
  const [loading, setLoading]       = useState(true)
  // now sert à forcer le re-render toutes les minutes pour rafraichir les timers
  const [, setNow]                  = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true)

    // Derniere activite par type pour ce membre
    const types = Object.keys(COOLDOWNS)
    const dispoMap = {}

    for (const type of types) {
      const { data } = await supabase
        .from('activites')
        .select('heure_faite, prochain_dispo')
        .eq('membre_id', membre.id)
        .eq('type_code', type)
        .order('heure_faite', { ascending: false })
        .limit(1)
        .maybeSingle()

      dispoMap[type] = data || null
    }
    setDispos(dispoMap)

    // Membres connectes (actif = true)
    const { count } = await supabase
      .from('membres')
      .select('*', { count: 'exact', head: true })
      .eq('actif', true)
    setConnectes(count ?? 0)

    // Totaux gang semaine (direction uniquement)
    if (isDirection) {
      const debutStr = getDebutSemaineStr()
      const [commParams, { data: activites }, { data: ventes }, { data: membres }, { data: plants }] = await Promise.all([
        chargerParamsCommission(),
        supabase.from('activites').select('membre_id, somme_argent_sale, type_code').gte('heure_faite', debutStr),
        supabase.from('ventes_drogue').select('membre_id, argent_sale, prix_total, statut').gte('created_at', getDebutSemaine().toISOString()),
        supabase.from('membres').select('id, rang'),
        supabase.from('plantations').select('membre_id, benefice').gte('date_plantation', debutStr),
      ])
      let totalCommission = 0
      let totalNet = 0
      let totalBrut = 0
      ;(membres || []).forEach(m => {
        const acts  = (activites || []).filter(a => a.membre_id === m.id)
        const vts   = (ventes    || []).filter(v => v.membre_id === m.id)
        const ps    = (plants    || []).filter(p => p.membre_id === m.id)
        const c     = calculerCommission(acts, vts, m.rang, commParams, ps)
        totalCommission += c.commission
        totalNet        += c.net + c.cambriolageTotal
        totalBrut       += c.base + c.cambriolageTotal
      })
      setTotauxGang({ brut: totalBrut, commission: totalCommission, net: totalNet })
    }

    setLoading(false)
  }

  const formatMontant = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  const fmtDate = (d) =>
    parseTS(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
    </div>
  )

  return (
    <div>
      {/* En-tete */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Tableau de bord
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 26, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Bienvenue, {membre.surnom}
        </h1>
      </div>

      {/* Stats direction */}
      {isDirection && (
        <div className="grid-3" style={{ marginBottom: 28 }}>
          <div className="stat-box">
            <span className="stat-label">Argent sale — semaine</span>
            <span className="stat-value">{formatMontant(totauxGang?.brut ?? 0)}</span>
            <span className="stat-sub" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
              <span>Commission : <span style={{ color: '#e8a84c' }}>− {formatMontant(totauxGang?.commission ?? 0)}</span></span>
              <span>Total NET : <span style={{ color: 'var(--or)' }}>{formatMontant(totauxGang?.net ?? 0)}</span></span>
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Membres connectes</span>
            <span className="stat-value">{connectes}</span>
            <span className="stat-sub">Sur le site en ce moment</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Rang</span>
            <span className="stat-value" style={{ fontSize: 20, textTransform: 'capitalize' }}>{membre.rang}</span>
            <span className="stat-sub">{membre.surnom}</span>
          </div>
        </div>
      )}

      {/* Disponibilites */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">Disponibilités activités</div>
          {Object.keys(COOLDOWNS).map((type) => {
            const act    = dispos[type]
            const status = getDispoStatus(act?.prochain_dispo)

            return (
              <div key={type} className="dispo-item">
                <div>
                  <div className="dispo-name">{LABELS[type]}</div>
                  {act?.heure_faite && (
                    <div style={{ fontSize: 11, color: 'var(--texte-soft)', marginTop: 2 }}>
                      Dernière : {fmtDate(act.heure_faite)}
                    </div>
                  )}
                </div>
                <div className={`dispo-time ${status.dispo ? 'dispo-ok' : 'dispo-wait'}`}>
                  {status.dispo
                    ? (status.jamaisFait ? '✓ Disponible' : '✓ Disponible')
                    : `⏳ ${status.label}`}
                </div>
              </div>
            )
          })}
        </div>

        {/* Recap rapide semaine */}
        <div className="card">
          <div className="card-title">Semaine en cours</div>
          <RecapSemaineMini membreId={membre.id} />
        </div>
      </div>
    </div>
  )
}

// Mini recap integre dans le dashboard
function RecapSemaineMini({ membreId }) {
  const membre = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
  const [recap, setRecap] = useState(null)

  useEffect(() => {
    const fetchRecap = async () => {
      const debutStr = getDebutSemaineStr()
      const [commParams, { data: activites }, { data: ventes }, { data: plants }] = await Promise.all([
        chargerParamsCommission(),
        supabase.from('activites').select('somme_argent_sale, type_code').eq('membre_id', membreId).gte('heure_faite', debutStr),
        supabase.from('ventes_drogue').select('argent_sale, prix_total, statut').eq('membre_id', membreId).gte('created_at', getDebutSemaine().toISOString()),
        supabase.from('plantations').select('benefice').eq('membre_id', membreId).gte('date_plantation', debutStr),
      ])

      const calc = calculerCommission(activites || [], ventes || [], membre.rang, commParams, plants || [])
      setRecap(calc)
    }
    fetchRecap()
  }, [membreId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  if (!recap) return <div style={{ color: 'var(--texte-soft)', fontSize: 13 }}>Chargement…</div>

  const { totalActBrut, cambriolageTotal, nbATM, deductionBoitiers, totalBenefice, totalPlantations, base, multiplicateur, commission_pct, commission, net, tranches_detail } = recap

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--texte-soft)' }}>Activités (hors cambriolage)</span>
        <span>{fmt(totalActBrut)}</span>
      </div>
      {cambriolageTotal > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--texte-soft)' }}>Cambriolage (direct)</span>
          <span>{fmt(cambriolageTotal)}</span>
        </div>
      )}
      {nbATM > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--texte-soft)' }}>Boitiers ATM ({nbATM}×)</span>
          <span style={{ color: '#e05555' }}>− {fmt(deductionBoitiers)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--texte-soft)' }}>Ventes (bénéfice)</span>
        <span>{fmt(totalBenefice)}</span>
      </div>
      {totalPlantations > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--texte-soft)' }}>Plantations</span>
          <span>{fmt(totalPlantations)}</span>
        </div>
      )}
      <hr className="sep-or" style={{ margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--texte-soft)' }}>Base commission</span>
        <span style={{ color: 'var(--or-pale)' }}>{fmt(base)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--texte-soft)' }}>
          Commission
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {tranches_detail && tranches_detail.length > 0
              ? tranches_detail.map(t => `${t.taux_effectif}% sur ${Math.round(t.portion).toLocaleString('fr-FR')}$`).join(' + ')
              : `×${multiplicateur}`}
            {' — '}taux moy. {commission_pct.toFixed(1)}%
          </span>
        </span>
        <span style={{ color: '#e05555' }}>− {fmt(commission)}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 15, fontFamily: 'var(--font-corps)',
        padding: '12px 0 0',
        borderTop: '1px solid var(--or-border)',
      }}>
        <span style={{ color: 'var(--or)' }}>Total NET</span>
        <span style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(net)}</span>
      </div>
    </div>
  )
}
