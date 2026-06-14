import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function LoginPage() {
  const navigate = useNavigate()
  const [surnom, setSurnom]   = useState('')
  const [mdp, setMdp]         = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Authentification via Supabase Auth
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: `${surnom.trim().toLowerCase()}@sdm.local`,
      password: mdp,
    })

    if (authErr) {
      setLoading(false)
      setError('Identifiants incorrects ou compte inactif.')
      return
    }

    // Récupérer les données du membre
    const { data, error: err } = await supabase
      .from('membres')
      .select('*')
      .ilike('surnom', surnom.trim())
      .single()

    setLoading(false)

    if (err || !data) {
      await supabase.auth.signOut()
      setError('Identifiants incorrects ou compte inactif.')
      return
    }

    // Marquer le membre comme connecté
    await supabase.from('membres').update({ actif: true }).eq('id', data.id)
    localStorage.setItem('sdm_membre', JSON.stringify({ ...data, actif: true }))
    navigate('/dashboard')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--noir)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 50% 60% at 50% 40%, rgba(201,168,76,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            fontFamily: 'var(--font-titre)',
            fontSize: 11,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: 'var(--or-sombre)',
            marginBottom: 10,
          }}>Accès confidentiel</div>
          <div style={{
            fontFamily: 'var(--font-titre)',
            fontSize: 22,
            letterSpacing: '0.12em',
            color: 'var(--or)',
          }}>Le Syndicat des Murmures</div>
          <div style={{
            width: 60, height: 1,
            background: 'linear-gradient(90deg, transparent, var(--or), transparent)',
            margin: '16px auto 0',
          }} />
        </div>

        {/* Formulaire */}
        <div style={{
          background: 'var(--noir-card)',
          border: '1px solid var(--or-border)',
          borderRadius: 8,
          padding: '36px 32px',
        }}>
          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="form-group">
              <label className="form-label">Surnom</label>
              <input
                className="form-input"
                type="text"
                placeholder="Votre surnom"
                value={surnom}
                onChange={e => setSurnom(e.target.value.toLowerCase())}
                required
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mot de passe</label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={mdp}
                onChange={e => setMdp(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-solid"
              disabled={loading}
              style={{ justifyContent: 'center', marginTop: 8, padding: '13px 20px', fontSize: 12 }}
            >
              {loading ? 'Vérification...' : 'Entrer'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <a href="/" style={{ fontSize: 11, color: 'var(--texte-soft)', letterSpacing: '0.1em' }}>
            ← Retour au site
          </a>
        </div>
      </div>
    </div>
  )
}
