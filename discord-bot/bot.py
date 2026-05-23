#!/usr/bin/env python3
"""
Bot Discord — Syndicat des Murmures (Python)
Surveille les webhooks d'entrepôt, met à jour les stocks en base,
logge chaque mouvement et rattrape les messages manqués au démarrage.
"""
import os, re, logging, asyncio, requests
from datetime import datetime, timezone

import discord
from discord import ui
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL    = os.environ['SUPABASE_URL']
SUPABASE_KEY    = os.environ['SUPABASE_SERVICE_KEY']
DISCORD_TOKEN   = os.environ['DISCORD_TOKEN']
CHANNEL_IDS     = [c.strip() for c in os.getenv('CHANNEL_IDS', '').split(',') if c.strip()]
MONITOR_CHAN_ID = int(os.getenv('MONITOR_CHANNEL_ID', 0))
WEBHOOK_URL     = os.getenv('MONITOR_WEBHOOK_URL', '')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('sdm-bot')

# ── Supabase (sync, exécuté dans un thread) ───────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def db(fn):
    """Exécute un appel Supabase synchrone dans un thread séparé."""
    return await asyncio.to_thread(fn)

# ── Discord ───────────────────────────────────────────────────────────────────
intents = discord.Intents.default()
intents.message_content = True
bot = discord.Client(intents=intents)

# ── Regex : "**Yvan Keller** a déposé 54x Branche de cannabis" ───────────────
DESC_RE = re.compile(r'^\*\*(.+)\*\* a (déposé|retiré) (\d+)x (.+)$')

# ── Logs ──────────────────────────────────────────────────────────────────────
async def send_log(emoji: str, msg: str):
    text = f"{emoji} {msg}"
    logger.info(text)
    if WEBHOOK_URL:
        try:
            await asyncio.to_thread(
                lambda: requests.post(WEBHOOK_URL, json={'content': text[:2000]}, timeout=5)
            )
        except Exception as e:
            logger.warning(f"Webhook send error: {e}")

async def send_monitor(content: str, view: discord.ui.View = None):
    """Envoie dans le channel de monitoring (supporte les boutons)."""
    if not MONITOR_CHAN_ID:
        await send_log('⚠️', content)
        return
    try:
        chan = bot.get_channel(MONITOR_CHAN_ID) or await bot.fetch_channel(MONITOR_CHAN_ID)
        await chan.send(content, view=view)
    except Exception as e:
        logger.error(f"send_monitor error: {e}")
        await send_log('⚠️', content)

# ── Correspondance personnage ↔ membre ───────────────────────────────────────
async def find_membre(nom_personnage: str) -> dict | None:
    """
    Cherche un membre par nom de personnage.
    Essaie d'abord le champ nom_ig, puis surnom (correspondance exacte ilike).
    Retourne le dict membre (id, surnom, nom_ig) ou None.
    """
    nom = nom_personnage.strip()
    # 1. Cherche sur nom_ig (nom du personnage en jeu)
    try:
        r = await db(lambda: supabase.table('membres')
            .select('id, surnom, nom_ig')
            .ilike('nom_ig', nom)
            .maybe_single()
            .execute())
        if r.data:
            return r.data
    except Exception:
        pass  # colonne nom_ig absente → continuer

    # 2. Fallback : cherche sur surnom
    try:
        r = await db(lambda: supabase.table('membres')
            .select('id, surnom, nom_ig')
            .ilike('surnom', nom)
            .maybe_single()
            .execute())
        if r.data:
            return r.data
    except Exception:
        pass

    return None

def membre_label(membre: dict | None, fallback: str) -> str:
    """Retourne le surnom si membre trouvé, sinon le nom brut du personnage."""
    if membre and membre.get('surnom'):
        return membre['surnom']
    return fallback

# ── Stock atomique (RPCs PostgreSQL) ─────────────────────────────────────────
async def upsert_drogue_stock(coffre_id: str, drogue_id: str, delta: int):
    try:
        await db(lambda: supabase.rpc('upsert_coffre_stock', {
            'p_coffre_id': coffre_id,
            'p_drogue_id': drogue_id,
            'p_delta':     delta,
        }).execute())
    except Exception as e:
        logger.error(f"upsert_drogue_stock error: {e}")

async def upsert_conso_stock(coffre_id: str, conso_id: str, delta: int):
    try:
        await db(lambda: supabase.rpc('upsert_coffre_consommables', {
            'p_coffre_id':       coffre_id,
            'p_consommable_id':  conso_id,
            'p_delta':           delta,
        }).execute())
    except Exception as e:
        logger.error(f"upsert_conso_stock error: {e}")

# ── Log en base ───────────────────────────────────────────────────────────────
async def insert_log(
    message_id: str, action: str, quantite: int,
    ressource_nom: str, ressource_type: str,
    coffre_id: str, coffre_nom: str,
    personnage_nom: str, membre: dict | None,
    is_recovery: bool = False,
):
    try:
        await db(lambda: supabase.table('logs_mouvements').insert({
            'message_id':     message_id,
            'action':         action,
            'quantite':       quantite,
            'ressource_nom':  ressource_nom,
            'ressource_type': ressource_type,
            'coffre_id':      coffre_id,
            'coffre_nom':     coffre_nom,
            'personnage_nom': personnage_nom,
            'membre_id':      membre['id'] if membre else None,
            'membre_surnom':  membre_label(membre, None),
            'is_recovery':    is_recovery,
        }).execute())
    except Exception as e:
        # 23505 = unique_violation (message déjà traité) → ignoré silencieusement
        if '23505' not in str(e):
            logger.error(f"insert_log error: {e}")

# ── Checkpoint de récupération ────────────────────────────────────────────────
async def get_last_message_id(channel_id: str) -> str | None:
    try:
        r = await db(lambda: supabase.table('bot_state')
            .select('last_message_id')
            .eq('channel_id', channel_id)
            .maybe_single()
            .execute())
        return r.data['last_message_id'] if r.data else None
    except Exception:
        return None

async def save_last_message_id(channel_id: str, message_id: str):
    try:
        await db(lambda: supabase.table('bot_state').upsert({
            'channel_id':      channel_id,
            'last_message_id': str(message_id),
            'updated_at':      datetime.now(timezone.utc).isoformat(),
        }).execute())
    except Exception as e:
        logger.error(f"save_state error: {e}")

# ── Vues interactives (boutons + modals) ──────────────────────────────────────

class CoffreView(discord.ui.View):
    def __init__(self, lieu: str):
        super().__init__(timeout=None)
        self.lieu = lieu

    @discord.ui.button(label='📦 Créer ce coffre', style=discord.ButtonStyle.primary)
    async def create_coffre(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            await db(lambda: supabase.table('coffres')
                .insert({'nom': self.lieu, 'lieu': self.lieu})
                .execute())
            await interaction.response.send_message(
                f'✅ Coffre **{self.lieu}** créé avec succès !', ephemeral=True)
        except Exception as e:
            await interaction.response.send_message(
                f'🔴 Erreur : {e}', ephemeral=True)


class ResourceView(discord.ui.View):
    def __init__(self, nom: str):
        super().__init__(timeout=None)
        self.nom = nom

    @discord.ui.button(label='🌿 Créer comme drogue', style=discord.ButtonStyle.success)
    async def create_drogue(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(DrogueModal(self.nom))

    @discord.ui.button(label='🔧 Créer comme consommable', style=discord.ButtonStyle.secondary)
    async def create_conso(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(ConsoModal(self.nom))

    @discord.ui.button(label='✕ Ignorer', style=discord.ButtonStyle.danger)
    async def ignore(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message(
            f'✕ **{self.nom}** ignoré.', ephemeral=True)


class DrogueModal(discord.ui.Modal, title='Nouvelle drogue'):
    def __init__(self, nom: str):
        super().__init__()
        self.f_nom   = discord.ui.TextInput(label='Nom', default=nom[:100], required=True)
        self.f_prix  = discord.ui.TextInput(label='Prix de revient ($)', placeholder='Ex : 500', required=True)
        self.f_seuil = discord.ui.TextInput(label='Seuil alerte (unités)', placeholder='Ex : 10', required=False)
        self.add_item(self.f_nom)
        self.add_item(self.f_prix)
        self.add_item(self.f_seuil)

    async def on_submit(self, interaction: discord.Interaction):
        try:
            nom   = self.f_nom.value.strip()
            prix  = float(self.f_prix.value  or 0)
            seuil = int(self.f_seuil.value   or 0)
            await db(lambda: supabase.table('drogues')
                .insert({'nom': nom, 'prix_revient': prix, 'seuil_alerte': seuil})
                .execute())
            await interaction.response.send_message(
                f'✅ Drogue **{nom}** ajoutée au catalogue !', ephemeral=True)
        except Exception as e:
            await interaction.response.send_message(f'🔴 Erreur : {e}', ephemeral=True)


class ConsoModal(discord.ui.Modal, title='Nouveau consommable'):
    def __init__(self, nom: str):
        super().__init__()
        self.f_nom    = discord.ui.TextInput(label='Nom', default=nom[:100], required=True)
        self.f_cout   = discord.ui.TextInput(label='Coût ($)', placeholder='Ex : 240', required=True)
        self.f_type   = discord.ui.TextInput(label='Type argent', default='propre',
                                              placeholder='propre ou sale', required=True)
        self.f_activ  = discord.ui.TextInput(label='Activité liée (optionnel)', required=False)
        self.add_item(self.f_nom)
        self.add_item(self.f_cout)
        self.add_item(self.f_type)
        self.add_item(self.f_activ)

    async def on_submit(self, interaction: discord.Interaction):
        try:
            nom         = self.f_nom.value.strip()
            cout        = float(self.f_cout.value or 0)
            type_argent = 'argent_sale' if 'sale' in self.f_type.value.lower() else 'argent_propre'
            activite    = self.f_activ.value.strip() or None
            await db(lambda: supabase.table('consommables')
                .insert({'nom': nom, 'cout': cout, 'type_argent': type_argent,
                         'type_activite': activite, 'actif': True})
                .execute())
            await interaction.response.send_message(
                f'✅ Consommable **{nom}** ajouté au catalogue !', ephemeral=True)
        except Exception as e:
            await interaction.response.send_message(f'🔴 Erreur : {e}', ephemeral=True)

# ── Traitement d'un message ───────────────────────────────────────────────────
async def process_message(message: discord.Message, is_recovery: bool = False):
    if not message.webhook_id:
        return
    if str(message.channel.id) not in CHANNEL_IDS:
        return

    embed = message.embeds[0] if message.embeds else None
    if not embed or not embed.title or not embed.description:
        return

    lieu  = embed.title.strip()
    match = DESC_RE.match(embed.description.strip())
    if not match:
        if not is_recovery:
            await send_log('❓', f'Format non reconnu : "{embed.description}"')
        await save_last_message_id(str(message.channel.id), str(message.id))
        return

    personnage_nom, action_fr, qte_str, ressource = match.groups()
    quantite = int(qte_str)
    delta    = quantite if action_fr == 'déposé' else -quantite
    action   = 'ajout' if action_fr == 'déposé' else 'retrait'
    signe    = f'+{quantite}' if action == 'ajout' else f'-{quantite}'

    # ── Cherche le coffre ──────────────────────────────────────────────────────
    r = await db(lambda: supabase.table('coffres')
        .select('id, lieu').ilike('lieu', lieu).maybe_single().execute())
    coffre = r.data

    if not coffre:
        if not is_recovery:
            await send_monitor(
                f'⚠️ Lieu inconnu : **{lieu}** — introuvable en base',
                CoffreView(lieu))
        else:
            await send_log('❓', f'[Rattrapage] Lieu inconnu : **{lieu}**')
        await save_last_message_id(str(message.channel.id), str(message.id))
        return

    # ── Cherche le membre via nom de personnage ────────────────────────────────
    membre = await find_membre(personnage_nom)
    pseudo = membre_label(membre, personnage_nom)

    # ── Cherche dans drogues ───────────────────────────────────────────────────
    r = await db(lambda: supabase.table('drogues')
        .select('id, nom').ilike('nom', ressource.strip()).maybe_single().execute())
    drogue = r.data

    if drogue:
        await upsert_drogue_stock(coffre['id'], drogue['id'], delta)
        await insert_log(str(message.id), action, quantite, drogue['nom'], 'drogue',
                         coffre['id'], coffre['lieu'], personnage_nom, membre, is_recovery)
        prefix = '[Rattrapage] ' if is_recovery else ''
        await send_log('📦', f'{prefix}**{pseudo}** {action} {quantite}x {drogue["nom"]} → {coffre["lieu"]} ({signe})')
        await save_last_message_id(str(message.channel.id), str(message.id))
        return

    # ── Cherche dans consommables ──────────────────────────────────────────────
    r = await db(lambda: supabase.table('consommables')
        .select('id, nom').ilike('nom', ressource.strip()).maybe_single().execute())
    conso = r.data

    if conso:
        await upsert_conso_stock(coffre['id'], conso['id'], delta)
        await insert_log(str(message.id), action, quantite, conso['nom'], 'consommable',
                         coffre['id'], coffre['lieu'], personnage_nom, membre, is_recovery)
        prefix = '[Rattrapage] ' if is_recovery else ''
        await send_log('🔧', f'{prefix}**{pseudo}** {action} {quantite}x {conso["nom"]} → {coffre["lieu"]} ({signe})')
        await save_last_message_id(str(message.channel.id), str(message.id))
        return

    # ── Ressource inconnue ─────────────────────────────────────────────────────
    if not is_recovery:
        await send_monitor(
            f'⚠️ Ressource inconnue : **{ressource.strip()}** — que faire ?',
            ResourceView(ressource.strip()[:80]))
    else:
        await send_log('❓', f'[Rattrapage] Ressource inconnue : **{ressource.strip()}**')

    await save_last_message_id(str(message.channel.id), str(message.id))

# ── Événements Discord ────────────────────────────────────────────────────────

@bot.event
async def on_ready():
    logger.info(f'Bot connecté : {bot.user} (id={bot.user.id})')
    await send_log('✅', f'**Bot Murmures (Python)** démarré — {len(CHANNEL_IDS)} channel(s) surveillé(s)')

    # ── Récupération des messages manqués ──────────────────────────────────────
    for cid in CHANNEL_IDS:
        try:
            channel = bot.get_channel(int(cid)) or await bot.fetch_channel(int(cid))
        except Exception as e:
            logger.warning(f'Channel {cid} introuvable : {e}')
            continue

        last_id = await get_last_message_id(cid)
        after   = discord.Object(id=int(last_id)) if last_id else None

        count = 0
        try:
            async for msg in channel.history(limit=500, after=after, oldest_first=True):
                await process_message(msg, is_recovery=True)
                count += 1
        except Exception as e:
            logger.error(f'Erreur historique channel {cid}: {e}')

        if count > 0:
            await send_log('🔄', f'Rattrapage : **{count}** message(s) traité(s) sur <#{cid}>')
        else:
            logger.info(f'Channel {cid} : aucun message manqué')


@bot.event
async def on_message(message: discord.Message):
    await process_message(message, is_recovery=False)


# ── Démarrage ─────────────────────────────────────────────────────────────────
bot.run(DISCORD_TOKEN)
