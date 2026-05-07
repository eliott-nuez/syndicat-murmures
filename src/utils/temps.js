/**
 * Retourne le lundi 00h00 heure de Paris (Europe/Paris) en tant que Date UTC.
 * Fonctionne quel que soit le fuseau du navigateur.
 */
export function getDebutSemaine() {
  const now = new Date()
  // Représenter l'heure actuelle dans le fuseau Paris
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  // Reculer jusqu'au lundi 00h00 (1=Lun … 7=Dim)
  const dow = paris.getDay() || 7
  paris.setDate(paris.getDate() - (dow - 1))
  paris.setHours(0, 0, 0, 0)
  // Décalage entre UTC réel et l'heure Paris traitée en "local" → donne le vrai timestamp UTC
  const offset = now - new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  return new Date(paris.getTime() + offset)
}
