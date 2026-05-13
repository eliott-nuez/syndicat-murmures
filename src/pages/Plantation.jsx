import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getDebutSemaineStr } from '../utils/temps'

// Prix de vente par branche en argent sale
const PRIX_VENTE_BRANCHE = 70

function localNow() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const parseTS = (d) => new Date(typeof d === 'string' ? d.replace(' ', 'T') : d)
const fmtDate = (d) =>
  parseTS(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const fmt = (v) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

export default function Plantation() {
  const membreCourant = JSON.parse(localStorage.getItem('sdm_membre') || '{}')

  const [membres, setMembres]         = useState([])
  const [branche, setBranche]         = useState(null)   // drogue "Branche" auto-chargée
  const [plantations, setPlantations] = useState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [msg, setMsg]                 = useState({ type: '', text: '' })

  const [form, setForm] = useState({
    membre_id:       membreCourant.id || '',
    nb_pots:         '',
    nb_branches:     '',
    date_plantation: localNow(),
    note:            '',
  })

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true)
    const [{ data: m }, { data: b }, { data: p }] = await Promise.all([
      supabase.from('membres').select('id, surnom, rang').order('surnom'),
      supabase.from('drogues').select('*').ilike('nom', '%branche%').maybeSingle(),
      supabase.from('plantations')
        .select('*, membres(surnom)')
        .gte('date_plantation', getDebutSemaineStr())
        .order('date_plantation', { ascending: false }),
    ])
    setMembres(m || [])
    setBranche(b || null)
    setPlantations(p || [])
    setLoading(false)
  }

  // Calculs auto
  const nb_pots          = parseInt(form.nb_pots)     || 0
  const nb_branches      = parseInt(form.nb_branches) || 0
  const branches_par_pot = nb_pots > 0 && nb_branches > 0 ? Math.round(nb_branches / nb_pots) : null
  const beneficeCalc     = branche && nb_branches > 0
    ? nb_branches * (PRIX_VENTE_BRANCHE - branche.prix_revient)
    : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.membre_id || !nb_pots || !nb_branches) {
      setMsg({ type: 'error', text: 'Tous les champs obligatoires doivent être remplis.' })
      return
    }
    setSaving(true)
    setMsg({ type: '', text: '' })

    // Si la drogue n'est pas encore chargée, on la re-fetch au moment du submit
    let drogueActive = branche
    if (!drogueActive) {
      const { data } = await supabase.from('drogues').select('*').ilike('nom', '%branche%').maybeSingle()
      drogueActive = data
      if (drogueActive) setBranche(drogueActive)
    }
    if (!drogueActive) {
      setMsg({ type: 'error', text: 'Impossible de trouver la drogue "Branche" — recharge la page.' })
      setSaving(false)
      return
    }

    const beneficeFinal = nb_branches * (PRIX_VENTE_BRANCHE - drogueActive.prix_revient)

    const { error } = await supabase.from('plantations').insert({
      membre_id:        form.membre_id,
      drogue_id:        drogueActive.id,
      nb_pots,
      nb_branches,
      branches_par_pot: branches_par_pot ?? 0,
      benefice:         beneficeFinal,
      date_plantation:  form.date_plantation.replace('T', ' ') + ':00',
      note:             form.note || null,
    })

    setSaving(false)
    if (error) {
      setMsg({ type: 'error', text: 'Erreur : ' + error.message })
    } else {
      const nom = membres.find(m => m.id === form.membre_id)?.surnom || '—'
      setMsg({ type: 'success', text: `Récolte enregistrée pour ${nom}.` })
      setForm(f => ({ ...f, nb_pots: '', nb_branches: '', date_plantation: localNow(), note: '' }))
      fetchData()
    }
  }

  // Totaux historique
  const totaux = plantations.reduce((acc, p) => ({
    nb_pots:     acc.nb_pots     + (p.nb_pots     || 0),
    nb_branches: acc.nb_branches + (p.nb_branches || 0),
    benefice:    acc.benefice    + (p.benefice    || 0),
  }), { nb_pots: 0, nb_branches: 0, benefice: 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* En-tête */}
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Production
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Plantation & Récolte
        </h1>
        {branche && (
          <div style={{ fontSize: 12, color: 'var(--texte-soft)', marginTop: 6 }}>
            Produit : <span style={{ color: 'var(--or-pale)' }}>{branche.nom}</span>
            <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
            Coût revient : <span style={{ color: 'var(--or-pale)' }}>{fmt(branche.prix_revient)}/u</span>
            <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
            Prix vente : <span style={{ color: 'var(--or-pale)' }}>{PRIX_VENTE_BRANCHE}$/u</span>
          </div>
        )}
      </div>

      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>
      )}

      {/* Formulaire */}
      <div className="card">
        <div className="card-title">Enregistrer une récolte</div>
        <form onSubmit={handleSubmit}>
          <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>

            <div className="form-group">
              <label className="form-label">Membre *</label>
              <select className="form-select" value={form.membre_id}
                onChange={e => setForm(f => ({ ...f, membre_id: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {membres.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.surnom} ({m.rang}){m.id === membreCourant.id ? ' — moi' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Nombre de pots plantés *</label>
              <input className="form-input" type="number" min="1" required
                placeholder="Ex : 50"
                value={form.nb_pots}
                onChange={e => setForm(f => ({ ...f, nb_pots: e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">Nombre de branches récoltées *</label>
              <input className="form-input" type="number" min="1" required
                placeholder="Ex : 2500"
                value={form.nb_branches}
                onChange={e => setForm(f => ({ ...f, nb_branches: e.target.value }))} />
            </div>

            {/* Auto-calculés */}
            <div className="form-group">
              <label className="form-label">Branches / pot (auto)</label>
              <input className="form-input" type="text" disabled
                value={branches_par_pot !== null ? `${branches_par_pot} branches / pot` : '—'}
                style={{
                  fontWeight: branches_par_pot !== null ? 600 : undefined,
                  color: branches_par_pot === null ? undefined
                    : branches_par_pot >= 8 ? '#5cba8a'
                    : branches_par_pot === 7 ? '#e8a84c'
                    : '#e05555',
                }} />
            </div>

            <div className="form-group">
              <label className="form-label">
                Bénéfice estimé (auto)
                {branche && nb_branches > 0 && (
                  <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
                    {nb_branches.toLocaleString('fr-FR')} × ({PRIX_VENTE_BRANCHE} − {branche.prix_revient})
                  </span>
                )}
              </label>
              <input className="form-input" type="text" disabled
                value={beneficeCalc !== null
                  ? `${beneficeCalc >= 0 ? '' : '− '}${fmt(Math.abs(beneficeCalc))}`
                  : '—'}
                style={{
                  opacity: 0.9,
                  color: beneficeCalc !== null ? (beneficeCalc >= 0 ? '#5cba8a' : '#e05555') : undefined,
                  fontWeight: 600,
                }} />
            </div>

            <div className="form-group">
              <label className="form-label">Date de récolte</label>
              <input className="form-input" type="datetime-local"
                value={form.date_plantation}
                onChange={e => setForm(f => ({ ...f, date_plantation: e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">Note (facultatif)</label>
              <input className="form-input" type="text"
                placeholder="Lieu, conditions, etc."
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>

          {/* Récap avant envoi */}
          {nb_pots > 0 && nb_branches > 0 && (
            <div style={{
              background: 'rgba(201,168,76,0.06)',
              border: '1px solid var(--or-border)',
              borderRadius: 'var(--radius)',
              padding: '14px 18px',
              marginBottom: 16,
              fontSize: 13,
              display: 'flex',
              gap: 32,
              flexWrap: 'wrap',
            }}>
              <span>
                <span style={{ color: 'var(--texte-soft)' }}>Membre : </span>
                {membres.find(m => m.id === form.membre_id)?.surnom || '—'}
              </span>
              <span>
                <span style={{ color: 'var(--texte-soft)' }}>Pots : </span>
                <strong>{nb_pots}</strong>
              </span>
              <span>
                <span style={{ color: 'var(--texte-soft)' }}>Branches : </span>
                <strong>{nb_branches.toLocaleString('fr-FR')}</strong>
              </span>
              {branches_par_pot !== null && (
                <span>
                  <span style={{ color: 'var(--texte-soft)' }}>Moy. : </span>
                  <strong>{branches_par_pot} / pot</strong>
                </span>
              )}
              {beneficeCalc !== null && (
                <span>
                  <span style={{ color: 'var(--texte-soft)' }}>Bénéfice : </span>
                  <strong style={{ color: beneficeCalc >= 0 ? '#5cba8a' : '#e05555' }}>
                    {fmt(beneficeCalc)}
                  </strong>
                </span>
              )}
            </div>
          )}

          <button type="submit" className="btn btn-solid" disabled={saving}>
            {saving ? 'Enregistrement...' : '+ Valider la récolte'}
          </button>
        </form>
      </div>

      {/* Stats globales */}
      {!loading && plantations.length > 0 && (
        <div className="grid-3">
          <div className="stat-box">
            <span className="stat-label">Pots plantés (total)</span>
            <span className="stat-value">{totaux.nb_pots.toLocaleString('fr-FR')}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Branches récoltées (total)</span>
            <span className="stat-value">{totaux.nb_branches.toLocaleString('fr-FR')}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Bénéfice total</span>
            <span className="stat-value" style={{ color: 'var(--or)' }}>{fmt(totaux.benefice)}</span>
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="card">
        <div className="card-title">Historique des récoltes</div>

        {loading ? (
          <div style={{ color: 'var(--texte-soft)', fontSize: 13 }}>Chargement…</div>
        ) : plantations.length === 0 ? (
          <div style={{ color: 'var(--texte-soft)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
            Aucune récolte enregistrée.
          </div>
        ) : (
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
                {plantations.map(p => (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--texte-soft)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {fmtDate(p.date_plantation)}
                    </td>
                    <td style={{ fontWeight: 500 }}>{p.membres?.surnom || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{(p.nb_pots || 0).toLocaleString('fr-FR')}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {(p.nb_branches || 0).toLocaleString('fr-FR')}
                    </td>
                    <td style={{
                      textAlign: 'center',
                      fontWeight: 600,
                      color: !p.branches_par_pot ? 'var(--texte-soft)'
                        : p.branches_par_pot >= 8 ? '#5cba8a'
                        : p.branches_par_pot === 7 ? '#e8a84c'
                        : '#e05555'
                    }}>
                      {p.branches_par_pot || '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ color: p.benefice >= 0 ? '#5cba8a' : '#e05555' }}>
                        {p.benefice >= 0 ? '' : '− '}
                        {fmt(Math.abs(p.benefice))}
                      </span>
                    </td>
                    <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{p.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--or-border)' }}>
                  <td colSpan={2} style={{ color: 'var(--or)', fontWeight: 600, padding: '12px 14px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Totaux
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--or-pale)', fontWeight: 700 }}>
                    {totaux.nb_pots.toLocaleString('fr-FR')}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--or-pale)', fontWeight: 700 }}>
                    {totaux.nb_branches.toLocaleString('fr-FR')}
                  </td>
                  <td></td>
                  <td style={{ color: 'var(--or)', fontWeight: 700, fontFamily: 'var(--font-corps)', fontSize: 15 }}>
                    {fmt(totaux.benefice)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
