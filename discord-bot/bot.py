#!/usr/bin/env python3
"""
Bot Discord — Syndicat des Murmures (Python)
Surveille les webhooks d'entrepôt, met à jour les stocks en base,
logge chaque mouvement et rattrape les messages manqués au démarrage.
"""
import os, re, logging, asyncio, requests, unicodedata
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
VEHICULE_CHANNEL_ID = os.getenv('VEHICULE_CHANNEL_ID', '').strip()
WRONG_GARAGE_CHANNEL_ID = os.getenv('WRONG_GARAGE_CHANNEL_ID', '1514185224806989924').strip()
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

# ── Regex : "Lenny Santini a rangé un(e) calico dans le garage 167782: ON1601IR"
#            "Lenny Santini a sorti un(e) kamacho du garage 167779: EG3531CN"
VEHICULE_RE = re.compile(r'^(.+?) a (rangé|sorti) un\(e\) (.+?) (?:dans le|du) garage (\S+)\s*:\s*(\S+)\s*$')

# ── Envoi de logs / monitoring ────────────────────────────────────────────────
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

async def send_channel_message(channel_id: str, content: str):
    """Envoie un message texte brut dans un channel donné (mentions autorisées)."""
    if not channel_id:
        return
    try:
        chan = bot.get_channel(int(channel_id)) or await bot.fetch_channel(int(channel_id))
        await chan.send(content)
    except Exception as e:
        logger.error(f"send_channel_message error: {e}")

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
def strip_accents(s: str) -> str:
    """Supprime les accents : Théo → Theo, Élodie → Elodie, etc."""
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    ).strip()

async def _try_find(prenom: str, nom: str) -> dict | None:
    """Tente une recherche ilike sur prenom+nom (dans cet ordre)."""
    try:
        r = await db(lambda: supabase.table('membres')
            .select('id, surnom, prenom, nom, id_intranet')
            .ilike('prenom', prenom)
            .ilike('nom', nom)
            .limit(1)
            .execute())
        if r and r.data:
            return r.data[0]
    except Exception:
        pass
    return None

async def find_membre(nom_personnage: str) -> dict | None:
    """
    Cherche un membre par nom de personnage (champs prenom + nom).
    Essaie les deux ordres (Prénom Nom / Nom Prénom)
    et les deux formes (avec / sans accents) pour chaque combinaison.
    Retourne le dict membre (id, surnom, prenom, nom) ou None.
    """
    parts = nom_personnage.strip().split(' ', 1)
    if len(parts) != 2:
        return None

    a, b = parts[0].strip(), parts[1].strip()
    sa, sb = strip_accents(a), strip_accents(b)

    # Toutes les combinaisons : ordre × accents
    # On commence par la plus précise (avec accents) pour éviter de faux positifs
    for prenom, nom in [(a, b), (b, a), (sa, sb), (sb, sa)]:
        result = await _try_find(prenom, nom)
        if result:
            return result

    return None

def membre_label(membre: dict | None, fallback: str) -> str:
    """Retourne le surnom si membre trouvé, sinon le nom brut du personnage."""
    if membre and membre.get('surnom'):
        return membre['surnom']
    return fallback

# ── Déduplication ─────────────────────────────────────────────────────────────
async def is_already_processed(message_id: str) -> bool:
    """
    Vérifie si ce message a déjà été traité (présent dans logs_mouvements).
    Permet d'éviter le double traitement en cas de redémarrage du bot.
    """
    try:
        r = await db(lambda: supabase.table('logs_mouvements')
            .select('message_id')
            .eq('message_id', message_id)
            .limit(1)
            .execute())
        return bool(r and r.data)
    except Exception:
        return False  # En cas d'erreur DB, on laisse passer

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
        if '23505' not in str(e):
            logger.error(f"insert_log error: {e}")

# ── Checkpoint de récupération ────────────────────────────────────────────────
async def get_last_message_id(channel_id: str) -> str | None:
    try:
        r = await db(lambda: supabase.table('bot_state')
            .select('last_message_id')
            .eq('channel_id', channel_id)
            .limit(1)
            .execute())
        return r.data[0]['last_message_id'] if r and r.data else None
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

class RecapDetailView(discord.ui.View):
    """Bouton 'Voir le détail' pour le récap de rattrapage."""
    def __init__(self, lines: list):
        super().__init__(timeout=600)
        self.lines = lines

    @discord.ui.button(label='📋 Voir le détail', style=discord.ButtonStyle.secondary)
    async def show_detail(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not self.lines:
            await interaction.response.send_message('Aucun détail disponible.', ephemeral=True)
            return
        # Discord message limit = 2000 chars, on tronque si nécessaire
        detail_lines = self.lines[:80]
        extra = len(self.lines) - len(detail_lines)
        text = '\n'.join(detail_lines)
        if extra > 0:
            text += f'\n_...et {extra} autres actions_'
        await interaction.response.send_message(text[:2000], ephemeral=True)


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
                f'Erreur : {e}', ephemeral=True)


class ResourceView(discord.ui.View):
    def __init__(self, nom: str):
        super().__init__(timeout=None)
        self.nom = nom

    @discord.ui.button(label='Créer comme drogue', style=discord.ButtonStyle.success)
    async def create_drogue(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(DrogueModal(self.nom))

    @discord.ui.button(label='Créer comme consommable', style=discord.ButtonStyle.secondary)
    async def create_conso(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(ConsoModal(self.nom))

    @discord.ui.button(label='Ignorer', style=discord.ButtonStyle.danger)
    async def ignore(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message(
            f'**{self.nom}** ignoré.', ephemeral=True)


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
            await interaction.response.send_message(f'Erreur : {e}', ephemeral=True)


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
            await interaction.response.send_message(f'Erreur : {e}', ephemeral=True)


# ── Traitement des messages "Véhicules" (entrées/sorties garage) ─────────────
async def process_vehicule_message(message: discord.Message, is_recovery: bool = False) -> str | None:
    """
    Traite un message webhook "Véhicules" (entrée/sortie de garage).
    - is_recovery=False : envoie un log Discord pour l'action traitée.
    - is_recovery=True  : ne spamme pas, retourne une ligne de résumé (str) si traité.
    """
    if not message.webhook_id:
        return None

    embed = message.embeds[0] if message.embeds else None
    if not embed or not embed.description:
        return None

    match = VEHICULE_RE.match(embed.description.strip())
    if not match:
        if not is_recovery:
            await send_log('❓', f'[Véhicules] Format non reconnu : "{embed.description}"')
        await save_last_message_id(str(message.channel.id), str(message.id))
        return None

    if await is_already_processed(str(message.id)):
        await save_last_message_id(str(message.channel.id), str(message.id))
        return None

    personnage, action_fr, modele, id_garage, plaque = match.groups()
    plaque = plaque.strip()
    entree = (action_fr == 'rangé')

    emoji = '🚗'
    line  = None

    try:
        # ── Garage ─────────────────────────────────────────────────────────
        r = await db(lambda: supabase.table('garages')
            .select('id, id_garage').eq('id_garage', id_garage).limit(1).execute())
        garage = r.data[0] if r and r.data else None

        if not garage:
            emoji = '⚠️'
            line = f'Garage inconnu : **{id_garage}** (véhicule {plaque})'
        else:
            # ── Véhicule du catalogue ? ──────────────────────────────────────
            r = await db(lambda: supabase.table('voitures')
                .select('id, immatriculation, modele_jeu').ilike('immatriculation', plaque).limit(1).execute())
            voiture = r.data[0] if r and r.data else None

            if voiture:
                r = await db(lambda: supabase.table('emplacements')
                    .select('id, numero').eq('garage_id', garage['id']).eq('voiture_id', voiture['id']).limit(1).execute())
                emp = r.data[0] if r and r.data else None
                if emp:
                    await db(lambda: supabase.table('emplacements').update({
                        'present': entree, 'updated_at': datetime.now(timezone.utc).isoformat()
                    }).eq('id', emp['id']).execute())
                    verbe = 'rentré' if entree else 'sorti'
                    nom_v = voiture.get('modele_jeu') or modele
                    line = f'**{personnage}** a {verbe} **{nom_v}** ({plaque}) — garage {id_garage}, place n°{emp["numero"]}'
                elif entree:
                    # ── Véhicule rangé, mais pas dans son garage attitré ─────────
                    nom_v = voiture.get('modele_jeu') or modele
                    r = await db(lambda: supabase.table('emplacements')
                        .select('id, numero, garages(id_garage, lieu, numero)')
                        .eq('voiture_id', voiture['id']).limit(1).execute())
                    home = r.data[0] if r and r.data else None
                    home_garage = home.get('garages') if home else None

                    if home_garage:
                        if not is_recovery:
                            membre = await find_membre(personnage)
                            discord_id = membre.get('id_intranet') if membre else None
                            mention = f'<@{discord_id}>' if discord_id else f'**{personnage}**'
                            lieu = home_garage.get('lieu') or '?'
                            num = home_garage.get('numero') or home_garage.get('id_garage')
                            warn_msg = (
                                f"{mention} Tu as rangé le/la **{nom_v}** immatriculé **{plaque}** dans le mauvais garage. "
                                f"Ranges le/la dans le {lieu} {num}. Merci !"
                            )
                            await send_channel_message(WRONG_GARAGE_CHANNEL_ID, warn_msg)
                        emoji = '⚠️'
                        line = (f'**{personnage}** a rangé **{nom_v}** ({plaque}) dans le mauvais garage '
                                f'({id_garage}) — attitré au garage {home_garage.get("id_garage")}')
                    else:
                        emoji = '⚠️'
                        line = f'Véhicule **{plaque}** ({modele}) non assigné à un emplacement du garage {id_garage}'
                else:
                    emoji = '⚠️'
                    line = f'Véhicule **{plaque}** ({modele}) non assigné à un emplacement du garage {id_garage}'
            else:
                # ── Véhicule personnel → place "libre" ──────────────────────
                if entree:
                    r = await db(lambda: supabase.table('emplacements')
                        .select('id, numero').eq('garage_id', garage['id'])
                        .is_('voiture_id', 'null').is_('occupant_plaque', 'null')
                        .order('numero').limit(1).execute())
                    emp = r.data[0] if r and r.data else None
                    if emp:
                        await db(lambda: supabase.table('emplacements').update({
                            'occupant_plaque': plaque, 'updated_at': datetime.now(timezone.utc).isoformat()
                        }).eq('id', emp['id']).execute())
                        line = f'**{personnage}** a garé **{modele}** ({plaque}) — garage {id_garage}, place perso n°{emp["numero"]}'
                    else:
                        emoji = '⚠️'
                        line = f'Aucune place perso libre dans le garage {id_garage} pour **{plaque}** ({modele})'
                else:
                    r = await db(lambda: supabase.table('emplacements')
                        .select('id, numero').eq('garage_id', garage['id']).ilike('occupant_plaque', plaque).limit(1).execute())
                    emp = r.data[0] if r and r.data else None
                    if emp:
                        await db(lambda: supabase.table('emplacements').update({
                            'occupant_plaque': None, 'updated_at': datetime.now(timezone.utc).isoformat()
                        }).eq('id', emp['id']).execute())
                        line = f'**{personnage}** a sorti **{modele}** ({plaque}) — garage {id_garage}, place perso n°{emp["numero"]} libérée'
                    else:
                        emoji = '⚠️'
                        line = f'Véhicule perso **{plaque}** introuvable dans le garage {id_garage}'
    except Exception as e:
        logger.error(f'Erreur traitement véhicule "{plaque}": {e}')
        emoji = '🔴'
        line = f'Erreur traitement véhicule {plaque} : {e}'

    # ── Marque le message comme traité (déduplication) ──────────────────────
    try:
        await db(lambda: supabase.table('logs_mouvements').insert({
            'message_id':     str(message.id),
            'action':         'ajout' if entree else 'retrait',
            'quantite':       0,
            'ressource_nom':  plaque,
            'ressource_type': None,
            'coffre_id':      None,
            'coffre_nom':     id_garage,
            'personnage_nom': personnage,
            'is_recovery':    is_recovery,
        }).execute())
    except Exception as e:
        if '23505' not in str(e):
            logger.error(f"insert_log vehicule error: {e}")

    await save_last_message_id(str(message.channel.id), str(message.id))

    if not is_recovery and line:
        await send_log(emoji, line)

    return f'{emoji} {line}' if (is_recovery and line) else None


# ── Traitement d'un message ───────────────────────────────────────────────────
async def process_message(message: discord.Message, is_recovery: bool = False) -> str | None:
    """
    Traite un message webhook d'entrepôt.
    - is_recovery=False : mode normal, envoie un log Discord pour chaque action.
    - is_recovery=True  : mode rattrapage, ne spamme pas, retourne une ligne de résumé
                          (str) si une action a été traitée, None sinon.
    Retourne None dans tous les cas en mode normal.
    """
    if not message.webhook_id:
        return None

    if VEHICULE_CHANNEL_ID and str(message.channel.id) == VEHICULE_CHANNEL_ID:
        return await process_vehicule_message(message, is_recovery)

    if str(message.channel.id) not in CHANNEL_IDS:
        return None

    embed = message.embeds[0] if message.embeds else None
    if not embed or not embed.title or not embed.description:
        return None

    lieu  = embed.title.strip()
    match = DESC_RE.match(embed.description.strip())
    if not match:
        if not is_recovery:
            await send_log('❓', f'Format non reconnu : "{embed.description}"')
        await save_last_message_id(str(message.channel.id), str(message.id))
        return None

    personnage_nom, action_fr, qte_str, ressource = match.groups()
    quantite = int(qte_str)
    delta    = quantite if action_fr == 'déposé' else -quantite
    action   = 'ajout' if action_fr == 'déposé' else 'retrait'
    signe    = f'+{quantite}' if action == 'ajout' else f'-{quantite}'

    # ── Déduplication : ce message a-t-il déjà été traité ? ───────────────────
    if await is_already_processed(str(message.id)):
        logger.info(f"Message {message.id} déjà traité, ignoré.")
        await save_last_message_id(str(message.channel.id), str(message.id))
        return None

    # ── Cherche le coffre ──────────────────────────────────────────────────────
    try:
        r = await db(lambda: supabase.table('coffres')
            .select('id, lieu').ilike('lieu', lieu).limit(1).execute())
        coffre = r.data[0] if r and r.data else None
    except Exception as e:
        logger.error(f'Erreur lookup coffre "{lieu}": {e}')
        return None

    if not coffre:
        if not is_recovery:
            await send_monitor(
                f'Lieu inconnu : **{lieu}** — introuvable en base',
                CoffreView(lieu))
        await save_last_message_id(str(message.channel.id), str(message.id))
        return None

    # ── Cherche le membre via nom de personnage ────────────────────────────────
    membre = await find_membre(personnage_nom)
    pseudo = membre_label(membre, personnage_nom)

    # ── Cherche dans drogues ───────────────────────────────────────────────────
    try:
        r = await db(lambda: supabase.table('drogues')
            .select('id, nom').ilike('nom', ressource.strip()).limit(1).execute())
        drogue = r.data[0] if r and r.data else None
    except Exception as e:
        logger.error(f'Erreur lookup drogue "{ressource}": {e}')
        drogue = None

    if drogue:
        await upsert_drogue_stock(coffre['id'], drogue['id'], delta)
        await insert_log(str(message.id), action, quantite, drogue['nom'], 'drogue',
                         coffre['id'], coffre['lieu'], personnage_nom, membre, is_recovery)
        await save_last_message_id(str(message.channel.id), str(message.id))
        line = f'📦 **{pseudo}** {action} {quantite}x {drogue["nom"]} → {coffre["lieu"]} ({signe})'
        if not is_recovery:
            await send_log('📦', f'**{pseudo}** {action} {quantite}x {drogue["nom"]} → {coffre["lieu"]} ({signe})')
        return line if is_recovery else None

    # ── Cherche dans consommables ──────────────────────────────────────────────
    try:
        r = await db(lambda: supabase.table('consommables')
            .select('id, nom').ilike('nom', ressource.strip()).limit(1).execute())
        conso = r.data[0] if r and r.data else None
    except Exception as e:
        logger.error(f'Erreur lookup conso "{ressource}": {e}')
        conso = None

    if conso:
        await upsert_conso_stock(coffre['id'], conso['id'], delta)
        await insert_log(str(message.id), action, quantite, conso['nom'], 'consommable',
                         coffre['id'], coffre['lieu'], personnage_nom, membre, is_recovery)
        await save_last_message_id(str(message.channel.id), str(message.id))
        line = f'🔧 **{pseudo}** {action} {quantite}x {conso["nom"]} → {coffre["lieu"]} ({signe})'
        if not is_recovery:
            await send_log('🔧', f'**{pseudo}** {action} {quantite}x {conso["nom"]} → {coffre["lieu"]} ({signe})')
        return line if is_recovery else None

    # ── Ressource inconnue ─────────────────────────────────────────────────────
    if not is_recovery:
        await send_monitor(
            f'Ressource inconnue : **{ressource.strip()}** — que faire ?',
            ResourceView(ressource.strip()[:80]))
    await save_last_message_id(str(message.channel.id), str(message.id))
    return None


# ── Événements Discord ────────────────────────────────────────────────────────

@bot.event
async def on_ready():
    logger.info(f'Bot connecté : {bot.user} (id={bot.user.id})')
    nb_chan = len(CHANNEL_IDS) + (1 if VEHICULE_CHANNEL_ID else 0)
    await send_log('✅', f'**Bot Murmures** démarré — {nb_chan} channel(s) surveillé(s)')

    # ── Récupération des messages manqués ──────────────────────────────────────
    total_actions = 0
    all_recap_lines = []

    recovery_channel_ids = list(CHANNEL_IDS)
    if VEHICULE_CHANNEL_ID and VEHICULE_CHANNEL_ID not in recovery_channel_ids:
        recovery_channel_ids.append(VEHICULE_CHANNEL_ID)

    for cid in recovery_channel_ids:
        try:
            channel = bot.get_channel(int(cid)) or await bot.fetch_channel(int(cid))
        except Exception as e:
            logger.warning(f'Channel {cid} introuvable : {e}')
            continue

        last_id = await get_last_message_id(cid)
        after   = discord.Object(id=int(last_id)) if last_id else None

        chan_lines = []
        try:
            async for msg in channel.history(limit=500, after=after, oldest_first=True):
                result = await process_message(msg, is_recovery=True)
                if result:
                    chan_lines.append(result)
        except Exception as e:
            logger.error(f'Erreur historique channel {cid}: {e}')

        if chan_lines:
            total_actions += len(chan_lines)
            # Préfixe chaque ligne avec le nom du channel pour le récap global
            for line in chan_lines:
                all_recap_lines.append(f'<#{cid}> {line}')
            logger.info(f'Channel {cid} : {len(chan_lines)} action(s) rattrapée(s)')
        else:
            logger.info(f'Channel {cid} : aucun message manqué')

    # ── Envoi d'un récap global unique ────────────────────────────────────────
    if total_actions > 0:
        view = RecapDetailView(all_recap_lines)
        await send_monitor(
            f'Rattrapage : **{total_actions} action(s) traitée(s)**',
            view=view
        )
    else:
        logger.info('Rattrapage : aucune action manquée')


@bot.event
async def on_message(message: discord.Message):
    await process_message(message, is_recovery=False)


# ── Démarrage ─────────────────────────────────────────────────────────────────
bot.run(DISCORD_TOKEN)
