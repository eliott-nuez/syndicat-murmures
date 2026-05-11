require('dotenv').config()
const { Client, GatewayIntentBits } = require('discord.js')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })

const CHANNEL_IDS = process.env.CHANNEL_IDS?.split(',').map(s => s.trim()) ?? []

// "**Théo Moana** a déposé 75x Crack"
const DESC_RE = /^\*\*.+\*\* a (déposé|retiré) (\d+)x (.+)$/

client.on('messageCreate', async (message) => {
  if (!message.webhookId) return
  if (!CHANNEL_IDS.includes(message.channelId)) return

  const embed = message.embeds?.[0]
  if (!embed?.title || !embed?.description) return

  const lieu = embed.title.trim()
  const match = embed.description.trim().match(DESC_RE)
  if (!match) {
    console.log(`[IGNORÉ] Format non reconnu : "${embed.description}"`)
    return
  }

  const [, action, qteStr, ressource] = match
  const quantite = parseInt(qteStr, 10)
  const delta = action === 'déposé' ? quantite : -quantite

  // Cherche le coffre par lieu (ex: "Entrepôt SandyShore 63")
  const { data: coffre, error: eCoffre } = await supabase
    .from('coffres')
    .select('id, nom, lieu')
    .ilike('lieu', lieu)
    .maybeSingle()

  if (eCoffre || !coffre) {
    console.log(`[IGNORÉ] Lieu inconnu : "${lieu}"`)
    return
  }

  // Vérifie que la ressource est dans la table drogues
  const { data: drogue, error: eDrogue } = await supabase
    .from('drogues')
    .select('id, nom')
    .ilike('nom', ressource.trim())
    .maybeSingle()

  if (eDrogue || !drogue) {
    console.log(`[IGNORÉ] Ressource absente du catalogue : "${ressource}"`)
    return
  }

  await upsertCoffreStock(coffre.id, drogue.id, delta)
  console.log(`[OK] ${action} ${quantite}x "${drogue.nom}" dans coffre "${coffre.lieu}" (delta ${delta > 0 ? '+' : ''}${delta})`)
})

async function upsertCoffreStock(coffre_id, drogue_id, delta) {
  const { data: existing } = await supabase
    .from('coffre_stock')
    .select('id, quantite')
    .eq('coffre_id', coffre_id)
    .eq('drogue_id', drogue_id)
    .maybeSingle()

  if (existing) {
    const newQty = Math.max(0, existing.quantite + delta)
    const { error } = await supabase
      .from('coffre_stock')
      .update({ quantite: newQty })
      .eq('id', existing.id)
    if (error) console.error('[ERREUR] update coffre_stock :', error.message)
  } else if (delta > 0) {
    const { error } = await supabase
      .from('coffre_stock')
      .insert({ coffre_id, drogue_id, quantite: delta })
    if (error) console.error('[ERREUR] insert coffre_stock :', error.message)
  }
}

client.once('clientReady', () => {
  console.log(`Bot connecté : ${client.user.tag}`)
  console.log(`Channels surveillés : ${CHANNEL_IDS.join(', ')}`)
})

client.login(process.env.DISCORD_TOKEN)
