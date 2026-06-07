/**
 * Système "Vue simulée" — permet à la direction de naviguer
 * comme un membre ou un responsable, sans perdre ses accès réels.
 *
 * Le rang réel reste dans sdm_membre (utilisé par ProtectedRoute).
 * Le rang simulé est stocké séparément dans sdm_view_as.
 */

const KEY = 'sdm_view_as'

/** Rang réel de l'utilisateur connecté */
export function getRangReel() {
  const stored = localStorage.getItem('sdm_membre')
  if (!stored) return null
  return JSON.parse(stored).rang || null
}

/**
 * Rang effectif pour l'affichage/UI.
 * Si une simulation est active (et que l'utilisateur est bien direction),
 * retourne le rang simulé. Sinon retourne le rang réel.
 */
export function getRangEffectif() {
  const reel = getRangReel()
  if (reel !== 'direction') return reel   // non-direction : jamais de simulation
  const simule = localStorage.getItem(KEY)
  return simule || reel
}

/** Active la simulation d'un rang ('membre' | 'responsable') */
export function activerViewAs(rang) {
  localStorage.setItem(KEY, rang)
  window.dispatchEvent(new Event('sdm_view_as_change'))
}

/** Désactive la simulation, retour en vue direction */
export function desactiverViewAs() {
  localStorage.removeItem(KEY)
  window.dispatchEvent(new Event('sdm_view_as_change'))
}

/** Rang simulé actif, ou null si pas de simulation */
export function getViewAsActif() {
  const reel = getRangReel()
  if (reel !== 'direction') return null
  return localStorage.getItem(KEY) || null
}
