import { useEffect, useState } from 'react'
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

  // ── Calcul des balances client-side ──
  const computeBalances = () => {
    const bal = {}
    membres.forEach(m => { bal[m.id] = 0 })

    depenses.forEach(dep => {
      if (dep.categorie === 'Remboursement') {
        // A (payeur) rembourse B (participant) → A's solde monte, B's solde descend
        dep.depense_participants?.forEach(p => {
          bal[dep.payeur_id] = (bal[dep.payeur_id] || 0) + p.part_due
          bal[p.membre_id]   = (bal[p.membre_id]   || 0) - p.part_due
        })
      } else {
        // Dépense normale
        bal[dep.payeur_id] = (bal[dep.payeur_id] || 0) + dep.montant_total
        dep.depense_participants?.forEach(p => {
          if (!p.rembourse) {
            bal[p.membre_id] = (bal[p.membre_id] || 0) - p.part_due
          }
        })
      }
    })
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

  // ── Participants toggle ──
  const toggleParticipant = (id) => {
    setForm(f => {
      const exists = f.participants.find(p => p.membre_id === id)
      if (exists) return { ...f, participants: f.participants.filter(p => p.membre_id !== id) }
      return { ...f, participants: [...f.participants, { membre_id: id, part_due: '' }] }
    })
  }

  const updatePart = (id, val) => {
    setForm(f => ({
      ...f,
      participants: f.participants.map(p => p.membre_id === id ? { ...p, part_due: val } : p),
    }))
  }

  const repartirEquitablement = () => {
    const total = parseFloat(form.montant_total) || 0
    const nb    = form.participants.length
    if (!nb) return
    const part  = (total / nb).toFixed(2)
    setForm(f => ({ ...f, participants: f.participants.map(p => ({ ...p, part_due: part })) }))
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

  const marquerRembourse = async (participantId) => {
    await supabase.from('depense_participants')
      .update({ rembourse: true, rembourse_le: new Date().toISOString() })
      .eq('id', participantId)
    fetchAll()
  }

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const balances     = computeBalances()
  const transactions = computeTransactions(structuredClone ? structuredClone(balances) : JSON.parse(JSON.stringify(balances)))

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

            {/* Participants */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Participants (qui doit rembourser ?)</label>
                {form.participants.length > 0 && form.montant_total && (
                  <button type="button" className="btn btn-or btn-sm" onClick={repartirEquitablement}>
                    Répartir équitablement
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {membres.map(m => {
                  const selected = form.participants.find(p => p.membre_id === m.id)
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button"
                        onClick={() => toggleParticipant(m.id)}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                          border: selected ? '1px solid var(--or)' : '1px solid var(--or-border)',
                          background: selected ? 'var(--or-glow)' : 'transparent',
                          color: selected ? 'var(--or-pale)' : 'var(--texte-soft)',
                          transition: 'var(--transition)', fontFamily: 'var(--font-ui)',
                        }}>
                        {m.surnom}
                      </button>
                      {selected && (
                        <input type="number" min="0" step="0.01" className="form-input"
                          style={{ width: 100 }} placeholder="Part $"
                          value={selected.part_due}
                          onChange={e => updatePart(m.id, e.target.value)} />
                      )}
                    </div>
                  )
                })}
              </div>
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
        ) : depenses.map(d => {
          const isRemb = d.categorie === 'Remboursement'
          return (
            <div key={d.id} style={{
              padding: '16px 0',
              borderBottom: '1px solid rgba(201,168,76,0.07)',
              opacity: isRemb ? 0.75 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: isRemb ? '#5cba8a' : 'var(--texte)' }}>
                    {isRemb ? '↩ ' : ''}{d.description || d.categorie}
                  </span>
                  <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--texte-soft)' }}>
                    {d.categorie} · Payé par <strong style={{ color: isRemb ? '#5cba8a' : 'var(--or)' }}>{d.membres?.surnom}</strong> · {new Date(d.date_depense).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--font-corps)', fontSize: 18, color: isRemb ? '#5cba8a' : 'var(--or-pale)', fontWeight: 600 }}>
                  {isRemb ? '↩ ' : ''}{fmt(d.montant_total)}
                </span>
              </div>
              {!isRemb && d.depense_participants?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {d.depense_participants.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
                      background: p.rembourse ? 'rgba(42,110,74,0.1)' : 'rgba(139,26,26,0.1)',
                      border: `1px solid ${p.rembourse ? 'rgba(42,110,74,0.3)' : 'rgba(139,26,26,0.3)'}`,
                      borderRadius: 20, fontSize: 12,
                    }}>
                      <span style={{ color: p.rembourse ? '#5cba8a' : '#e05555' }}>
                        {p.membres?.surnom} — {fmt(p.part_due)}
                      </span>
                      {!p.rembourse && (
                        <button type="button"
                          onClick={() => marquerRembourse(p.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5cba8a', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                          title="Marquer remboursé">✓</button>
                      )}
                      {p.rembourse && <span style={{ color: '#5cba8a', fontSize: 11 }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
