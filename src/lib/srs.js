// Spaced Repetition System (SM-2 inspired)
// Levels 0-5 with fixed intervals in days
export const SRS_INTERVALS = [1, 2, 5, 14, 30, 90]
export const SRS_MAX_LEVEL = SRS_INTERVALS.length - 1

// Return today's date as YYYY-MM-DD string (local time)
export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Add N days to a YYYY-MM-DD string
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Initial SRS state for a new word — due immediately
export function initSrs() {
  return {
    srsLevel: 0,
    srsDueDate: today(),
    srsLastReview: null
  }
}

// Compute next SRS state after a review
// rating: 'know' | 'hard'
export function nextSrs(current, rating) {
  const now = new Date().toISOString()
  if (rating === 'know') {
    const nextLevel = Math.min((current.srsLevel ?? 0) + 1, SRS_MAX_LEVEL)
    const interval = SRS_INTERVALS[nextLevel]
    return {
      srsLevel: nextLevel,
      srsDueDate: addDays(today(), interval),
      srsLastReview: now
    }
  } else {
    // 'hard' — reset to level 0, due tomorrow
    return {
      srsLevel: 0,
      srsDueDate: addDays(today(), 1),
      srsLastReview: now
    }
  }
}

// Is this word due for review today or overdue?
export function isDue(word) {
  if (!word.srsDueDate) return true // legacy words without SRS data
  return word.srsDueDate <= today()
}

// How many days until due (negative = overdue)
export function daysUntilDue(word) {
  if (!word.srsDueDate) return 0
  const due = new Date(word.srsDueDate + 'T00:00:00')
  if (isNaN(due.getTime())) return 0
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((due - now) / 86400000)
}

// Sort words: overdue/due first (by due date asc), then future (by due date asc)
export function sortBySrs(words) {
  return [...words].sort((a, b) => {
    const da = a.srsDueDate || '0000-00-00'
    const db_ = b.srsDueDate || '0000-00-00'
    return da.localeCompare(db_)
  })
}

// Label for the SRS badge on a card
export function srsLabel(word) {
  const days = daysUntilDue(word)
  if (!word.srsDueDate) return 'New'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days}d`
}

// Human-readable interval name for a level
export function levelLabel(level) {
  const labels = ['Day 1', 'Day 2', 'Day 5', 'Day 14', 'Day 30', 'Day 90']
  const safe = (typeof level === 'number' && !isNaN(level)) ? level : 0
  return labels[safe] ?? labels[0]
}
