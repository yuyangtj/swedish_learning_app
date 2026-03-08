// Device-local settings only (API key, TTS mode preference)
// Word storage has moved to Supabase — see src/lib/db.js

import { today } from './srs.js'

const SETTINGS_KEY = 'sv_settings'
const STREAK_KEY = 'sv_streak'

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function getStreak() {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY) || '{"count":0,"lastDate":null}')
  } catch {
    return { count: 0, lastDate: null }
  }
}

export function recordReview() {
  const todayStr = today()
  const streak = getStreak()
  if (streak.lastDate === todayStr) return streak // already counted today

  const d = new Date(todayStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  const yesterday = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

  const updated = {
    count: streak.lastDate === yesterday ? streak.count + 1 : 1,
    lastDate: todayStr
  }
  localStorage.setItem(STREAK_KEY, JSON.stringify(updated))
  return updated
}
