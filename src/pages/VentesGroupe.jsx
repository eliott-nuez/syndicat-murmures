import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { nowLocalInput, localInputToUTCISO, fmtDateTime } from '../utils/timezone'

const localNow = nowLocalInput
const fmtDate = fmtDateTime

const fmt = (v) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

export default function VentesGroupe() {
  const membre = JSON.parse(localStorage.getItem('sdm_membre') || '{}')

  const [drogues, setDrogues]   = useState([])
  const [ventes, setVentes]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState({ type: '', text: '' })

  const [form, setForm] = useState({
    drogue_id:         '',
    nom_acheteur:      '',
    quantite:          '',
    montant_argent_sale: '',
    note:              '',
    created_at:        localNow(),
  })

  useEffect(() => {
    Promise.all([fetchDrogues(), fetchVentes()])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDrogues = async () => {
    const { data } = await supabase.from('drogues').select('*').order('nom')
    setDrogues(data || [])
  }

  const fetchVentes = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ventes_groupe')
      .select('*, drogues(nom, prix_revient)')
      .order('created_at', { ascending: false })
      .limit(100)
    setVentes(data || [])
    setLoading(false)
  }

  // Calcul automatique du bénéfice
  const drogue       = drogues.find(d => d.id === form.drogue_id)
  const qte          = parseInt(form.quantite) || 0
  const montant      = parseFloat(form.montant_argent_sale) || 0
  const prixUnit     = qte > 0 && montant > 0 ? Math.round(montant / qte) : null
  const beneficeCalc = drogue && qte && montant
    ? montant - drogue.prix_revient * qte
    : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.drogue_id || !form.quantite || !form.montant_argent_sale) {
      setMsg({ type: 'error', text: 'Veuillez remplir tous les champs obligatoires.' })
      return
    }
    setSaving(true)
    setMsg({ type: '', text: '' })

    const benefice = beneficeCalc ?? 0
    const created_at = localInputToUTCISO(form.created_at)

    const { error } = await supabase.from('ventes_groupe').insert({
      membre_id:           membre.id,
      drogue_id:           form.drogue_id,
      nom_acheteur:        form.nom_acheteur || null,
      quantite:            qte,
      montant_argent_sale: montant,
      benefice,
      note:                form.note || null,
      created_at,
    })

    setSaving(false)
    if (error) {
      setMsg({ type: 'error', text: 'Erreur : ' + error.message })
    } else {
      setMsg({ type: 'success', text: 'Vente de groupe enregistrée.' })
      setForm({
        drogue_id: '', nom_acheteur: '', quantite: '',
        montant_argent_sale: '', note: '', created_at: localNow(),
      })
      fetchVentes()
    }
  }

  // Totaux historique
  const totaux = ventes.reduce((acc, v) => ({
    quantite: acc.quantite + (v.quantite || 0),
    montant:  acc.montant  + (v.montant_argent_sale || 0),
    benefice: acc.benefice + (v.benefice || 0),
  }), { quantite: 0, montant: 0, benefice: 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* En-tête */}
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
          Commerce
        </div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
          Ventes de groupe
        </h1>
      </div>

      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>
      )}

      {/* Formulaire */}
      <div className="card">
        <div className="card-title">Enregistrer une vente</div>
        <form onSubmit={handleSubmit}>
          <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Produit *</label>
              <select className="form-select" value={form.drogue_id}
                onChange={e => setForm({ ...form, drogue_id: e.target.value })} required>
                <option value="">— Choisir un produit —</option>
                {drogues.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.nom} (rev. {fmt(d.prix_revient)}/u)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Acheteur / Groupe</label>
              <input className="form-input" type="text"
                placeholder="Ex : Los Santos Vagos"
                value={form.nom_acheteur}
                onChange={e => setForm({ ...form, nom_acheteur: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">Quantité *</label>
              <input className="form-input" type="number" min="1" required
                placeholder="Ex : 2500"
                value={form.quantite}
                onChange={e => setForm({ ...form, quantite: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">Montant argent sale ($) *</label>
              <input className="form-input" type="number" min="0" step="1" required
                placeholder="Ex : 450000"
                value={form.montant_argent_sale}
                onChange={e => setForm({ ...form, montant_argent_sale: e.target.value })} />
            </div>

            {/* Info auto-calculée */}
            <div className="form-group">
              <label className="form-label">Prix / unité (auto)</label>
              <input className="form-input" type="text" disabled
                value={prixUnit !== null ? `${fmt(prixUnit)} / unité` : '—'}
                style={{ opacity: 0.5 }} />
            </div>

            <div className="form-group">
              <label className="form-label">Bénéfice net (auto)</label>
              <input className="form-input" type="text" disabled
                value={beneficeCalc !== null
                  ? `${beneficeCalc >= 0 ? '' : '− '}${fmt(Math.abs(beneficeCalc))}`
                  : '—'}
                style={{
                  opacity: 0.9,
                  color: beneficeCalc !== null
                    ? (beneficeCalc >= 0 ? '#5cba8a' : '#e05555')
                    : undefined,
                  fontWeight: 600,
                }} />
            </div>

            <div className="form-group">
              <label className="form-label">Date / heure</label>
              <input className="form-input" type="datetime-local"
                value={form.created_at}
                onChange={e => setForm({ ...form, created_at: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">Note (facultatif)</label>
              <input className="form-input" type="text"
                placeholder="Lieu, conditions, etc."
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>

          {/* Récap avant envoi */}
          {drogue && qte > 0 && montant > 0 && (
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
              <span><span style={{ color: 'var(--texte-soft)' }}>Produit : </span>{drogue.nom}</span>
              <span><span style={{ color: 'var(--texte-soft)' }}>Qté : </span><strong>{qte.toLocaleString('fr-FR')}</strong></span>
              <span><span style={{ color: 'var(--texte-soft)' }}>Montant : </span><strong style={{ color: 'var(--or-pale)' }}>{fmt(montant)}</strong></span>
              <span>
                <span style={{ color: 'var(--texte-soft)' }}>Bénéfice : </span>
                <strong style={{ color: beneficeCalc >= 0 ? '#5cba8a' : '#e05555' }}>
                  {fmt(beneficeCalc ?? 0)}
                </strong>
              </span>
            </div>
          )}

          <button type="submit" className="btn btn-solid" disabled={saving}>
            {saving ? 'Enregistrement...' : '+ Valider la vente'}
          </button>
        </form>
      </div>

      {/* Stats globales */}
      {ventes.length > 0 && (
        <div className="grid-3">
          <div className="stat-box">
            <span className="stat-label">Quantité totale vendue</span>
            <span className="stat-value">{totaux.quantite.toLocaleString('fr-FR')}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Montant total</span>
            <span className="stat-value">{fmt(totaux.montant)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Bénéfice total</span>
            <span className="stat-value" style={{ color: 'var(--or)' }}>{fmt(totaux.benefice)}</span>
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="card">
        <div className="card-title">Historique des ventes</div>

        {loading ? (
          <div style={{ color: 'var(--texte-soft)', fontSize: 13 }}>Chargement…</div>
        ) : ventes.length === 0 ? (
          <div style={{ color: 'var(--texte-soft)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
            Aucune vente de groupe enregistrée.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th>Acheteur</th>
                  <th style={{ textAlign: 'center' }}>Quantité</th>
                  <th>Prix / u</th>
                  <th>Montant total</th>
                  <th>Bénéfice</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {ventes.map(v => {
                  const pu = v.quantite > 0
                    ? Math.round(v.montant_argent_sale / v.quantite)
                    : 0
                  return (
                    <tr key={v.id}>
                      <td style={{ color: 'var(--texte-soft)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtDate(v.created_at)}
                      </td>
                      <td style={{ fontWeight: 500 }}>{v.drogues?.nom || '—'}</td>
                      <td style={{ color: 'var(--texte-soft)' }}>{v.nom_acheteur || '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>
                        {(v.quantite || 0).toLocaleString('fr-FR')}
                      </td>
                      <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{fmt(pu)}</td>
                      <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(v.montant_argent_sale)}</td>
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ color: v.benefice >= 0 ? '#5cba8a' : '#e05555' }}>
                          {v.benefice >= 0 ? '' : '− '}
                          {fmt(Math.abs(v.benefice))}
                        </span>
                      </td>
                      <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>{v.note || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--or-border)' }}>
                  <td colSpan={3} style={{ color: 'var(--or)', fontWeight: 600, padding: '12px 14px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Totaux
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--or-pale)', fontWeight: 700 }}>
                    {totaux.quantite.toLocaleString('fr-FR')}
                  </td>
                  <td></td>
                  <td style={{ color: 'var(--or-pale)', fontWeight: 700 }}>{fmt(totaux.montant)}</td>
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
