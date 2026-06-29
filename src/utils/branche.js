/**
 * Calculs de rendement pour la production de branches de cannabis.
 *
 * Tous les coûts/prix sont stockés dans la table `parametres` avec :
 *   - valeur  = montant
 *   - valeur_texte = 'propre' ou 'sale'  (monnaie)
 *
 * Le bénéfice est toujours calculé en argent SALE (cohérent avec
 * l'historique : prix de revente d'une branche = 70$ sale).
 *
 * Formule :
 *   profit_sale = floor(prix_revente_sale * nb_branches
 *                       - nb_pots * (prix_pot + prix_graine
 *                                    + 6 * prix_bouteille
 *                                    + prix_fertilisant_par_pot))
 *
 * où prix_fertilisant_par_pot = prix_fertilisant_semaine_sale / total_pots_semaine
 *
 * La taxe de fertilisant est une charge hebdomadaire fixe répartie entre
 * tous les pots produits durant la semaine. Quand une nouvelle production
 * est ajoutée, la part par pot diminue : il faut donc recalculer le
 * bénéfice de toutes les plantations de la semaine.
 */
import { supabase } from '../supabaseClient'
import { getDebutSemaineStr } from './temps'

const TAUX_PROPRE_VERS_SALE = 1.35

const KEYS = [
  'branche_prix_pot',
  'branche_prix_graine',
  'branche_prix_bouteille',
  'branche_prix_fertilisant_semaine',
  'branche_prix_revente_branche',
]

export const KEYS_LABELS = {
  branche_prix_pot:                 'Prix d\'un pot',
  branche_prix_graine:              'Prix d\'une graine',
  branche_prix_bouteille:           'Prix d\'une bouteille d\'eau',
  branche_prix_fertilisant_semaine: 'Taxe fertilisant hebdomadaire',
  branche_prix_revente_branche:     'Prix de revente d\'une branche',
}

/** Convertit un montant vers de l'argent sale */
export function toSale(montant, monnaie) {
  const m = Number(montant) || 0
  return monnaie === 'propre' ? m * TAUX_PROPRE_VERS_SALE : m
}

/** Convertit un montant vers de l'argent propre */
export function toPropre(montant, monnaie) {
  const m = Number(montant) || 0
  return monnaie === 'sale' ? m / TAUX_PROPRE_VERS_SALE : m
}

/** Charge tous les paramètres branche. Retourne { cle: { valeur, monnaie } } */
export async function chargerBrancheParams() {
  const { data } = await supabase.from('parametres')
    .select('cle, valeur, valeur_texte').in('cle', KEYS)
  const out = {}
  KEYS.forEach(k => { out[k] = { valeur: 0, monnaie: 'sale' } })
  ;(data || []).forEach(r => {
    out[r.cle] = { valeur: Number(r.valeur) || 0, monnaie: r.valeur_texte || 'sale' }
  })
  return out
}

/** Met à jour un paramètre branche (montant + monnaie) */
export async function setBrancheParam(cle, montant, monnaie) {
  if (!KEYS.includes(cle)) throw new Error('Clé inconnue : ' + cle)
  const { error } = await supabase.from('parametres')
    .upsert({ cle, valeur: Number(montant) || 0, valeur_texte: monnaie }, { onConflict: 'cle' })
  if (error) throw error
}

/**
 * Calcule le bénéfice (en sale, arrondi inférieur) pour une production.
 *
 * @param {number} nb_pots
 * @param {number} nb_branches
 * @param {object} params  - résultat de chargerBrancheParams()
 * @param {number} totalPotsSemaine - total de pots produits durant la semaine
 *                                    (inclut cette production). Utilisé pour
 *                                    répartir la taxe fertilisant.
 */
export function calculerBenefice(nb_pots, nb_branches, params, totalPotsSemaine) {
  if (!nb_pots || !nb_branches || !params) return 0
  const revente   = toSale(params.branche_prix_revente_branche.valeur, params.branche_prix_revente_branche.monnaie)
  const pot       = toSale(params.branche_prix_pot.valeur,       params.branche_prix_pot.monnaie)
  const graine    = toSale(params.branche_prix_graine.valeur,    params.branche_prix_graine.monnaie)
  const bouteille = toSale(params.branche_prix_bouteille.valeur, params.branche_prix_bouteille.monnaie)
  const fertSem   = toSale(params.branche_prix_fertilisant_semaine.valeur, params.branche_prix_fertilisant_semaine.monnaie)
  const fertParPot = totalPotsSemaine > 0 ? fertSem / totalPotsSemaine : 0

  const coutParPot = pot + graine + 6 * bouteille + fertParPot
  const recette = revente * nb_branches
  const cout    = nb_pots * coutParPot
  return Math.floor(recette - cout)
}

/**
 * Recalcule le bénéfice de TOUTES les plantations de la semaine courante
 * (pour la drogue Branche), suite à un ajout/modif/suppression. Effectue les
 * UPDATE en base. Sans paramètres : recharge les params depuis la base.
 */
export async function recalculerBeneficesSemaine(brancheDrogueId, params = null) {
  if (!brancheDrogueId) return
  const p = params || await chargerBrancheParams()
  const debut = getDebutSemaineStr()
  const { data: plants } = await supabase.from('plantations')
    .select('id, nb_pots, nb_branches, benefice')
    .eq('drogue_id', brancheDrogueId)
    .gte('date_plantation', debut)
  if (!plants || plants.length === 0) return
  const totalPots = plants.reduce((s, p) => s + (p.nb_pots || 0), 0)
  const updates = []
  for (const pl of plants) {
    const newBenef = calculerBenefice(pl.nb_pots, pl.nb_branches, p, totalPots)
    if (newBenef !== Math.floor(Number(pl.benefice) || 0)) {
      updates.push(supabase.from('plantations').update({ benefice: newBenef }).eq('id', pl.id))
    }
  }
  if (updates.length > 0) await Promise.all(updates)
}

/**
 * Pour le formulaire de saisie : calcule le bénéfice prévisionnel d'une
 * production en tenant compte du total de pots déjà déclaré durant la
 * semaine PLUS les pots de cette future production.
 */
export async function calculerBeneficeApresAjout(brancheDrogueId, nb_pots, nb_branches, params = null) {
  const p = params || await chargerBrancheParams()
  const debut = getDebutSemaineStr()
  let totalPotsSemaine = nb_pots
  if (brancheDrogueId) {
    const { data } = await supabase.from('plantations')
      .select('nb_pots').eq('drogue_id', brancheDrogueId).gte('date_plantation', debut)
    totalPotsSemaine = (data || []).reduce((s, p) => s + (p.nb_pots || 0), 0) + nb_pots
  }
  return calculerBenefice(nb_pots, nb_branches, p, totalPotsSemaine)
}
