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
    supabase.from('parametres').select('cle, valeur').in('cle', [
      'commission_multiplicateur_membre',
      'commission_multiplicateur_responsable',
      'commission_multiplicateur_direction',
    ]),
    supabase.from('consommables')
      .select('cout').eq('type_activite', 'ATM').eq('actif', true)
      .limit(1).maybeSingle(),
  ])

  const multiplicateurs = {}
  ;(params || []).forEach(p => {
    multiplicateurs[p.cle.replace('commission_multiplicateur_', '')] = Number(p.valeur)
  })

  return {
    tranches: tranches || [],
    multiplicateurs,
    boitierCout: boitier?.cout || 0,
  }
}

/**
 * Calcule la commission et le net d'un membre pour une liste d'activités/ventes.
 *
 * Règles :
 *  - Cambriolage : EXCLU de la base commission (le membre garde directement)
 *  - ATM : coût du boitier déduit automatiquement par activité
 *  - Base = (activités hors cambriolage - boitiers) + bénéfice ventes
 *  - Taux effectif = taux_tranche × multiplicateur_rang
 *  - Commission = base × taux_effectif / 100
 */
export function calculerCommission(activites, ventes, rang, { tranches, multiplicateurs, boitierCout }) {
  const actsCamb    = activites.filter(a => a.type_code === 'Cambriolage')
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

  const base = totalActNet + totalBenefice

  // Tranche applicable (ordre croissant)
  const sorted = [...tranches].sort((a, b) => a.ordre - b.ordre)
  const tranche = sorted.find(
    t => base >= t.min_montant && (t.max_montant === null || base < t.max_montant)
  ) || sorted[sorted.length - 1] || { taux_pct: 0 }

  const taux_base      = tranche?.taux_pct || 0
  const multiplicateur = multiplicateurs[rang] ?? 1
  const commission_pct = taux_base * multiplicateur
  const commission     = base * commission_pct / 100
  const net            = base - commission

  return {
    totalActBrut, cambriolageTotal, deductionBoitiers, totalActNet,
    totalPrixTotal, totalBenefice, totalSaisies,
    base, taux_base, multiplicateur, commission_pct,
    commission, net, nbATM, boitierCout: boitierCout || 0,
  }
}
