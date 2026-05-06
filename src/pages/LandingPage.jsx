import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bleu-nuit)', color: 'var(--texte)' }}>

      {/* ── Nav ── */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '22px 60px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky',
        top: 0,
        background: 'rgba(13,17,23,0.95)',
        backdropFilter: 'blur(12px)',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 28, height: 28,
            background: 'linear-gradient(135deg, #1a3a6e, #2a5cb8)',
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#fff',
          }}>◈</div>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 15, color: '#e8ecf4' }}>
            Los Santos Consulting
          </span>
        </div>
        <div style={{ display: 'flex', gap: 40 }}>
          {['Accueil', 'Services', 'À propos', 'Contact'].map(l => (
            <a key={l} href="/" style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.04em',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.target.style.color = '#fff'}
            onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.55)'}
            >{l}</a>
          ))}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 73px)',
        textAlign: 'center',
        padding: '0 20px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Fond subtil */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(26,53,110,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <p style={{
          fontSize: 11,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)',
          marginBottom: 28,
        }}>Cabinet de Conseil — Los Santos</p>

        <h1 style={{
          fontFamily: 'var(--font-ui)',
          fontWeight: 700,
          fontSize: 'clamp(36px, 5vw, 64px)',
          color: '#f0f4ff',
          lineHeight: 1.15,
          maxWidth: 700,
          marginBottom: 24,
        }}>
          Des solutions discrètes<br />
          pour des{' '}
          {/* ── MOT SECRET ── discret, légèrement différent, cliquable */}
          <span
            onClick={() => navigate('/login')}
            title=""
            style={{
              color: 'rgba(150,170,210,0.7)',
              cursor: 'default',
              borderBottom: '1px solid rgba(150,170,210,0.2)',
              paddingBottom: 1,
              transition: 'color 0.3s',
            }}
            onMouseEnter={e => {
              e.target.style.color = 'rgba(180,200,240,0.9)'
              e.target.style.cursor = 'default'
            }}
            onMouseLeave={e => e.target.style.color = 'rgba(150,170,210,0.7)'}
          >murmures</span>
          {' '}qui comptent.
        </h1>

        <p style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.4)',
          maxWidth: 460,
          lineHeight: 1.8,
          marginBottom: 48,
        }}>
          Los Santos Consulting accompagne les entrepreneurs ambitieux dans
          leurs projets les plus sensibles. Confidentialité garantie.
        </p>

        <div style={{ display: 'flex', gap: 16 }}>
          <a href="#services" style={{
            padding: '13px 30px',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4,
            fontSize: 13,
            color: 'rgba(255,255,255,0.8)',
            letterSpacing: '0.05em',
            transition: '0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.11)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
          >Nos services</a>
          <a href="#contact" style={{
            padding: '13px 30px',
            background: 'rgba(255,255,255,0.13)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            fontSize: 13,
            color: '#fff',
            letterSpacing: '0.05em',
            fontWeight: 500,
            transition: '0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.13)'}
          >Nous contacter</a>
        </div>
      </section>

      {/* ── Services ── */}
      <section id="services" style={{ padding: '100px 60px', background: 'rgba(0,0,0,0.3)' }}>
        <p style={{ textAlign:'center', fontSize:10, letterSpacing:'0.25em', textTransform:'uppercase', color:'rgba(255,255,255,0.25)', marginBottom:12 }}>
          Nos domaines d'expertise
        </p>
        <h2 style={{ textAlign:'center', fontFamily:'var(--font-ui)', fontWeight:600, fontSize:28, color:'#e8ecf4', marginBottom:60 }}>
          Services
        </h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24, maxWidth:960, margin:'0 auto' }}>
          {[
            { titre:'Conseil stratégique', desc:'Accompagnement sur mesure pour vos projets d\'expansion et de restructuration.' },
            { titre:'Gestion patrimoniale', desc:'Optimisation et valorisation de vos actifs dans un cadre confidentiel et sécurisé.' },
            { titre:'Relations institutionnelles', desc:'Facilitation de vos relations avec les acteurs clés de Los Santos et environs.' },
          ].map(s => (
            <div key={s.titre} style={{
              background:'rgba(255,255,255,0.03)',
              border:'1px solid rgba(255,255,255,0.07)',
              borderRadius:6,
              padding:'28px 24px',
            }}>
              <h3 style={{ fontSize:15, fontWeight:600, color:'#e0e6f5', marginBottom:12 }}>{s.titre}</h3>
              <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', lineHeight:1.7 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── À propos ── */}
      <section id="a-propos" style={{ padding:'80px 60px', maxWidth:760, margin:'0 auto', textAlign:'center' }}>
        <h2 style={{ fontFamily:'var(--font-ui)', fontWeight:600, fontSize:24, color:'#e8ecf4', marginBottom:20 }}>
          À propos
        </h2>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.38)', lineHeight:1.9 }}>
          Fondé à Los Santos, notre cabinet opère dans la plus grande discrétion depuis des années.
          Nous sélectionnons rigoureusement nos partenaires et clients. Chaque engagement est traité avec
          un niveau d'exigence et de confidentialité irréprochable. Nos résultats parlent pour nous.
        </p>
      </section>

      {/* ── Contact ── */}
      <section id="contact" style={{ padding:'80px 60px', background:'rgba(0,0,0,0.2)', textAlign:'center' }}>
        <h2 style={{ fontFamily:'var(--font-ui)', fontWeight:600, fontSize:24, color:'#e8ecf4', marginBottom:12 }}>
          Contact
        </h2>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', marginBottom:8 }}>contact@lsconsulting.ls</p>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)' }}>Bureau : Rockford Hills, Los Santos</p>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        padding: '20px 60px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize:12, color:'rgba(255,255,255,0.2)' }}>
          © 2026 Los Santos Consulting — Tous droits réservés.
        </span>
        <span style={{ fontSize:12, color:'rgba(255,255,255,0.2)' }}>Mentions légales</span>
      </footer>
    </div>
  )
}