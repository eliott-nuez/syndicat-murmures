// Vercel serverless function — /api/delete-membre
// Supprime un utilisateur Supabase Auth (service role requis). La ligne
// dans la table `membres` est supprimée côté client (RLS direction).
// Variables d'env nécessaires : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { surnom } = req.body ?? {}
  if (!surnom) return res.status(400).json({ error: 'surnom requis' })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Configuration serveur manquante (SUPABASE_SERVICE_ROLE_KEY manquante)' })
  }

  const email = `${surnom.trim().toLowerCase()}@sdm.local`

  try {
    // 1. Trouver l'utilisateur Auth par email
    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    })
    const listData = await listRes.json()
    const user = (listData?.users || []).find(u => u.email === email)

    if (!user) {
      // Pas trouvé dans Auth — pas bloquant, la ligne membres peut être supprimée quand même
      return res.status(200).json({ ok: true, warning: 'Utilisateur Auth introuvable (déjà supprimé ?).' })
    }

    // 2. Supprimer l'utilisateur Auth
    const delRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    })
    if (!delRes.ok) {
      const data = await delRes.json().catch(() => ({}))
      return res.status(400).json({ error: data?.msg || data?.message || 'Erreur suppression Auth' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
