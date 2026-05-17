require('dotenv').config()
const {
  Client, GatewayIntentBits, WebhookClient,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
})
const client  = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })
const monitor = new WebhookClient({ url: process.env.MONITOR_WEBHOOK_URL })

const CHANNEL_IDS      = process.env.CHANNEL_IDS?.split(',').map(s => s.trim()) ?? []
const MONITOR_CHAN_ID  = process.env.MONITOR_CHANNEL_ID

// "**Théo Moana** a déposé 75x Crack"
const DESC_RE = /^\*\*.+\*\* a (déposé|retiré) (\d+)x (.+)$/

// ── Logs ───────────────────────────────────────────────────────────────────────
function log(emoji, msg) {
  const text = `${emoji} ${msg}`
  console.log(text)
  monitor.send(text).catch(() => {})
}

// Envoie un message avec boutons dans le channel de monitoring
async function sendWithButtons(content, components) {
  try {
    const chan = await client.channels.fetch(MONITOR_CHAN_ID)
    await chan.send({ content, components })
  } catch (e) {
    log('⚠️', content) // fallback sans boutons
  }
}

// ── Stock atomique via RPC ─────────────────────────────────────────────────────
async function upsertDrogueStock(coffre_id, drogue_id, delta) {
  const { error } = await supabase.rpc('upsert_coffre_stock', {
    p_coffre_id: coffre_id, p_drogue_id: drogue_id, p_delta: delta,
  })
  if (error) log('🔴', `Erreur drogue_stock : ${error.message}`)
}

async function upsertConsoStock(coffre_id, consommable_id, delta) {
  const { error } = await supabase.rpc('upsert_coffre_consommables', {
    p_coffre_id: coffre_id, p_consommable_id: consommable_id, p_delta: delta,
  })
  if (error) log('🔴', `Erreur conso_stock : ${error.message}`)
}

// ── Message entrant ────────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (!message.webhookId) return
  if (!CHANNEL_IDS.includes(message.channelId)) return

  const embed = message.embeds?.[0]
  if (!embed?.title || !embed?.description) return

  const lieu  = embed.title.trim()
  const match = embed.description.trim().match(DESC_RE)
  if (!match) {
    log('❓', `Format non reconnu : "${embed.description}"`)
    return
  }

  const [, action, qteStr, ressource] = match
  const quantite = parseInt(qteStr, 10)
  const delta    = action === 'déposé' ? quantite : -quantite

  // Cherche le coffre
  const { data: coffre } = await supabase
    .from('coffres').select('id, lieu').ilike('lieu', lieu).maybeSingle()

  if (!coffre) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`create_coffre:${lieu}`.slice(0, 100))
        .setLabel('📦 Créer ce coffre')
        .setStyle(ButtonStyle.Primary)
    )
    await sendWithButtons(`⚠️ Lieu inconnu : **${lieu}** — introuvable en base`, [row])
    return
  }

  // Cherche dans drogues
  const { data: drogue } = await supabase
    .from('drogues').select('id, nom').ilike('nom', ressource.trim()).maybeSingle()

  if (drogue) {
    await upsertDrogueStock(coffre.id, drogue.id, delta)
    const signe = delta > 0 ? `+${delta}` : `${delta}`
    log('📦', `**${drogue.nom}** — ${coffre.lieu} (${signe}) [${action}]`)
    return
  }

  // Cherche dans consommables
  const { data: conso } = await supabase
    .from('consommables').select('id, nom').ilike('nom', ressource.trim()).maybeSingle()

  if (conso) {
    await upsertConsoStock(coffre.id, conso.id, delta)
    const signe = delta > 0 ? `+${delta}` : `${delta}`
    log('🔧', `**${conso.nom}** — ${coffre.lieu} (${signe}) [${action}]`)
    return
  }

  // Ressource inconnue → boutons de création
  const nomSafe = ressource.trim().slice(0, 80)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`create_drogue:${nomSafe}`)
      .setLabel('🌿 Créer comme drogue')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`create_conso:${nomSafe}`)
      .setLabel('🔧 Créer comme consommable')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ignore_item:${nomSafe}`)
      .setLabel('✕ Ignorer')
      .setStyle(ButtonStyle.Danger),
  )
  await sendWithButtons(`⚠️ Ressource inconnue : **${ressource}** — que faire ?`, [row])
})

// ── Interactions (boutons + modals) ───────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // ── Boutons ──
  if (interaction.isButton()) {
    const sep  = interaction.customId.indexOf(':')
    const type = interaction.customId.slice(0, sep)
    const nom  = interaction.customId.slice(sep + 1)

    if (type === 'create_coffre') {
      const { error } = await supabase.from('coffres').insert({ nom, lieu: nom })
      if (error) return interaction.reply({ content: `🔴 Erreur : ${error.message}`, ephemeral: true })
      await interaction.reply({ content: `✅ Coffre **${nom}** créé avec succès !`, ephemeral: true })
      return
    }

    if (type === 'ignore_item') {
      return interaction.reply({ content: `✕ **${nom}** ignoré.`, ephemeral: true })
    }

    if (type === 'create_drogue') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_drogue:${nom}`)
        .setTitle('Nouvelle drogue')
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('nom').setLabel('Nom')
            .setStyle(TextInputStyle.Short).setValue(nom).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('prix_revient').setLabel('Prix de revient ($)')
            .setStyle(TextInputStyle.Short).setPlaceholder('Ex : 500').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('seuil_alerte').setLabel('Seuil alerte (unités)')
            .setStyle(TextInputStyle.Short).setPlaceholder('Ex : 10').setRequired(false)
        ),
      )
      return interaction.showModal(modal)
    }

    if (type === 'create_conso') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_conso:${nom}`)
        .setTitle('Nouveau consommable')
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('nom').setLabel('Nom')
            .setStyle(TextInputStyle.Short).setValue(nom).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cout').setLabel('Coût ($)')
            .setStyle(TextInputStyle.Short).setPlaceholder('Ex : 240').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('type_argent').setLabel('Type argent')
            .setStyle(TextInputStyle.Short).setPlaceholder('propre ou sale')
            .setValue('propre').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('type_activite').setLabel('Activité liée (optionnel)')
            .setStyle(TextInputStyle.Short).setPlaceholder('Ex : ATM, Cambriolage…').setRequired(false)
        ),
      )
      return interaction.showModal(modal)
    }
  }

  // ── Modals ──
  if (interaction.isModalSubmit()) {
    const sep  = interaction.customId.indexOf(':')
    const type = interaction.customId.slice(0, sep)

    if (type === 'modal_drogue') {
      const nom    = interaction.fields.getTextInputValue('nom').trim()
      const prix   = parseFloat(interaction.fields.getTextInputValue('prix_revient')) || 0
      const seuil  = parseInt(interaction.fields.getTextInputValue('seuil_alerte'))  || 0
      const { error } = await supabase.from('drogues').insert({ nom, prix_revient: prix, seuil_alerte: seuil })
      if (error) return interaction.reply({ content: `🔴 Erreur : ${error.message}`, ephemeral: true })
      await interaction.reply({ content: `✅ Drogue **${nom}** ajoutée au catalogue !`, ephemeral: true })
      return
    }

    if (type === 'modal_conso') {
      const nom    = interaction.fields.getTextInputValue('nom').trim()
      const cout   = parseFloat(interaction.fields.getTextInputValue('cout')) || 0
      const typeRaw = interaction.fields.getTextInputValue('type_argent').toLowerCase()
      const type_argent  = typeRaw.includes('sale') ? 'argent_sale' : 'argent_propre'
      const type_activite = interaction.fields.getTextInputValue('type_activite').trim() || null
      const { error } = await supabase.from('consommables').insert({ nom, cout, type_argent, type_activite, actif: true })
      if (error) return interaction.reply({ content: `🔴 Erreur : ${error.message}`, ephemeral: true })
      await interaction.reply({ content: `✅ Consommable **${nom}** ajouté au catalogue !`, ephemeral: true })
      return
    }
  }
})

client.once('clientReady', () => {
  console.log(`Bot connecté : ${client.user.tag}`)
  log('✅', `**Bot Murmures** démarré — ${CHANNEL_IDS.length} channel(s) surveillé(s)`)
})

client.login(process.env.DISCORD_TOKEN)
