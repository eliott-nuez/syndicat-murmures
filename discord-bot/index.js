require('dotenv').config()
const { Client, GatewayIntentBits, WebhookClient } = require('discord.js')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws }
})
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })
const monitor = new WebhookClient({ url: process.env.MONITOR_WEBHOOK_URL })

const CHANNEL_IDS = process.env.CHANNEL_IDS?.split(',').map(s => s.trim()) ?? []

// "**Théo Moana** a déposé 75x Crack"
const DESC_RE = /^\*\*.+\*\* a (déposé|retiré) (\d+)x (.+)$/

function log(emoji, msg) {
  const text = `${emoji} ${msg}`
  console.log(text)
  monitor.send(text).catch(() => {})
}

client.on('messageCreate', async (message) => {
  if (!message.webhookId) return
  if (!CHANNEL_IDS.includes(message.channelId)) return

  const embed = message.embeds?.[0]
  if (!embed?.title || !embed?.description) return

  const lieu = embed.title.trim()
  const match = embed.description.trim().match(DESC_RE)
  if (!match) {
    log('❓', `Format non reconnu : "${embed.description}"`)
    return
  }

  const [, action, qteStr, ressource] = match
  const quantite = parseInt(qteStr, 10)
  const delta = action === 'déposé' ? quantite : -quantite

  // Cherche le coffre par lieu
  const { data: coffre, error: eCoffre } = await supabase
    .from('coffres')
    .select('id, lieu')
    .ilike('lieu', lieu)
    .maybeSingle()

  if (eCoffre || !coffre) {
    log('⚠️', `Lieu inconnu : **${lieu}** — ajoute ce coffre dans l'appli`)
    return
  }

  // Cherche d'abord dans drogues
  const { data: drogue } = await supabase
    .from('drogues')
    .select('id, nom')
    .ilike('nom', ressource.trim())
    .maybeSingle()

  if (drogue) {
    await upsertDrogueStock(coffre.id, drogue.id, delta)
    const signe = delta > 0 ? `+${delta}` : `${delta}`
    log('📦', `**${drogue.nom}** — ${coffre.lieu} (${signe}) [${action}]`)
    return
  }

  // Cherche ensuite dans consommables
  const { data: conso } = await supabase
    .from('consommables')
    .select('id, nom')
    .ilike('nom', ressource.trim())
    .maybeSingle()

  if (conso) {
    await upsertConsoStock(coffre.id, conso.id, delta)
    const signe = delta > 0 ? `+${delta}` : `${delta}`
    log('🔧', `**${conso.nom}** — ${coffre.lieu} (${signe}) [${action}]`)
    return
  }

  log('⚠️', `Ressource ignorée : **${ressource}** — absente du catalogue`)
})

async function upsertDrogueStock(coffre_id, drogue_id, delta) {
  const { data: existing } = await supabase
    .from('coffre_stock')
    .select('id, quantite')
    .eq('coffre_id', coffre_id)
    .eq('drogue_id', drogue_id)
    .maybeSingle()

  if (existing) {
    const newQty = Math.max(0, existing.quantite + delta)
    const { error } = await supabase.from('coffre_stock').update({ quantite: newQty }).eq('id', existing.id)
    if (error) log('🔴', `Erreur update drogue_stock : ${error.message}`)
  } else if (delta > 0) {
    const { error } = await supabase.from('coffre_stock').insert({ coffre_id, drogue_id, quantite: delta })
    if (error) log('🔴', `Erreur insert drogue_stock : ${error.message}`)
  }
}

async function upsertConsoStock(coffre_id, consommable_id, delta) {
  const { data: existing } = await supabase
    .from('coffre_consommables')
    .select('id, quantite')
    .eq('coffre_id', coffre_id)
    .eq('consommable_id', consommable_id)
    .maybeSingle()

  if (existing) {
    const newQty = Math.max(0, existing.quantite + delta)
    const { error } = await supabase.from('coffre_consommables').update({ quantite: newQty }).eq('id', existing.id)
    if (error) log('🔴', `Erreur update conso_stock : ${error.message}`)
  } else if (delta > 0) {
    const { error } = await supabase.from('coffre_consommables').insert({ coffre_id, consommable_id, quantite: delta })
    if (error) log('🔴', `Erreur insert conso_stock : ${error.message}`)
  }
}

client.once('clientReady', () => {
  console.log(`Bot connecté : ${client.user.tag}`)
  log('✅', `**Bot Murmures** démarré — ${CHANNEL_IDS.length} channel(s) surveillé(s)`)
})

client.login(process.env.DISCORD_TOKEN)
