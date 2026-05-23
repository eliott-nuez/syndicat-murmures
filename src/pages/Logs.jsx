import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const PAGE_SIZE = 50

const ACTION_STYLE = {
  ajout:   { color: '#4ade80', label: 'Ajout',   symbol: '+' },
  retrait: { color: '#f87171', label: 'Retrait',  symbol: '−' },
}

function fmt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export default function Logs() {
  const [logs, setLogs]           = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(true)

  // Filtres
  const [filtreCoffre, setFiltreCoffre]   = useState('')
  const [filtreAction, setFiltreAction]   = useState('')
  const [filtreMembre, setFiltreMembre]   = useState('')
  const [filtreRessource, setFiltreRessource] = useState('')

  // Listes pour les selects
  const [coffres, setCoffres]     = useState([])
  const [membres, setMembres]     = useState([])

  useEffect(() => {
    supabase.from('coffres').select('id, lieu').order('lieu')
      .then(({ data }) => setCoffres(data || []))
    supabase.from('membres').select('id, surnom').order('surnom')
      .then(({ data }) => setMembres(data || []))
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('logs_mouvements')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filtreCoffre)   q = q.eq('coffre_id', filtreCoffre)
    if (filtreAction)   q = q.eq('action', filtreAction)
    if (filtreMembre)   q = q.eq('membre_surnom', filtreMembre)
    if (filtreRessource) q = q.ilike('ressource_nom', `%${filtreRessource}%`)

    const { data, count } = await q
    setLogs(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filtreCoffre, filtreAction, filtreMembre, filtreRessource])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const resetFiltres = () => {
    setFiltreCoffre('')
    setFiltreAction('')
    setFiltreMembre('')
    setFiltreRessource('')
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const selectStyle = {
    background: 'var(--noir-card)',
    border: '1px solid var(--or-border)',
    borderRadius: 6,
    color: 'var(--texte)',
    padding: '7px 10px',
    fontSize: 12,
    letterSpacing: '0.05em',
    cursor: 'pointer',
    minWidth: 140,
  }

  const inputStyle = {
    ...selectStyle,
    minWidth: 160,
  }

  return (
    <div>
      {/* ── En-tête ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: 'var(--font-titre)', fontSize: 22,
          letterSpacing: '0.15em', color: 'var(--or)', marginBottom: 6,
        }}>
          Logs des mouvements
        </h1>
        <p style={{ fontSize: 12, color: 'var(--texte-soft)', letterSpacing: '0.08em' }}>
          Historique de tous les dépôts et retraits enregistrés par le bot.
        </p>
      </div>

      {/* ── Filtres ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20,
        padding: '14px 16px', background: 'var(--noir-card)',
        border: '1px solid var(--or-border)', borderRadius: 8,
        alignItems: 'center',
      }}>
        <select value={filtreCoffre} onChange={e => { setFiltreCoffre(e.target.value); setPage(0) }} style={selectStyle}>
          <option value=''>Tous les coffres</option>
          {coffres.map(c => <option key={c.id} value={c.id}>{c.lieu}</option>)}
        </select>

        <select value={filtreAction} onChange={e => { setFiltreAction(e.target.value); setPage(0) }} style={selectStyle}>
          <option value=''>Ajout + Retrait</option>
          <option value='ajout'>Ajout</option>
          <option value='retrait'>Retrait</option>
        </select>

        <select value={filtreMembre} onChange={e => { setFiltreMembre(e.target.value); setPage(0) }} style={selectStyle}>
          <option value=''>Tous les membres</option>
          {membres.map(m => <option key={m.id} value={m.surnom}>{m.surnom}</option>)}
        </select>

        <input
          type='text'
          placeholder='Rechercher une ressource…'
          value={filtreRessource}
          onChange={e => { setFiltreRessource(e.target.value); setPage(0) }}
          style={inputStyle}
        />

        {(filtreCoffre || filtreAction || filtreMembre || filtreRessource) && (
          <button onClick={resetFiltres} className='btn btn-danger' style={{ fontSize: 11, padding: '6px 12px' }}>
            ✕ Réinitialiser
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texte-soft)' }}>
          {total} entrée{total > 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Tableau ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--texte-soft)', fontSize: 13 }}>
          Chargement…
        </div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--texte-soft)', fontSize: 13 }}>
          Aucun log trouvé.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--or-border)' }}>
                {['Date', 'Membre', 'Action', 'Quantité', 'Ressource', 'Coffre'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '10px 14px',
                    fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                    color: 'var(--or)', fontWeight: 600,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const act = ACTION_STYLE[log.action] || { color: 'var(--texte)', label: log.action, symbol: '' }
                const isRecovery = log.is_recovery
                return (
                  <tr key={log.id} style={{
                    borderBottom: '1px solid rgba(201,168,76,0.08)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    opacity: isRecovery ? 0.75 : 1,
                  }}>
                    {/* Date */}
                    <td style={{ padding: '10px 14px', color: 'var(--texte-soft)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {fmt(log.created_at)}
                      {isRecovery && (
                        <span style={{
                          marginLeft: 6, fontSize: 9, letterSpacing: '0.1em',
                          color: 'var(--or)', border: '1px solid var(--or-border)',
                          borderRadius: 4, padding: '1px 4px',
                        }}>RATTRAPAGE</span>
                      )}
                    </td>

                    {/* Membre */}
                    <td style={{ padding: '10px 14px', color: 'var(--or-pale)', fontWeight: 500 }}>
                      {log.membre_surnom || (
                        <span style={{ color: 'var(--texte-soft)', fontStyle: 'italic', fontSize: 11 }}>
                          {log.personnage_nom || '—'}
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px', borderRadius: 4, fontSize: 11,
                        fontWeight: 600, letterSpacing: '0.08em',
                        color: act.color,
                        background: act.color + '1a',
                        border: `1px solid ${act.color}44`,
                      }}>
                        {act.label}
                      </span>
                    </td>

                    {/* Quantité */}
                    <td style={{ padding: '10px 14px', color: act.color, fontWeight: 700, fontFamily: 'monospace' }}>
                      {act.symbol}{log.quantite}
                    </td>

                    {/* Ressource */}
                    <td style={{ padding: '10px 14px', color: 'var(--texte)' }}>
                      {log.ressource_nom}
                      <span style={{
                        marginLeft: 6, fontSize: 9, letterSpacing: '0.08em',
                        color: log.ressource_type === 'drogue' ? '#c084fc' : '#67e8f9',
                        opacity: 0.8,
                      }}>
                        {log.ressource_type === 'drogue' ? '🌿' : '🔧'}
                      </span>
                    </td>

                    {/* Coffre */}
                    <td style={{ padding: '10px 14px', color: 'var(--texte-soft)' }}>
                      {log.coffre_nom}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24, alignItems: 'center' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className='btn'
            style={{ padding: '6px 14px', fontSize: 12, opacity: page === 0 ? 0.4 : 1 }}
          >
            ← Précédent
          </button>
          <span style={{ fontSize: 12, color: 'var(--texte-soft)', padding: '0 8px' }}>
            Page {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className='btn'
            style={{ padding: '6px 14px', fontSize: 12, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  )
}
