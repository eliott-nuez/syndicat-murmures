require('dotenv').config()
const http = require('http')
const fs   = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const TOKEN     = process.env.CONTROL_TOKEN
const PORT      = process.env.CONTROL_PORT || 3001
const BASELINE  = path.join(__dirname, '.status-baseline.json')

if (!TOKEN) { console.error('CONTROL_TOKEN manquant'); process.exit(1) }

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')) }
  catch { return { restarts: 0, at: null } }
}

function saveBaseline(restarts) {
  fs.writeFileSync(BASELINE, JSON.stringify({ restarts, at: new Date().toISOString() }))
}

function getPm2Bot() {
  const raw = execSync('pm2 jlist').toString()
  return JSON.parse(raw).find(p => p.name === 'sdm-bot') ?? null
}

function getBotStatus() {
  const bot = getPm2Bot()
  if (!bot) return { etat: 'KO', detail: 'Processus introuvable' }

  const status   = bot.pm2_env?.status
  const restarts = bot.pm2_env?.restart_time ?? 0
  const uptime   = bot.pm2_env?.pm_uptime
    ? Math.floor((Date.now() - bot.pm2_env.pm_uptime) / 60000)
    : null

  if (status !== 'online') return { etat: 'KO', detail: `Statut PM2 : ${status}` }

  const baseline  = loadBaseline()
  const newCrash  = restarts - baseline.restarts
  const uptimeTxt = uptime !== null ? `, actif depuis ${uptime} min` : ''

  if (newCrash > 0) {
    return { etat: 'Problème', detail: `${newCrash} redémarrage(s) depuis le dernier reset${uptimeTxt}` }
  }
  return { etat: 'OK', detail: `Aucun crash depuis le dernier reset${uptimeTxt}` }
}

const ACTIONS = {
  'bot-restart': () => {
    execSync('pm2 restart sdm-bot')
    return { message: 'Bot redémarré' }
  },
  'bot-status': () => getBotStatus(),
  'bot-reset-status': () => {
    const bot = getPm2Bot()
    const restarts = bot?.pm2_env?.restart_time ?? 0
    saveBaseline(restarts)
    return { message: 'Statut remis à zéro', restarts_baseline: restarts }
  },
  'bot-logs': () => {
    const raw = execSync('pm2 logs sdm-bot --lines 20 --nostream').toString()
    const logs = raw
      .replace(/\[[0-9;]*m/g, '')
      .split('\n')
      .filter(l => l.includes('sdm-bot'))
      .map(l => l.replace(/^.*sdm-bot\s*\|\s*/, '').trim())
      .filter(Boolean)
      .join('\n')
    return { logs: logs || '(aucun log)' }
  },
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
