/**
 * Calculs de bornes de semaine. La semaine du gang est toujours ancrée sur
 * Europe/Paris (lundi 00h00) pour que tous les membres voient les mêmes
 * agrégats hebdomadaires, quel que soit leur fuseau horaire.
 *
 * Toutes les colonnes timestamp sont stockées en UTC (timestamptz). On
 * filtre donc avec des bornes ISO UTC qui correspondent au lundi 00h00 Paris.
 */

const REF_TZ = 'Europe/Paris'

// Composants "heure murale" d'une Date dans une TZ donnée
function utcToWall(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date)
  const m = {}
  parts.forEach(p => { if (p.type !== 'literal') m[p.type] = p.value })
  return { y: +m.year, mo: +m.month, d: +m.day, h: +m.hour === 24 ? 0 : +m.hour, mi: +m.minute, s: +m.second }
}

// Instant exact "wall = y-mo-d h:mi:s" dans la TZ donnée → Date UTC
function wallToUTC(y, mo, d, h, mi, s, tz) {
  let guess = Date.UTC(y, mo - 1, d, h, mi, s)
  for (let i = 0; i < 3; i++) {
    const w = utcToWall(new Date(guess), tz)
    const wallGuess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
    const wallTarget = Date.UTC(y, mo - 1, d, h, mi, s)
    const delta = wallTarget - wallGuess
    if (delta === 0) break
    guess += delta
  }
  return new Date(guess)
}

/** Lundi 00h00 Europe/Paris de la semaine courante, retourné comme Date UTC */
export function getDebutSemaine() {
  const now = new Date()
  const w = utcToWall(now, REF_TZ)
  // Calculer le jour de la semaine pour ce mur (1=lun ... 7=dim)
  const tmp = new Date(Date.UTC(w.y, w.mo - 1, w.d))
  const dow = ((tmp.getUTCDay() + 6) % 7) // 0=lun ... 6=dim
  // Reculer de dow jours
  const monday = new Date(Date.UTC(w.y, w.mo - 1, w.d - dow))
  return wallToUTC(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0, 0, REF_TZ)
}

/** Lundi 00h00 Europe/Paris → string ISO UTC (pour filtres timestamptz) */
export function getDebutSemaineStr() {
  return getDebutSemaine().toISOString()
}

/** Numéro de semaine ISO d'une Date (basé sur ses composants UTC) */
function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

/**
 * Génère N semaines (la courante + N-1 précédentes), toutes ancrées sur
 * lundi 00h00 Europe/Paris. Chaque entrée :
 *   { label, debutUTC: Date, finUTC: Date }
 * où debutUTC/finUTC sont les bornes en UTC à utiliser pour filtrer les
 * colonnes timestamptz (via .toISOString()).
 */
export function genererSemaines(n = 13) {
  const courant = getDebutSemaine()
  const semaines = []
  for (let i = 0; i < n; i++) {
    const debut = new Date(courant.getTime() - i * 7 * 24 * 3600 * 1000)
    const fin   = new Date(debut.getTime() + 7 * 24 * 3600 * 1000)
    // Label en heure Paris
    const w = utcToWall(debut, REF_TZ)
    const wf = utcToWall(new Date(fin.getTime() - 1), REF_TZ)
    const num = getWeekNumber(debut)
    const pad = n => String(n).padStart(2, '0')
    const fmt = wp => `${pad(wp.d)}/${pad(wp.mo)}`
    const label = i === 0
      ? `Semaine en cours (S${num} — ${fmt(w)} au ${fmt(wf)})`
      : `S${num} — ${fmt(w)} au ${fmt(wf)}`
    semaines.push({ label, debutUTC: debut, finUTC: fin })
  }
  return semaines
}
