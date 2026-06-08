import { supabase } from '../supabaseClient'

// Valeurs par défaut si la table quotas n'a rien pour ce rang/type
const DEFAUTS = { actions: 20, branches: 2000, unites: 300 }

/**
 * Charge les objectifs de quotas configurés pour un rang donné (table `quotas`).
 * Retourne un objet { actions, branches, unites, ... } — ajoute Number(objectif)
 * pour chaque type_quota trouvé, avec repli sur les valeurs par défaut.
 */
export async function chargerQuotas(rang) {
  const { data } = await supabase.from('quotas').select('type_quota, objectif').eq('rang', rang || 'membre')
  const map = { ...DEFAUTS }
  ;(data || []).forEach(q => { map[q.type_quota] = Number(q.objectif) })
  return map
}
