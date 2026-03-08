import { useState, useEffect, useRef } from 'react'
import { getWords, addWord, deleteWord, updateWordSrs, updateWord, updateWordAudio } from '../lib/db.js'
import { speakOnDevice, getGeminiAudioBlob, getGeminiDialogAudioBlob } from '../lib/tts.js'
import { getSettings, getStreak, recordReview } from '../lib/storage.js'
import { isDue, sortBySrs, srsLabel, levelLabel, daysUntilDue, SRS_MAX_LEVEL } from '../lib/srs.js'
import { Play, Volume2, Square, Trash2, ThumbsUp, RotateCcw, Eye, ArrowLeft, Check, Search, X, Flame, Pencil } from 'lucide-react'

export default function WordList() {
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [swedish, setSwedish] = useState('')
  const [english, setEnglish] = useState('')
  const [speaking, setSpeaking] = useState(null)
  const [error, setError] = useState('')
  const [reviewMode, setReviewMode] = useState(false)
  const [search, setSearch] = useState('')
  const [streak, setStreak] = useState(() => getStreak().count)
  const audioRef = useRef(null)

  useEffect(() => {
    getWords()
      .then(ws => setWords(sortBySrs(ws)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!swedish.trim()) return
    setError('')
    try {
      const entry = await addWord(swedish, english)
      setWords(prev => sortBySrs([entry, ...prev]))
      setSwedish('')
      setEnglish('')
    } catch (err) {
      setError('Failed to save: ' + err.message)
    }
  }

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    window.speechSynthesis?.cancel()
    setSpeaking(null)
  }

  async function handleSpeak(word) {
    // Pressing while playing → stop
    if (speaking === word.id) {
      stopAudio()
      return
    }
    stopAudio() // stop any other word that's playing
    setError('')
    setSpeaking(word.id)
    try {
      const settings = getSettings()
      const rate = settings.playbackRate ?? 1.0
      if (word.audio_url) {
        const audio = new Audio(word.audio_url)
        audio.playbackRate = rate
        audio.onended = () => { audioRef.current = null; setSpeaking(null) }
        audioRef.current = audio
        await audio.play()
      } else if (settings.ttsMode === 'gemini' && settings.apiKey) {
        const getBlob = word.type === 'dialog'
          ? getGeminiDialogAudioBlob(word.swedish, settings.apiKey)
          : getGeminiAudioBlob(word.swedish, settings.apiKey)
        const blob = await getBlob
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.playbackRate = rate
        audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; setSpeaking(null) }
        audioRef.current = audio
        await audio.play()
        // Cache audio after first play — future plays skip the API call
        updateWordAudio(word.id, word.swedish, blob)
          .then(audio_url => setWords(prev => prev.map(w => w.id === word.id ? { ...w, audio_url } : w)))
          .catch(() => {})
      } else {
        speakOnDevice(word.swedish, rate)
        setSpeaking(null)
      }
    } catch (err) {
      setError('TTS failed: ' + err.message)
      setSpeaking(null)
    }
  }

  async function handleDelete(word) {
    try {
      await deleteWord(word.id, word.audio_url)
      setWords(prev => prev.filter(w => w.id !== word.id))
    } catch (err) {
      setError('Failed to delete: ' + err.message)
    }
  }

  async function handleEdit(word, swedish, english) {
    try {
      await updateWord(word.id, swedish, english)
      setWords(prev => prev.map(w => w.id === word.id ? { ...w, swedish: swedish.trim(), english: english.trim() } : w))
    } catch (err) {
      setError('Failed to update: ' + err.message)
    }
  }

  async function handleRate(word, rating) {
    try {
      const srsUpdate = await updateWordSrs(word.id, word, rating)
      setWords(prev => sortBySrs(prev.map(w => w.id === word.id ? { ...w, ...srsUpdate } : w)))
      setStreak(recordReview().count)
    } catch (err) {
      setError('Failed to update review: ' + err.message)
    }
  }

  const dueWords = words.filter(isDue)
  const mastered = words.filter(w => w.srsLevel === SRS_MAX_LEVEL).length

  if (reviewMode) {
    return (
      <ReviewSession
        words={dueWords}
        onRate={handleRate}
        onSpeak={handleSpeak}
        speaking={speaking}
        onClose={() => setReviewMode(false)}
      />
    )
  }

  return (
    <div className="section">
      <form className="add-form" onSubmit={handleAdd}>
        <div className="field-group">
          <input
            className="input"
            type="text"
            placeholder="Swedish word or sentence"
            value={swedish}
            onChange={e => setSwedish(e.target.value)}
            required
          />
          <input
            className="input"
            type="text"
            placeholder="English translation (optional)"
            value={english}
            onChange={e => setEnglish(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" type="submit">Add</button>
      </form>

      {error && <div className="error">{error}</div>}

      {!loading && words.length > 0 && (
        <div className="progress-stats">
          <span>{words.length} {words.length === 1 ? 'word' : 'words'}</span>
          <span className="stats-dot">·</span>
          <span>{mastered} mastered</span>
          <span className="stats-dot">·</span>
          <span className={dueWords.length > 0 ? 'stats-due' : ''}>{dueWords.length} due</span>
          {streak > 0 && (
            <>
              <span className="stats-dot">·</span>
              <span className="stats-streak"><Flame size={13} />{streak} day streak</span>
            </>
          )}
        </div>
      )}

      {!loading && words.length > 0 && (
        <div className="search-bar">
          <Search size={15} className="search-icon" />
          <input
            className="input search-input"
            type="text"
            placeholder="Search words…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="btn-clear" onClick={() => setSearch('')} title="Clear">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {!loading && dueWords.length > 0 && !search && (
        <div className="review-banner">
          <div className="review-banner-text">
            <strong>{dueWords.length} {dueWords.length === 1 ? 'card' : 'cards'} due for review</strong>
            <span className="review-banner-hint">Keep your streak going!</span>
          </div>
          <button className="btn btn-review" onClick={() => setReviewMode(true)}>
            Start Review
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty">Loading...</div>
      ) : words.length === 0 ? (
        <div className="empty">No words yet. Add your first one above!</div>
      ) : (() => {
        const q = search.trim().toLowerCase()
        const filtered = q
          ? words.filter(w =>
              w.swedish?.toLowerCase().includes(q) ||
              w.english?.toLowerCase().includes(q) ||
              w.lines?.some(l => l.text?.toLowerCase().includes(q))
            )
          : words
        if (filtered.length === 0) {
          return <div className="empty">No results for "{search.trim()}"</div>
        }
        return (
        <ul className="word-list">
          {filtered.map(w => w.type === 'dialog'
            ? <DialogCard key={w.id} word={w} speaking={speaking}
                onSpeak={handleSpeak} onDelete={handleDelete} onRate={handleRate} />
            : <WordCard key={w.id} word={w} speaking={speaking}
                onSpeak={handleSpeak} onDelete={handleDelete} onRate={handleRate} onEdit={handleEdit} />
          )}
        </ul>
        )
      })()}
    </div>
  )
}

// ── Review Session ──────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 80

function ReviewSession({ words: initialWords, onRate, onSpeak, speaking, onClose }) {
  // Snapshot the due-word list at session start so parent re-renders
  // (which shrink the live dueWords array) don't shift our index.
  const [words] = useState(initialWords)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(false)
  const [results, setResults] = useState({ know: 0, hard: 0 })
  const [dragX, setDragX] = useState(0)
  const touchStartX = useRef(null)
  const vibratedRef = useRef(false)

  if (done || words.length === 0) {
    return (
      <div className="section review-done">
        <div className="review-done-icon"><Check size={36} strokeWidth={3} /></div>
        <h2>Review complete!</h2>
        {words.length > 0 && (
          <p className="review-done-stats">
            {results.know} knew · {results.hard} need more practice
          </p>
        )}
        {words.length === 0 && <p>Nothing due right now — come back later!</p>}
        <button className="btn btn-primary" onClick={onClose}>Back to My Words</button>
      </div>
    )
  }

  const word = words[index]
  const progress = index / words.length

  async function rate(rating) {
    await onRate(word, rating)
    setResults(r => ({ ...r, [rating]: r[rating] + 1 }))
    if (index + 1 >= words.length) {
      setDone(true)
    } else {
      setIndex(i => i + 1)
      setRevealed(false)
    }
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    vibratedRef.current = false
  }

  function handleTouchMove(e) {
    if (touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    if (!vibratedRef.current && Math.abs(dx) >= SWIPE_THRESHOLD) {
      navigator.vibrate?.(30)
      vibratedRef.current = true
    }
    setDragX(dx)
  }

  function handleTouchEnd() {
    if (dragX > SWIPE_THRESHOLD) {
      if (revealed) rate('know')
      else setRevealed(true)
    } else if (dragX < -SWIPE_THRESHOLD && revealed) {
      rate('hard')
    }
    setDragX(0)
    touchStartX.current = null
    vibratedRef.current = false
  }

  const swipeHint = dragX > 30 ? 'know' : dragX < -30 ? 'hard' : null
  const cardStyle = {
    transform: dragX ? `translateX(${dragX}px) rotate(${dragX * 0.03}deg)` : '',
    transition: dragX ? 'none' : 'transform 0.25s ease',
  }

  return (
    <div className="section">
      <div className="review-header">
        <button className="btn-back" onClick={onClose}><ArrowLeft size={16} /> My Words</button>
        <span className="review-progress-text">{index + 1} / {words.length}</span>
      </div>

      <div className="review-progress-bar">
        <div className="review-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <div
        className="review-card"
        style={cardStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {swipeHint === 'know' && <div className="swipe-hint swipe-know"><ThumbsUp size={22} /> Know it</div>}
        {swipeHint === 'hard' && <div className="swipe-hint swipe-hard"><RotateCcw size={22} /> Hard</div>}
        <div className="review-level-badge">{levelLabel(word.srsLevel ?? 0)}</div>

        {word.type === 'dialog' ? (
          <div className="dialog-lines review-dialog">
            {(word.lines || []).slice(0, 2).map((line, i) => (
              <div key={i} className={`dialog-line ${line.speaker === 'Person A' ? 'line-a' : 'line-b'}`}>
                <span className="dialog-speaker">{line.speaker}</span>
                <span className="dialog-text">{line.text}</span>
              </div>
            ))}
            {(word.lines || []).length > 2 && (
              <p className="review-more">+{word.lines.length - 2} more lines</p>
            )}
          </div>
        ) : (
          <div className="review-swedish">{word.swedish}</div>
        )}

        <button
          className="btn btn-icon review-speak"
          onClick={() => onSpeak(word)}
          title={speaking === word.id ? 'Stop' : word.audio_url ? 'Play saved audio' : 'Listen'}
        >
          {speaking === word.id ? <Square size={18} /> : word.audio_url ? <Volume2 size={18} /> : <Play size={18} />}
        </button>

        {!revealed ? (
          <button className="btn btn-reveal" onClick={() => setRevealed(true)}>
            <Eye size={16} /> Reveal answer
          </button>
        ) : (
          <>
            {word.type === 'dialog' ? (
              word.englishLines?.length > 0 && (
                <div className="dialog-lines review-translation">
                  {word.englishLines.slice(0, 2).map((line, i) => (
                    <div key={i} className="dialog-line translation">
                      <span className="dialog-speaker">{line.speaker}</span>
                      <span className="dialog-text">{line.text}</span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              word.english && <div className="review-english">{word.english}</div>
            )}

            <div className="review-rate-buttons">
              <button className="btn btn-hard" onClick={() => rate('hard')}>
                <RotateCcw size={18} /> Hard
                <span className="rate-hint">Try again tomorrow</span>
              </button>
              <button className="btn btn-know" onClick={() => rate('know')}>
                <ThumbsUp size={18} /> Know it
                <span className="rate-hint">Next: {levelLabel(Math.min((word.srsLevel ?? 0) + 1, 5))}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Word Cards ──────────────────────────────────────────────────────────────

const SUMMARY_LIMIT = 80

function SrsBadge({ word }) {
  const days = daysUntilDue(word)
  const label = srsLabel(word)
  const cls = days <= 0 ? 'srs-badge due' : 'srs-badge upcoming'
  return <span className={cls}>{label}</span>
}

function WordCard({ word, speaking, onSpeak, onDelete, onRate, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editSwedish, setEditSwedish] = useState(word.swedish)
  const [editEnglish, setEditEnglish] = useState(word.english || '')
  const [saving, setSaving] = useState(false)

  const isLong = word.swedish.length > SUMMARY_LIMIT || (word.english || '').length > SUMMARY_LIMIT
  const displaySwedish = isLong && !expanded
    ? word.swedish.slice(0, SUMMARY_LIMIT).trimEnd() + '…'
    : word.swedish
  const displayEnglish = isLong && !expanded && word.english
    ? word.english.slice(0, SUMMARY_LIMIT).trimEnd() + '…'
    : word.english

  function startEdit() {
    setEditSwedish(word.swedish)
    setEditEnglish(word.english || '')
    setEditing(true)
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!editSwedish.trim()) return
    setSaving(true)
    await onEdit(word, editSwedish, editEnglish)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="word-card">
        <form className="edit-form" onSubmit={saveEdit}>
          <input
            className="input"
            value={editSwedish}
            onChange={e => setEditSwedish(e.target.value)}
            placeholder="Swedish"
            required
            autoFocus
          />
          <input
            className="input"
            value={editEnglish}
            onChange={e => setEditEnglish(e.target.value)}
            placeholder="English translation (optional)"
          />
          <div className="edit-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="word-card">
      <div className="word-card-top">
        <div className="word-card-badges">
          <SrsBadge word={word} />
        </div>
        <span className="srs-level">{levelLabel(word.srsLevel ?? 0)}</span>
      </div>
      <div className="word-content" onClick={() => isLong && setExpanded(e => !e)}
           style={isLong ? { cursor: 'pointer' } : {}}>
        <span className="swedish">{displaySwedish}</span>
        {isLong && (
          <span className="btn-expand">{expanded ? 'Show less' : 'Show more'}</span>
        )}
        {displayEnglish && <span className="english">{displayEnglish}</span>}
      </div>
      <div className="word-actions">
        <button
          className="btn btn-icon"
          onClick={() => onSpeak(word)}
          title={speaking === word.id ? 'Stop' : word.audio_url ? 'Play saved audio' : 'Listen'}
        >
          {speaking === word.id ? <Square size={16} /> : word.audio_url ? <Volume2 size={16} /> : <Play size={16} />}
        </button>
        {isDue(word) && (
          <>
            <button className="btn btn-icon btn-hard-sm" onClick={() => onRate(word, 'hard')} title="Hard"><RotateCcw size={14} /></button>
            <button className="btn btn-icon btn-know-sm" onClick={() => onRate(word, 'know')} title="Know it"><ThumbsUp size={14} /></button>
          </>
        )}
        <button className="btn btn-icon" onClick={startEdit} title="Edit"><Pencil size={14} /></button>
        <button className="btn btn-icon btn-danger" onClick={() => onDelete(word)} title="Delete"><Trash2 size={15} /></button>
      </div>
    </li>
  )
}

function DialogCard({ word, speaking, onSpeak, onDelete, onRate }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="word-card">
      <div className="word-card-top">
        <div className="word-card-badges">
          <span className="dialog-badge">Dialog</span>
          <SrsBadge word={word} />
        </div>
        <span className="srs-level">{levelLabel(word.srsLevel ?? 0)}</span>
      </div>

      <div className="word-content" onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
        {expanded ? (
          <div className="dialog-lines">
            {(word.lines || []).map((line, i) => (
              <div key={i} className={`dialog-line ${line.speaker === 'Person A' ? 'line-a' : 'line-b'}`}>
                <span className="dialog-speaker">{line.speaker}</span>
                <span className="dialog-text">{line.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="swedish">
            {word.lines?.[0]?.text?.slice(0, 80) ?? ''}…
          </span>
        )}
        <button className="btn-expand" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Show less' : `Show all ${word.lines?.length ?? 0} lines`}
        </button>
        {expanded && word.englishLines?.length > 0 && (
          <details className="dialog-translation" onClick={e => e.stopPropagation()}>
            <summary>Show English translation</summary>
            <div className="dialog-lines translation">
              {word.englishLines.map((line, i) => (
                <div key={i} className="dialog-line">
                  <span className="dialog-speaker">{line.speaker}</span>
                  <span className="dialog-text">{line.text}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="word-actions">
        <button
          className="btn btn-icon"
          onClick={() => onSpeak(word)}
          title={speaking === word.id ? 'Stop' : word.audio_url ? 'Play saved audio' : 'Listen'}
        >
          {speaking === word.id ? <Square size={16} /> : word.audio_url ? <Volume2 size={16} /> : <Play size={16} />}
        </button>
        {isDue(word) && (
          <>
            <button className="btn btn-icon btn-hard-sm" onClick={() => onRate(word, 'hard')} title="Hard"><RotateCcw size={14} /></button>
            <button className="btn btn-icon btn-know-sm" onClick={() => onRate(word, 'know')} title="Know it"><ThumbsUp size={14} /></button>
          </>
        )}
        <button className="btn btn-icon btn-danger" onClick={() => onDelete(word)} title="Delete"><Trash2 size={15} /></button>
      </div>
    </li>
  )
}
