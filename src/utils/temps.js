/**
 * Retourne le lundi 00h00 heure de Paris (Europe/Paris) en tant que Date UTC.
 * À utiliser pour filtrer les colonnes timestamptz (ex: created_at).
 */
export function getDebutSemaine() {
  const now = new Date()
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const dow = paris.getDay() || 7
  paris.setDate(paris.getDate() - (dow - 1))
  paris.setHours(0, 0, 0, 0)
  const offset = now - new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  return new Date(paris.getTime() + offset)
}

/**
 * Retourne le lundi 00h00 heure de Paris comme string naïf "YYYY-MM-DDTHH:MM:SS".
 * À utiliser pour filtrer les colonnes timestamp without time zone (ex: heure_faite).
 */
export function getDebutSemaineStr() {
  const now = new Date()
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const dow = paris.getDay() || 7
  paris.setDate(paris.getDate() - (dow - 1))
  paris.setHours(0, 0, 0, 0)
  const pad = n => String(n).padStart(2, '0')
  return `${paris.getFullYear()}-${pad(paris.getMonth()+1)}-${pad(paris.getDate())}T00:00:00`
}
