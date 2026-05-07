import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

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
      const debutSemaine = getDebutSemaine()
      const [{ data: activites }, { data: ventes }] = await Promise.all([
        supabase.from('activites').select('somme_argent_sale').gte('created_at', debutSemaine.toISOString()),
        supabase.from('ventes_drogue').select('argent_sale').eq('statut', 'Vendu').gte('created_at', debutSemaine.toISOString()),
      ])
      const totalAct    = (activites || []).reduce((s, a) => s + (a.somme_argent_sale || 0), 0)
      const totalVentes = (ventes    || []).reduce((s, v) => s + (v.argent_sale     || 0), 0)
      const brut        = totalAct + totalVentes
      const commission  = totalVentes * 0.10
      const net         = brut - commission
      setTotauxGang({ brut, commission, net })
    }

    setLoading(false)
  }

  const getDebutSemaine = () => {
    const d = new Date()
    const jour = d.getDay() || 7
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - jour + 1)
    return d
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
  const [recap, setRecap] = useState(null)

  const getDebutSemaine = () => {
    const d = new Date()
    const jour = d.getDay() || 7
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - jour + 1)
    return d
  }

  useEffect(() => {
    const fetchRecap = async () => {
      const debut = getDebutSemaine()

      const { data: activites } = await supabase
        .from('activites')
        .select('somme_argent_sale')
        .eq('membre_id', membreId)
        .gte('created_at', debut.toISOString())

      const { data: ventes } = await supabase
        .from('ventes_drogue')
        .select('argent_sale, statut')
        .eq('membre_id', membreId)
        .eq('statut', 'Vendu')
        .gte('created_at', debut.toISOString())

      const totalAct    = (activites || []).reduce((s, a) => s + (a.somme_argent_sale || 0), 0)
      const totalVentes = (ventes    || []).reduce((s, v) => s + (v.argent_sale || 0), 0)
      const brut        = totalAct + totalVentes
      const COMMISSION  = 10
      const commission  = totalVentes * (COMMISSION / 100)
      const net         = brut - commission

      setRecap({ totalAct, totalVentes, brut, commission, net, COMMISSION })
    }
    fetchRecap()
  }, [membreId])

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  if (!recap) return <div style={{ color: 'var(--texte-soft)', fontSize: 13 }}>Chargement…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: 'var(--texte-soft)' }}>Activités</span>
        <span>{fmt(recap.totalAct)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: 'var(--texte-soft)' }}>Ventes</span>
        <span>{fmt(recap.totalVentes)}</span>
      </div>
      <hr className="sep-or" style={{ margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: 'var(--texte-soft)' }}>Total brut</span>
        <span style={{ color: 'var(--or-pale)' }}>{fmt(recap.brut)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: 'var(--texte-soft)' }}>Commission ({recap.COMMISSION}%)</span>
        <span style={{ color: '#e05555' }}>− {fmt(recap.commission)}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 15, fontFamily: 'var(--font-corps)',
        padding: '12px 0 0',
        borderTop: '1px solid var(--or-border)',
      }}>
        <span style={{ color: 'var(--or)' }}>Total NET</span>
        <span style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(recap.net)}</span>
      </div>
    </div>
  )
}
