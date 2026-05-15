require('dotenv').config()
const http = require('http')
const { execSync } = require('child_process')

const TOKEN  = process.env.CONTROL_TOKEN
const PORT   = process.env.CONTROL_PORT || 3001

if (!TOKEN) { console.error('CONTROL_TOKEN manquant'); process.exit(1) }

const ACTIONS = {
  'bot-restart': () => execSync('pm2 restart sdm-bot'),
  'bot-status':  () => execSync('pm2 jlist'),
  'bot-logs':    () => execSync('pm2 logs sdm-bot --lines 20 --nostream'),
}

http.createServer((req, res) => {
  const url   = new URL(req.url, `http://localhost:${PORT}`)
  const token = url.searchParams.get('token')
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
    const output = fn()?.toString() ?? 'ok'
    res.writeHead(200)
    res.end(JSON.stringify({ ok: true, output }))
  } catch (err) {
    res.writeHead(500)
    res.end(JSON.stringify({ ok: false, error: err.message }))
  }
}).listen(PORT, () => console.log(`Control server actif sur le port ${PORT}`))
