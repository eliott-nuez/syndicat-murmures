// Vercel serverless function — /api/bot-control
// Relaie les commandes vers le serveur de contrôle du VPS
// Sécurité : CONTROL_TOKEN secret côté serveur, jamais exposé au client

const ALLOWED_ACTIONS = ['bot-restart', 'bot-status', 'bot-reset-status', 'bot-logs']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { action } = req.body ?? {}

  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({ error: 'Action invalide' })
  }

  const vpsUrl = `http://${process.env.VPS_IP}:${process.env.VPS_CONTROL_PORT}/${action}?token=${process.env.CONTROL_TOKEN}`

  try {
    const response = await fetch(vpsUrl)
    const data = await response.json()
    return res.status(response.ok ? 200 : 500).json(data)
  } catch (err) {
    return res.status(503).json({ error: 'VPS injoignable', detail: err.message })
  }
}
