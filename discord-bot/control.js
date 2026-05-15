require('dotenv').config()
const http = require('http')
const { execSync } = require('child_process')

const TOKEN = process.env.CONTROL_TOKEN
const PORT  = process.env.CONTROL_PORT || 3001

if (!TOKEN) { console.error('CONTROL_TOKEN manquant'); process.exit(1) }

function getBotStatus() {
  const raw = execSync('pm2 jlist').toString()
  const list = JSON.parse(raw)
  const bot  = list.find(p => p.name === 'sdm-bot')
  if (!bot) return { etat: 'KO', detail: 'Processus introuvable' }

  const status = bot.pm2_env?.status
  const restarts = bot.pm2_env?.restart_time ?? 0
  const uptime = bot.pm2_env?.pm_uptime
    ? Math.floor((Date.now() - bot.pm2_env.pm_uptime) / 60000)
    : null

  if (status === 'online') {
    const detail = uptime !== null ? `depuis ${uptime} min — ${restarts} redémarrage(s)` : `${restarts} redémarrage(s)`
    return { etat: restarts > 5 ? 'Problème' : 'OK', detail }
  }
  return { etat: 'KO', detail: `Statut PM2 : ${status}` }
}

const ACTIONS = {
  'bot-restart': () => {
    execSync('pm2 restart sdm-bot')
    return { message: 'Bot redémarré' }
  },
  'bot-status': () => getBotStatus(),
  'bot-logs':   () => ({ logs: execSync('pm2 logs sdm-bot --lines 20 --nostream').toString() }),
}

http.createServer((req, res) => {
  const url    = new URL(req.url, `http://localhost:${PORT}`)
  const token  = url.searchParams.get('token')
  const action = url.pathname.replace('/', '')

  res.setHeader('Content-Type', 'application/json')

  if (token !== TOKEN) {
    res.writeHead(401)
    return res.end(JSON.stringify({ error: 'Non autorisé' }))
  }

  const fn = ACTIONS[action]
  if (!fn) {
    res.writeHead(404)
    return res.end(JSON.stringify({ error: 'Action inconnue' }))
  }

  try {
    const result = fn()
    res.writeHead(200)
    res.end(JSON.stringify({ ok: true, ...result }))
  } catch (err) {
    res.writeHead(500)
    res.end(JSON.stringify({ ok: false, error: err.message }))
  }
}).listen(PORT, () => console.log(`Control server actif sur le port ${PORT}`))
