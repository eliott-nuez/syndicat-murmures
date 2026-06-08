import { supabase } from '../supabaseClient'

/**
 * Charge depuis Supabase les paramètres du système de commission :
 * tranches, multiplicateurs par rang, et coût du boitier ATM.
 * À appeler une fois par page, puis passer le résultat à calculerCommission().
 */
export async function chargerParamsCommission() {
  const [
    { data: tranches },
    { data: params },
    { data: boitier },
  ] = await Promise.all([
    supabase.from('tranches_commission').select('*').order('ordre'),
    supabase.from('parametres').select('cle, valeur, valeur_texte').in('cle', [
      'commission_multiplicateur_membre',
      'commission_multiplicateur_responsable',
      'commission_multiplicateur_direction',
      'commission_mode',
    ]),
    supabase.from('consommables')
      .select('cout').eq('type_activite', 'ATM').eq('actif', true)
      .limit(1).maybeSingle(),
  ])

  const multiplicateurs = {}
  let mode = 'multiplicateur'
  ;(params || []).forEach(p => {
    if (p.cle === 'commission_mode') { mode = p.valeur_texte || 'multiplicateur'; return }
    multiplicateurs[p.cle.replace('commission_multiplicateur_', '')] = Number(p.valeur)
  })

  return {
    tranches: tranches || [],
    multiplicateurs,
    mode,
    boitierCout: boitier?.cout || 0,
  }
}

/**
 * Calcule la commission et le net d'un membre pour une liste d'activités/ventes/plantations.
 *
 * Règles :
 *  - Cambriolage : EXCLU de la base commission (le membre garde directement)
 *  - ATM : coût du boitier déduit automatiquement par activité
 *  - Base = (activités hors cambriolage - boitiers) + bénéfice ventes + bénéfice plantations
 *  - Commission progressive par tranches (comme les impôts) :
 *    chaque tranche s'applique uniquement sur la portion de la base dans son intervalle,
 *    multipliée par le multiplicateur du rang.
 *    Ex : 150 000$ → 7%×mult sur les 100 000 premiers + 5%×mult sur les 50 000 suivants
 */
export function calculerCommission(activites, ventes, rang, { tranches, multiplicateurs, mode, boitierCout }, plantations = []) {
  const actsCamb     = activites.filter(a => a.type_code === 'Cambriolage')
  const actsHorsCamb = activites.filter(a => a.type_code !== 'Cambriolage')
  const nbATM        = activites.filter(a => a.type_code === 'ATM').length

  const cambriolageTotal  = actsCamb.reduce((s, a) => s + (a.somme_argent_sale || 0), 0)
  const totalActBrut      = actsHorsCamb.reduce((s, a) => s + (a.somme_argent_sale || 0), 0)
  const deductionBoitiers = nbATM * (boitierCout || 0)
  const totalActNet       = Math.max(0, totalActBrut - deductionBoitiers)

  const ventesVendues  = ventes.filter(v => v.statut === 'Vendu')
  const totalPrixTotal = ventesVendues.reduce((s, v) => s + (v.prix_total || 0), 0)
  const totalBenefice  = ventesVendues.reduce((s, v) => s + (v.argent_sale  || 0), 0)
  const totalSaisies   = ventes.filter(v => v.statut === 'Saisie').reduce((s, v) => s + Math.abs(v.argent_sale || 0), 0)

  const totalPlantations = (plantations || []).reduce((s, p) => s + (p.benefice || 0), 0)

  const base = totalActNet + totalBenefice + totalPlantations

  // Calcul progressif par tranches (chaque tranche sur sa portion uniquement)
  const sorted         = [...tranches].sort((a, b) => a.ordre - b.ordre)
  const modeVariable   = mode === 'variable'
  const multiplicateur = multiplicateurs[rang] ?? 1

  let commission = 0
  const tranches_detail = []

  for (const t of sorted) {
    if (base <= t.min_montant) break
    const trancheMax    = t.max_montant !== null ? t.max_montant : Infinity
    const portion       = Math.min(base, trancheMax) - t.min_montant
    if (portion <= 0) continue
    // Mode variable : % saisi directement par grade (ignore le multiplicateur).
    // Mode multiplicateur : taux de base de la tranche × multiplicateur du rang.
    const tauxEffectif  = modeVariable
      ? Number(t[`taux_${rang}`] ?? t.taux_pct ?? 0)
      : t.taux_pct * multiplicateur
    const comm_tranche  = portion * tauxEffectif / 100
    commission += comm_tranche
    tranches_detail.push({
      min: t.min_montant,
      max: t.max_montant,
      taux_pct: t.taux_pct,
      taux_effectif: tauxEffectif,
      portion,
      commission: comm_tranche,
    })
  }

  // Taux effectif moyen (pour affichage)
  const commission_pct = base > 0 ? (commission / base * 100) : 0
  const net            = base - commission

  return {
    totalActBrut, cambriolageTotal, deductionBoitiers, totalActNet,
    totalPrixTotal, totalBenefice, totalSaisies, totalPlantations,
    base, multiplicateur, commission_pct,
    commission, net, nbATM, boitierCout: boitierCout || 0,
    tranches_detail,
  }
}
