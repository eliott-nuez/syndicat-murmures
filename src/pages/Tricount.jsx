import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const CATEGORIES = ['Véhicule', 'Entrepôt', 'Matériel', 'Plantation', 'Autre']

export default function Tricount() {
  const [membres, setMembres]           = useState([])
  const [depenses, setDepenses]         = useState([])
  const [showForm, setShowForm]         = useState(false)
  const [showRembForm, setShowRembForm] = useState(false)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [msg, setMsg]                   = useState('')
  const [histSort, setHistSort]         = useState({ key: 'date_depense', dir: 'desc' })

  const [form, setForm] = useState({
    payeur_id:     '',
    categorie:     'Autre',
    description:   '',
    montant_total: '',
    date_depense:  new Date().toISOString().slice(0, 10),
    participants:  [],
  })

  const [formRemb, setFormRemb] = useState({
    de_id: '', vers_id: '', montant: '', note: '',
  })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: mb }, { data: dep }] = await Promise.all([
      supabase.from('membres').select('id, surnom').eq('rang', 'direction').order('surnom'),
      supabase.from('depenses')
        .select('*, membres!payeur_id(surnom), depense_participants(*, membres(surnom))')
        .order('date_depense', { ascending: false }),
    ])
    setMembres(mb || [])
    setDepenses(dep || [])
    setLoading(false)
  }

  // ── Calcul des balances : équilibre global (total / nb membres) ──
  const computeBalances = () => {
    const bal = {}
    membres.forEach(m => { bal[m.id] = 0 })

    const totalDepenses = depenses
      .filter(d => d.categorie !== 'Remboursement')
      .reduce((s, d) => s + (d.montant_total || 0), 0)
    const fairShare = membres.length > 0 ? totalDepenses / membres.length : 0

    depenses.forEach(dep => {
      if (dep.categorie === 'Remboursement') {
        dep.depense_participants?.forEach(p => {
          bal[dep.payeur_id] = (bal[dep.payeur_id] || 0) + p.part_due
          bal[p.membre_id]   = (bal[p.membre_id]   || 0) - p.part_due
        })
      } else {
        bal[dep.payeur_id] = (bal[dep.payeur_id] || 0) + dep.montant_total
      }
    })

    membres.forEach(m => { bal[m.id] = (bal[m.id] || 0) - fairShare })
    return bal
  }

  // Algorithme minimum cash flow : qui doit payer qui
  const computeTransactions = (balances) => {
    const creditors = membres
      .filter(m => (balances[m.id] || 0) > 0.01)
      .map(m => ({ id: m.id, surnom: m.surnom, amount: balances[m.id] }))
      .sort((a, b) => b.amount - a.amount)

    const debtors = membres
      .filter(m => (balances[m.id] || 0) < -0.01)
      .map(m => ({ id: m.id, surnom: m.surnom, amount: -balances[m.id] }))
      .sort((a, b) => b.amount - a.amount)

    const transactions = []
    let ci = 0, di = 0
    while (ci < creditors.length && di < debtors.length) {
      const amount = Math.min(creditors[ci].amount, debtors[di].amount)
      if (amount > 0.01) {
        transactions.push({ from: debtors[di].surnom, to: creditors[ci].surnom, amount })
      }
      creditors[ci].amount -= amount
      debtors[di].amount   -= amount
      if (creditors[ci].amount < 0.01) ci++
      if (debtors[di].amount   < 0.01) di++
    }
    return transactions
  }

  // ── Soumettre dépense ──
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    const { data: dep, error: errDep } = await supabase
      .from('depenses')
      .insert({
        payeur_id:     form.payeur_id,
        categorie:     form.categorie,
        description:   form.description,
        montant_total: parseFloat(form.montant_total),
        date_depense:  form.date_depense,
      })
      .select()
      .single()

    if (errDep) { setMsg('Erreur : ' + errDep.message); setSaving(false); return }

    if (form.participants.length > 0) {
      const rows = form.participants.map(p => ({
        depense_id: dep.id,
        membre_id:  p.membre_id,
        part_due:   parseFloat(p.part_due) || 0,
      }))
      await supabase.from('depense_participants').insert(rows)
    }

    setSaving(false)
    setShowForm(false)
    setForm({ payeur_id: '', categorie: 'Autre', description: '', montant_total: '', date_depense: new Date().toISOString().slice(0, 10), participants: [] })
    setMsg('Dépense enregistrée.')
    fetchAll()
  }

  // ── Soumettre remboursement ──
  const handleRemboursement = async (e) => {
    e.preventDefault()
    if (formRemb.de_id === formRemb.vers_id) { setMsg('Erreur : même personne.'); return }
    setSaving(true)
    setMsg('')

    const montant = parseFloat(formRemb.montant) || 0
    const label = membres.find(m => m.id === formRemb.vers_id)?.surnom || ''

    const { data: dep, error } = await supabase
      .from('depenses')
      .insert({
        payeur_id:     formRemb.de_id,
        categorie:     'Remboursement',
        description:   `Remboursement vers ${label}${formRemb.note ? ` — ${formRemb.note}` : ''}`,
        montant_total: montant,
        date_depense:  new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()

    if (error) { setMsg('Erreur : ' + error.message); setSaving(false); return }

    await supabase.from('depense_participants').insert({
      depense_id: dep.id,
      membre_id:  formRemb.vers_id,
      part_due:   montant,
      rembourse:  true,
    })

    setSaving(false)
    setShowRembForm(false)
    setFormRemb({ de_id: '', vers_id: '', montant: '', note: '' })
    setMsg('Remboursement enregistré.')
    fetchAll()
  }

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  const handleHistSort = (key) => {
    setHistSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date_depense' ? 'desc' : 'asc' })
  }

  const sortedDepenses = useMemo(() => {
    return [...depenses].sort((a, b) => {
      let va, vb
      switch (histSort.key) {
        case 'payeur':
          va = a.membres?.surnom || ''; vb = b.membres?.surnom || ''; break
        case 'categorie':
          va = a.categorie || ''; vb = b.categorie || ''; break
        case 'description':
          va = a.description || ''; vb = b.description || ''; break
        case 'montant_total':
          va = a.montant_total || 0; vb = b.montant_total || 0; break
        case 'date_depense':
        default:
          va = a.date_depense || ''; vb = b.date_depense || ''; break
      }
      if (typeof va === 'number') return histSort.dir === 'asc' ? va - vb : vb - va
      return histSort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [depenses, histSort])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const balances       = computeBalances()
  const transactions   = computeTransactions(JSON.parse(JSON.stringify(balances)))
  const totalDepenses  = depenses.filter(d => d.categorie !== 'Remboursement').reduce((s, d) => s + (d.montant_total || 0), 0)
  const fairShare      = membres.length > 0 ? totalDepenses / membres.length : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
            Direction
          </div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
            Tricount — Dépenses direction
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-or" onClick={() => { setShowRembForm(!showRembForm); setShowForm(false) }}>
            {showRembForm ? '✕ Annuler' : '↩ Remboursement'}
          </button>
          <button className="btn btn-solid" onClick={() => { setShowForm(!showForm); setShowRembForm(false) }}>
            {showForm ? '✕ Annuler' : '+ Dépense'}
          </button>
        </div>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      {/* ── Résumé global ── */}
      <div className="grid-3">
        <div className="stat-box">
          <span className="stat-label">Total dépenses</span>
          <span className="stat-value">{fmt(totalDepenses)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Membres direction</span>
          <span className="stat-value">{membres.length}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Part équitable / membre</span>
          <span className="stat-value" style={{ color: 'var(--or)' }}>{fmt(fairShare)}</span>
        </div>
      </div>

      {/* ── Soldes par membre ── */}
      <div className="card">
        <div className="card-title">Soldes actuels</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {membres.map(m => {
            const solde = balances[m.id] || 0
            return (
              <div key={m.id} style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${solde > 0 ? 'rgba(42,110,74,0.4)' : solde < 0 ? 'rgba(139,26,26,0.4)' : 'var(--or-border)'}`,
                borderRadius: 8,
                padding: '16px 20px',
                minWidth: 160,
              }}>
                <div style={{ fontSize: 12, color: 'var(--texte-soft)', marginBottom: 4 }}>{m.surnom}</div>
                <div style={{
                  fontFamily: 'var(--font-corps)', fontSize: 22, fontWeight: 600,
                  color: solde > 0 ? '#5cba8a' : solde < 0 ? '#e05555' : 'var(--texte-soft)',
                }}>
                  {solde > 0 ? '+' : ''}{fmt(solde)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--texte-soft)', marginTop: 4 }}>
                  {solde > 0 ? 'On lui doit' : solde < 0 ? 'Il doit rembourser' : 'Équilibré'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Qui doit quoi à qui ── */}
      {transactions.length > 0 && (
        <div className="card">
          <div className="card-title">Qui doit payer qui</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {transactions.map((t, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                background: 'rgba(139,26,26,0.06)',
                border: '1px solid rgba(139,26,26,0.2)',
                borderRadius: 8,
              }}>
                <span style={{ fontWeight: 600, color: '#e05555' }}>{t.from}</span>
                <span style={{ color: 'var(--texte-soft)', fontSize: 12 }}>→ doit payer →</span>
                <span style={{ fontWeight: 600, color: '#5cba8a' }}>{t.to}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-corps)', fontSize: 18, fontWeight: 700, color: 'var(--or-pale)' }}>
                  {fmt(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {transactions.length === 0 && membres.length > 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--texte-soft)', padding: '24px' }}>
          Tout le monde est à l'équilibre.
        </div>
      )}

      {/* ── Formulaire remboursement ── */}
      {showRembForm && (
        <div className="card">
          <div className="card-title">Enregistrer un remboursement</div>
          <form onSubmit={handleRemboursement}>
            <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Qui rembourse ?</label>
                <select className="form-select" required value={formRemb.de_id}
                  onChange={e => setFormRemb({ ...formRemb, de_id: e.target.value })}>
                  <option value="">— Sélectionner —</option>
                  {membres.map(m => <option key={m.id} value={m.id}>{m.surnom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">À qui ?</label>
                <select className="form-select" required value={formRemb.vers_id}
                  onChange={e => setFormRemb({ ...formRemb, vers_id: e.target.value })}>
                  <option value="">— Sélectionner —</option>
                  {membres.filter(m => m.id !== formRemb.de_id).map(m => (
                    <option key={m.id} value={m.id}>{m.surnom}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Montant ($)</label>
                <input className="form-input" type="number" min="1" step="1" required
                  placeholder="Ex : 25000"
                  value={formRemb.montant}
                  onChange={e => setFormRemb({ ...formRemb, montant: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Note (facultatif)</label>
                <input className="form-input" type="text"
                  placeholder="Ex : cash en main propre"
                  value={formRemb.note}
                  onChange={e => setFormRemb({ ...formRemb, note: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-or" disabled={saving}>
              {saving ? 'Enregistrement...' : '↩ Valider le remboursement'}
            </button>
          </form>
        </div>
      )}

      {/* ── Formulaire dépense ── */}
      {showForm && (
        <div className="card">
          <div className="card-title">Nouvelle dépense</div>
          <form onSubmit={handleSubmit}>
            <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Qui a payé ?</label>
                <select className="form-select" required value={form.payeur_id}
                  onChange={e => setForm({ ...form, payeur_id: e.target.value })}>
                  <option value="">— Sélectionner —</option>
                  {membres.map(m => <option key={m.id} value={m.id}>{m.surnom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select className="form-select" value={form.categorie}
                  onChange={e => setForm({ ...form, categorie: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Montant total ($)</label>
                <input className="form-input" type="number" min="0" step="0.01" required
                  placeholder="Ex : 50000"
                  value={form.montant_total}
                  onChange={e => setForm({ ...form, montant_total: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" required
                  value={form.date_depense}
                  onChange={e => setForm({ ...form, date_depense: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Description</label>
              <input className="form-input" type="text"
                placeholder="Ex : Achat entrepôt Sandy"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>

            <div style={{ padding: '10px 14px', background: 'var(--or-glow)', border: '1px solid var(--or-border)', borderRadius: 6, fontSize: 12, color: 'var(--texte-soft)', marginBottom: 16 }}>
              Les dépenses sont réparties équitablement entre tous les membres de la direction.
            </div>

            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Valider la dépense'}
            </button>
          </form>
        </div>
      )}

      {/* ── Historique ── */}
      <div className="card">
        <div className="card-title">Historique des dépenses</div>
        {depenses.length === 0 ? (
          <p style={{ color: 'var(--texte-soft)', fontSize: 13 }}>Aucune dépense enregistrée.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    { label: 'Date',        key: 'date_depense'  },
                    { label: 'Payeur',      key: 'payeur'        },
                    { label: 'Catégorie',   key: 'categorie'     },
                    { label: 'Description', key: 'description'   },
                    { label: 'Montant',     key: 'montant_total' },
                  ].map(col => (
                    <th
                      key={col.label}
                      onClick={col.key ? () => handleHistSort(col.key) : undefined}
                      style={{ cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}
                    >
                      {col.label}
                      {col.key && histSort.key === col.key ? (histSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedDepenses.map(d => {
                  const isRemb = d.categorie === 'Remboursement'
                  return (
                    <tr key={d.id} style={{ opacity: isRemb ? 0.8 : 1 }}>
                      <td style={{ color: 'var(--texte-soft)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {new Date(d.date_depense).toLocaleDateString('fr-FR')}
                      </td>
                      <td style={{ fontWeight: 600, color: isRemb ? '#5cba8a' : 'var(--or)' }}>
                        {d.membres?.surnom || '—'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '2px 7px', borderRadius: 3,
                          background: isRemb ? 'rgba(92,186,138,0.1)' : 'rgba(201,168,76,0.08)',
                          border: `1px solid ${isRemb ? 'rgba(92,186,138,0.25)' : 'var(--or-border)'}`,
                          color: isRemb ? '#5cba8a' : 'var(--texte-soft)',
                        }}>
                          {isRemb ? '↩ Remb.' : d.categorie}
                        </span>
                      </td>
                      <td style={{ color: isRemb ? '#5cba8a' : 'var(--texte)' }}>
                        {d.description || '—'}
                      </td>
                      <td style={{
                        fontFamily: 'var(--font-corps)', fontWeight: 700, fontSize: 15,
                        color: isRemb ? '#5cba8a' : 'var(--or-pale)', whiteSpace: 'nowrap',
                      }}>
                        {isRemb ? '↩ ' : ''}{fmt(d.montant_total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
