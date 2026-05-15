import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const OP_LABELS = {
  ajouter:  'Ajouter',
  retirer:  'Retirer',
  deplacer: 'Déplacer',
  coffre:   'Nouveau coffre',
}

export default function Stock() {
  const [stockTotal, setStockTotal]           = useState([])
  const [stockConsoTotal, setStockConsoTotal] = useState([])
  const [coffres, setCoffres]                 = useState([])
  const [coffreStock, setCoffreStock]         = useState([])
  const [consoStock, setConsoStock]           = useState([])
  const [drogues, setDrogues]                 = useState([])
  const [consommables, setConsommables]       = useState([])
  const [filtreDrogue, setFiltreDrogue]       = useState('')
  const [filtreLieu, setFiltreLieu]           = useState('')
  const [loading, setLoading]                 = useState(true)
  const [saving, setSaving]                   = useState(false)
  const [msg, setMsg]                         = useState({ type: '', text: '' })

  // 'drogue' | 'consommable' — type d'article géré dans le formulaire
  const [typeArticle, setTypeArticle] = useState('drogue')
  const [op, setOp]   = useState(null)
  const [form, setForm] = useState({
    coffre_id: '', coffre_src: '', coffre_dst: '',
    drogue_id: '', consommable_id: '', quantite: '',
    nom: '', lieu: '',
  })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: st }, { data: cof }, { data: cs }, { data: dr }, { data: con }, { data: conSt }] = await Promise.all([
      supabase.from('stock_total').select('*').order('drogue'),
      supabase.from('coffres').select('*').order('lieu'),
      supabase.from('coffre_stock').select('*, drogues(nom), coffres(nom, lieu)').order('updated_at', { ascending: false }),
      supabase.from('drogues').select('*').order('nom'),
      supabase.from('consommables').select('*').eq('actif', true).order('nom'),
      supabase.from('consommable_stock').select('*, consommables(nom, cout), coffres(nom, lieu)').order('updated_at', { ascending: false }),
    ])
    setStockTotal(st || [])
    setCoffres(cof || [])
    setCoffreStock(cs || [])
    setDrogues(dr || [])
    setConsommables(con || [])
    setConsoStock(conSt || [])

    // Totaux consommables par type
    const consoTotaux = {}
    ;(conSt || []).forEach(e => {
      const id = e.consommable_id
      if (!consoTotaux[id]) consoTotaux[id] = { ...e.consommables, id, quantite_totale: 0 }
      consoTotaux[id].quantite_totale += e.quantite
    })
    setStockConsoTotal(Object.values(consoTotaux))

    setLoading(false)
  }

  const resetForm = () => setForm({ coffre_id: '', coffre_src: '', coffre_dst: '', drogue_id: '', consommable_id: '', quantite: '', nom: '', lieu: '' })

  // ── Helpers coffre_stock (drogues) ──
  const getCoffreEntry = async (coffre_id, drogue_id) => {
    const { data } = await supabase.from('coffre_stock').select('id, quantite').eq('coffre_id', coffre_id).eq('drogue_id', drogue_id).maybeSingle()
    return data
  }
  const upsertEntry = async (coffre_id, drogue_id, delta) => {
    const existing = await getCoffreEntry(coffre_id, drogue_id)
    if (existing) {
      await supabase.from('coffre_stock').update({ quantite: Math.max(0, existing.quantite + delta) }).eq('id', existing.id)
    } else if (delta > 0) {
      await supabase.from('coffre_stock').insert({ coffre_id, drogue_id, quantite: delta })
    }
  }

  // ── Helpers consommable_stock ──
  const getConsoEntry = async (coffre_id, consommable_id) => {
    const { data } = await supabase.from('consommable_stock').select('id, quantite').eq('coffre_id', coffre_id).eq('consommable_id', consommable_id).maybeSingle()
    return data
  }
  const upsertConso = async (coffre_id, consommable_id, delta) => {
    const existing = await getConsoEntry(coffre_id, consommable_id)
    if (existing) {
      await supabase.from('consommable_stock').update({ quantite: Math.max(0, existing.quantite + delta), updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else if (delta > 0) {
      await supabase.from('consommable_stock').insert({ coffre_id, consommable_id, quantite: delta })
    }
  }

  const handleOp = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    const qty = parseInt(form.quantite) || 0

    try {
      if (op === 'coffre') {
        const { error } = await supabase.from('coffres').insert({ nom: form.nom, lieu: form.lieu })
        if (error) throw error
        setMsg({ type: 'success', text: `Coffre "${form.nom}" créé.` })

      } else if (typeArticle === 'drogue') {
        if (op === 'ajouter') {
          await upsertEntry(form.coffre_id, form.drogue_id, qty)
          setMsg({ type: 'success', text: `${qty} unité(s) ajoutée(s).` })
        } else if (op === 'retirer') {
          await upsertEntry(form.coffre_id, form.drogue_id, -qty)
          setMsg({ type: 'success', text: `${qty} unité(s) retirée(s).` })
        } else if (op === 'deplacer') {
          await upsertEntry(form.coffre_src, form.drogue_id, -qty)
          await upsertEntry(form.coffre_dst, form.drogue_id, qty)
          setMsg({ type: 'success', text: `${qty} unité(s) déplacée(s).` })
        }

      } else {
        // consommable
        if (op === 'ajouter') {
          await upsertConso(form.coffre_id, form.consommable_id, qty)
          setMsg({ type: 'success', text: `${qty} unité(s) ajoutée(s).` })
        } else if (op === 'retirer') {
          await upsertConso(form.coffre_id, form.consommable_id, -qty)
          setMsg({ type: 'success', text: `${qty} unité(s) retirée(s).` })
        } else if (op === 'deplacer') {
          await upsertConso(form.coffre_src, form.consommable_id, -qty)
          await upsertConso(form.coffre_dst, form.consommable_id, qty)
          setMsg({ type: 'success', text: `${qty} unité(s) déplacée(s).` })
        }
      }

      resetForm()
      fetchAll()
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Erreur.' })
    }
    setSaving(false)
  }

  const fmt = (v) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

  const statutStock = (qte, seuil) => {
    if (qte <= 0)           return { label: 'Vide',     cls: 'badge-rouge' }
    if (qte <= seuil)       return { label: 'Critique', cls: 'badge-rouge' }
    if (qte <= seuil * 1.5) return { label: 'Bas',      cls: 'badge-orange' }
    return                         { label: 'OK',        cls: 'badge-vert' }
  }

  const valeurTotale   = stockTotal.reduce((s, d) => s + (d.quantite_totale * d.prix_revient), 0)
  const valeurConso    = stockConsoTotal.reduce((s, c) => s + ((c.quantite_totale || 0) * (c.cout || 0)), 0)
  const coffresFiltres = coffreStock.filter(cs => {
    if (filtreDrogue && cs.drogue_id !== filtreDrogue) return false
    if (filtreLieu   && cs.coffres?.lieu !== filtreLieu) return false
    return true
  })
  const lieux = [...new Set(coffreStock.map(cs => cs.coffres?.lieu).filter(Boolean))]

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>
            Responsable / Direction
          </div>
          <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>
            Gestion du stock
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(OP_LABELS).map(([key, label]) => (
            <button key={key} className={`btn ${op === key ? 'btn-solid' : 'btn-or'}`}
              onClick={() => { setOp(op === key ? null : key); resetForm(); setMsg({ type: '', text: '' }) }}>
              {op === key ? `✕ ${label}` : `+ ${label}`}
            </button>
          ))}
        </div>
      </div>

      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}

      {/* ── Formulaire opération ── */}
      {op && (
        <div className="card">
          <div className="card-title">{OP_LABELS[op]}</div>
          <form onSubmit={handleOp}>
            <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>

              {/* Toggle drogue / consommable */}
              {op !== 'coffre' && (
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Type d'article</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button"
                      className={`btn btn-sm ${typeArticle === 'drogue' ? 'btn-solid' : 'btn-or'}`}
                      onClick={() => { setTypeArticle('drogue'); setForm(f => ({ ...f, drogue_id: '', consommable_id: '' })) }}>
                      Drogue
                    </button>
                    <button type="button"
                      className={`btn btn-sm ${typeArticle === 'consommable' ? 'btn-solid' : 'btn-or'}`}
                      onClick={() => { setTypeArticle('consommable'); setForm(f => ({ ...f, drogue_id: '', consommable_id: '' })) }}>
                      Consommable
                    </button>
                  </div>
                </div>
              )}

              {/* Coffre(s) */}
              {(op === 'ajouter' || op === 'retirer') && (
                <div className="form-group">
                  <label className="form-label">Coffre</label>
                  <select className="form-select" required value={form.coffre_id}
                    onChange={e => setForm({ ...form, coffre_id: e.target.value })}>
                    <option value="">— Sélectionner —</option>
                    {coffres.map(c => <option key={c.id} value={c.id}>{c.lieu}</option>)}
                  </select>
                </div>
              )}
              {op === 'deplacer' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Coffre source</label>
                    <select className="form-select" required value={form.coffre_src}
                      onChange={e => setForm({ ...form, coffre_src: e.target.value })}>
                      <option value="">— Sélectionner —</option>
                      {coffres.map(c => <option key={c.id} value={c.id}>{c.lieu}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Coffre destination</label>
                    <select className="form-select" required value={form.coffre_dst}
                      onChange={e => setForm({ ...form, coffre_dst: e.target.value })}>
                      <option value="">— Sélectionner —</option>
                      {coffres.filter(c => c.id !== form.coffre_src).map(c => (
                        <option key={c.id} value={c.id}>{c.nom} ({c.lieu})</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Article + quantité */}
              {op !== 'coffre' && typeArticle === 'drogue' && (
                <div className="form-group">
                  <label className="form-label">Drogue</label>
                  <select className="form-select" required value={form.drogue_id}
                    onChange={e => setForm({ ...form, drogue_id: e.target.value })}>
                    <option value="">— Sélectionner —</option>
                    {drogues.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                  </select>
                </div>
              )}
              {op !== 'coffre' && typeArticle === 'consommable' && (
                <div className="form-group">
                  <label className="form-label">Consommable</label>
                  <select className="form-select" required value={form.consommable_id}
                    onChange={e => setForm({ ...form, consommable_id: e.target.value })}>
                    <option value="">— Sélectionner —</option>
                    {consommables.map(c => <option key={c.id} value={c.id}>{c.nom} ({fmt(c.cout)})</option>)}
                  </select>
                </div>
              )}
              {op !== 'coffre' && (
                <div className="form-group">
                  <label className="form-label">Quantité</label>
                  <input className="form-input" type="number" min="1" required placeholder="Ex : 10"
                    value={form.quantite}
                    onChange={e => setForm({ ...form, quantite: e.target.value })} />
                </div>
              )}

              {/* Nouveau coffre */}
              {op === 'coffre' && (
                <div className="form-group">
                  <label className="form-label">Nom du lieu / propriété</label>
                  <input className="form-input" required placeholder="Ex : Entrepôt Chumash"
                    value={form.lieu}
                    onChange={e => setForm({ ...form, lieu: e.target.value, nom: e.target.value })} />
                </div>
              )}
            </div>
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Valider'}
            </button>
          </form>
        </div>
      )}

      {/* Stats */}
      <div className="grid-4">
        <div className="stat-box">
          <span className="stat-label">Valeur drogues</span>
          <span className="stat-value">{fmt(valeurTotale)}</span>
          <span className="stat-sub">Au prix de revient</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Valeur consommables</span>
          <span className="stat-value">{fmt(valeurConso)}</span>
          <span className="stat-sub">Au coût d'achat</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Types de drogues</span>
          <span className="stat-value">{stockTotal.length}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Alertes stock</span>
          <span className="stat-value" style={{ color: '#e05555' }}>
            {stockTotal.filter(d => d.alerte_stock).length}
          </span>
        </div>
      </div>

      {/* ── Inventaire drogues ── */}
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 13, letterSpacing: '0.15em', color: 'var(--or)', textTransform: 'uppercase', marginBottom: 12 }}>
          Drogues
        </div>
        <div className="card">
          <div className="card-title">Inventaire global</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Drogue</th>
                  <th>Quantité</th>
                  <th>Seuil alerte</th>
                  <th>Statut</th>
                  <th>Prix revient</th>
                  <th>Valeur totale</th>
                </tr>
              </thead>
              <tbody>
                {stockTotal.map(d => {
                  const stat = statutStock(d.quantite_totale, d.seuil_alerte)
                  return (
                    <tr key={d.drogue_id}>
                      <td style={{ fontWeight: 500 }}>{d.drogue}</td>
                      <td>{d.quantite_totale}</td>
                      <td style={{ color: 'var(--texte-soft)' }}>{d.seuil_alerte}</td>
                      <td><span className={`badge ${stat.cls}`}>{stat.label}</span></td>
                      <td>{fmt(d.prix_revient)}</td>
                      <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt(d.quantite_totale * d.prix_revient)}</td>
                    </tr>
                  )
                })}
                {stockTotal.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--texte-soft)', padding: 20 }}>Aucun stock de drogue.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Inventaire consommables ── */}
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 13, letterSpacing: '0.15em', color: 'var(--or)', textTransform: 'uppercase', marginBottom: 12 }}>
          Consommables
        </div>
        <div className="card">
          <div className="card-title">Inventaire global</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Consommable</th>
                  <th>Quantité</th>
                  <th>Coût unitaire</th>
                  <th>Valeur totale</th>
                </tr>
              </thead>
              <tbody>
                {stockConsoTotal.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.nom}</td>
                    <td style={{ color: c.quantite_totale <= 0 ? '#e05555' : 'var(--texte)' }}>{c.quantite_totale}</td>
                    <td style={{ color: 'var(--texte-soft)' }}>{fmt(c.cout)}</td>
                    <td style={{ color: 'var(--or-pale)', fontWeight: 600 }}>{fmt((c.quantite_totale || 0) * (c.cout || 0))}</td>
                  </tr>
                ))}
                {stockConsoTotal.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--texte-soft)', padding: 20 }}>Aucun consommable en stock.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Stock par coffre — drogues */}
      <div className="card">
        <div className="card-title">Stock drogues par coffre</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Drogue</label>
            <select className="form-select" style={{ minWidth: 160 }}
              value={filtreDrogue} onChange={e => setFiltreDrogue(e.target.value)}>
              <option value="">Toutes</option>
              {drogues.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Lieu</label>
            <select className="form-select" style={{ minWidth: 180 }}
              value={filtreLieu} onChange={e => setFiltreLieu(e.target.value)}>
              <option value="">Tous</option>
              {lieux.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {(filtreDrogue || filtreLieu) && (
            <button className="btn btn-or btn-sm" onClick={() => { setFiltreDrogue(''); setFiltreLieu('') }}>
              ✕ Réinitialiser
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Lieu</th><th>Coffre</th><th>Drogue</th><th>Quantité</th><th>Mise à jour</th></tr></thead>
            <tbody>
              {coffresFiltres.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--texte-soft)', padding: 20 }}>Aucun résultat</td></tr>
              ) : coffresFiltres.map(cs => (
                <tr key={cs.id}>
                  <td style={{ color: 'var(--texte-soft)' }}>{cs.coffres?.lieu || '—'}</td>
                  <td>{cs.coffres?.nom || '—'}</td>
                  <td>{cs.drogues?.nom || '—'}</td>
                  <td style={{ color: cs.quantite <= 0 ? '#e05555' : 'var(--texte)' }}>{cs.quantite}</td>
                  <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                    {new Date(cs.updated_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock par coffre — consommables */}
      {consoStock.length > 0 && (
        <div className="card">
          <div className="card-title">Stock consommables par coffre</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lieu</th><th>Coffre</th><th>Consommable</th><th>Quantité</th><th>Mise à jour</th></tr></thead>
              <tbody>
                {consoStock.map(cs => (
                  <tr key={cs.id}>
                    <td style={{ color: 'var(--texte-soft)' }}>{cs.coffres?.lieu || '—'}</td>
                    <td>{cs.coffres?.nom || '—'}</td>
                    <td>{cs.consommables?.nom || '—'}</td>
                    <td style={{ color: cs.quantite <= 0 ? '#e05555' : 'var(--texte)' }}>{cs.quantite}</td>
                    <td style={{ color: 'var(--texte-soft)', fontSize: 12 }}>
                      {new Date(cs.updated_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
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
