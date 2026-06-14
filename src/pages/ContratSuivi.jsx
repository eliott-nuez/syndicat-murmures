import ContratsSuiviTable from '../components/ContratsSuiviTable'

export default function ContratSuivi() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-titre)', fontSize: 11, letterSpacing: '0.25em', color: 'var(--or-sombre)', marginBottom: 6 }}>Contrats</div>
        <h1 style={{ fontFamily: 'var(--font-titre)', fontSize: 24, color: 'var(--or-pale)', letterSpacing: '0.05em' }}>Suivi de la semaine</h1>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--texte-soft)' }}>
          Clique sur un jour pour indiquer si le contrat a été honoré, partiellement honoré, ou pas du tout.
        </p>
      </div>

      <div className="card">
        <ContratsSuiviTable />
      </div>
    </div>
  )
}
