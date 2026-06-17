/**
 * Gestion du fuseau horaire utilisateur.
 *
 * - Chaque membre a une TZ (colonne membres.timezone).
 * - Si non définie, on détecte via Intl et on met à jour la base au login.
 * - Toutes les dates sont stockées en UTC (timestamptz). À l'affichage et
 *   dans les inputs datetime-local, on convertit dans la TZ du membre.
 */
import { supabase } from '../supabaseClient'

const FALLBACK_TZ = 'Europe/Paris'

/** Détection navigateur (peut renvoyer undefined sur très anciens browsers) */
export function detectTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TZ
  } catch {
    return FALLBACK_TZ
  }
}

/** Lit la TZ du membre stocké en localStorage, fallback détection puis Paris */
export function getUserTz() {
  try {
    const m = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
    if (m.timezone) return m.timezone
  } catch { /* noop */ }
  return detectTz()
}

/** Met à jour la TZ d'un membre (base + localStorage) */
export async function setUserTz(membreId, tz) {
  if (!tz) return
  const { error } = await supabase.from('membres').update({ timezone: tz }).eq('id', membreId)
  if (error) throw error
  try {
    const stored = JSON.parse(localStorage.getItem('sdm_membre') || '{}')
    localStorage.setItem('sdm_membre', JSON.stringify({ ...stored, timezone: tz }))
  } catch { /* noop */ }
}

/** Construit une Date qui représente l'instant exact "wall = wallString" dans la TZ donnée */
function wallTimeToUTC(wallString, tz) {
  // wallString format: "YYYY-MM-DDTHH:mm" (ou avec secondes)
  const [datePart, timePart = '00:00'] = wallString.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi, s = '0'] = timePart.split(':').map(Number)
  // Construire un instant "tentatif" en UTC
  let guess = Date.UTC(y, mo - 1, d, h, mi, Number(s))
  // Calculer ce que cet instant donne en heure murale dans la TZ cible
  // puis ajuster
  for (let i = 0; i < 3; i++) {
    const wall = utcToWall(new Date(guess), tz)
    const wallGuess = Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s)
    const wallTarget = Date.UTC(y, mo - 1, d, h, mi, Number(s))
    const delta = wallTarget - wallGuess
    if (delta === 0) break
    guess += delta
  }
  return new Date(guess)
}

/** Décompose une Date en composants "heure murale" d'une TZ donnée */
function utcToWall(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date)
  const m = {}
  parts.forEach(p => { if (p.type !== 'literal') m[p.type] = p.value })
  return { y: +m.year, mo: +m.month, d: +m.day, h: +m.hour === 24 ? 0 : +m.hour, mi: +m.minute, s: +m.second }
}

/** Renvoie l'instant courant formaté pour <input type="datetime-local"> dans la TZ user */
export function nowLocalInput(tz = getUserTz()) {
  return dateToLocalInput(new Date(), tz)
}

/** Date → string "YYYY-MM-DDTHH:mm" dans la TZ user (pour <input type="datetime-local">) */
export function dateToLocalInput(date, tz = getUserTz()) {
  const w = utcToWall(date, tz)
  const pad = n => String(n).padStart(2, '0')
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}`
}

/** Input datetime-local string (TZ user) → ISO UTC pour stockage en base */
export function localInputToUTCISO(localStr, tz = getUserTz()) {
  if (!localStr) return null
  return wallTimeToUTC(localStr, tz).toISOString()
}

/** UTC ISO string → display "JJ/MM/AAAA HH:mm" dans la TZ user */
export function fmtDateTime(utcStr, tz = getUserTz()) {
  if (!utcStr) return ''
  return new Date(utcStr).toLocaleString('fr-FR', {
    timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** UTC ISO string → display "JJ/MM/AAAA" dans la TZ user */
export function fmtDate(utcStr, tz = getUserTz()) {
  if (!utcStr) return ''
  return new Date(utcStr).toLocaleDateString('fr-FR', {
    timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

/** UTC ISO string → display "HH:mm" dans la TZ user */
export function fmtTime(utcStr, tz = getUserTz()) {
  if (!utcStr) return ''
  return new Date(utcStr).toLocaleTimeString('fr-FR', {
    timeZone: tz, hour: '2-digit', minute: '2-digit',
  })
}

/** Liste de TZ courantes pour le sélecteur */
export const TZ_LIST = [
  'Europe/Paris', 'Europe/London', 'Europe/Madrid', 'Europe/Berlin',
  'Europe/Rome', 'Europe/Lisbon', 'Europe/Athens', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'America/Buenos_Aires', 'America/Mexico_City',
  'Africa/Casablanca', 'Africa/Algiers', 'Africa/Cairo', 'Africa/Johannesburg',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai',
  'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland', 'Pacific/Honolulu',
  'UTC',
]
