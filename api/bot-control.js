// Vercel serverless function — /api/bot-control
// Relaie les commandes vers le serveur de contrôle du VPS
// Réservé à la Direction (vérifié via Supabase)

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
)

const ALLOWED_ACTIONS = ['bot-restart', 'bot-status', 'bot-logs']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { action, membre_id } = req.body ?? {}

  // Vérifie que l'action est connue
  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({ error: 'Action invalide' })
  }

  // Vérifie que le membre est Direction
  const { data: membre } = await supabase
    .from('membres')
    .select('rang')
    .eq('id', membre_id)
    .maybeSingle()

  if (!membre || membre.rang !== 'direction') {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  // Appelle le VPS
  const vpsUrl = `http://${process.env.VPS_IP}:${process.env.VPS_CONTROL_PORT}/${action}?token=${process.env.CONTROL_TOKEN}`

  try {
    const response = await fetch(vpsUrl)
    const data = await response.json()
    return res.status(response.ok ? 200 : 500).json(data)
  } catch (err) {
    return res.status(503).json({ error: 'VPS injoignable', detail: err.message })
  }
}
