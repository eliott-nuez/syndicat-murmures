export default function Armurerie() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>Stock</div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>Armurerie</h1>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 18, color: 'var(--or-pale)', letterSpacing: '0.08em', marginBottom: 8 }}>
          Work in progress
        </div>
        <div style={{ fontSize: 13, color: 'var(--texte-soft)' }}>
          La gestion de l'armurerie arrive bientôt.
        </div>
      </div>
    </div>
  )
}
