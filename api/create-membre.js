// Vercel serverless function — /api/create-membre
// Crée un utilisateur dans Supabase Auth (service role requis)
// Variables d'env nécessaires : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { surnom, password } = req.body ?? {}

  if (!surnom || !password) {
    return res.status(400).json({ error: 'surnom et password requis' })
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' })
  }

  // Accepte SUPABASE_URL ou REACT_APP_SUPABASE_URL (déjà présent sur Vercel)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Configuration serveur manquante (SUPABASE_SERVICE_ROLE_KEY manquante)' })
  }

  const email = `${surnom.trim().toLowerCase()}@sdm.local`

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,   // pas besoin de validation par email
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      // Si l'utilisateur existe déjà dans Auth, ce n'est pas bloquant
      if (data?.msg?.includes('already registered') || data?.code === 'email_exists') {
        return res.status(200).json({ ok: true, warning: 'User Auth déjà existant, mis à jour.' })
      }
      return res.status(400).json({ error: data?.msg || data?.message || 'Erreur création Auth' })
    }

    return res.status(200).json({ ok: true, user_id: data.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
