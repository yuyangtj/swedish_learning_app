import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Send, Volume2, Loader2, KeyRound, Target, ChevronDown, ChevronUp, RotateCcw, Trash2, BookMarked } from 'lucide-react'
import { getSettings } from '../lib/storage.js'
import { speakOnDevice, speakGemini } from '../lib/tts.js'
import { coachTurn } from '../lib/coach.js'
import { saveMistakes, getMistakes, deleteMistake } from '../lib/db.js'

const GOAL_KEY = 'sv_coach_goal'

const WELCOME = {
  id: 0,
  role: 'coach',
  reply: "Hej! I'm Maja, your Swedish coach. Speak or type in Swedish and I'll help with grammar and pronunciation!",
  corrections: [],
  pronunciation_tips: [],
  score: 100,
  transcript: null
}

function ScoreChip({ score }) {
  if (score === 100) return null
  const color = score >= 90 ? '#16a34a' : score >= 70 ? '#d97706' : '#dc2626'
  return (
    <span className="coach-score" style={{ background: color + '22', color }}>
      {score}/100
    </span>
  )
}

function CorrectionChips({ corrections }) {
  if (!corrections?.length) return null
  return (
    <div className="coach-corrections">
      {corrections.map((c, i) => (
        <div key={i} className={`correction-chip correction-chip--${c.severity}`}>
          <div className="correction-row">
            <span className="correction-original">{c.original}</span>
            <span className="correction-arrow"> → </span>
            <span className="correction-fixed">{c.corrected}</span>
          </div>
          <span className="correction-reason">{c.explanation}</span>
        </div>
      ))}
    </div>
  )
}

function PronunciationTips({ tips }) {
  if (!tips?.length) return null
  return (
    <details className="pronunciation-tip-section">
      <summary>Pronunciation tips ({tips.length})</summary>
      {tips.map((t, i) => (
        <p key={i} className="pronunciation-tip">
          <strong>{t.word}:</strong> {t.tip}
        </p>
      ))}
    </details>
  )
}

function SuggestedSentences({ sentences, onPick }) {
  if (!sentences?.length) return null
  return (
    <div className="coach-suggestions">
      <span className="coach-suggestions-label">Try saying:</span>
      {sentences.map((s, i) => (
        <button key={i} className="coach-suggestion-chip" onClick={() => onPick(s.swedish)}>
          <span className="suggestion-swedish">{s.swedish}</span>
          <span className="suggestion-english">{s.english}</span>
        </button>
      ))}
    </div>
  )
}

function CoachMessage({ msg, onSpeak, onSuggest }) {
  if (msg.role === 'user') {
    return (
      <div className="coach-bubble coach-bubble--user">
        {msg.isAudio && <span className="coach-audio-label">🎙 </span>}
        {msg.text ?? <em style={{ opacity: 0.55 }}>Listening…</em>}
      </div>
    )
  }
  return (
    <div className="coach-bubble coach-bubble--coach">
      <div className="coach-reply-row">
        <p className="coach-reply">{msg.reply}</p>
        <button className="btn-icon coach-speak-btn" onClick={() => onSpeak(msg.reply)} title="Listen">
          <Volume2 size={15} />
        </button>
      </div>
      <ScoreChip score={msg.score} />
      <CorrectionChips corrections={msg.corrections} />
      <PronunciationTips tips={msg.pronunciation_tips} />
      <SuggestedSentences sentences={msg.suggested_sentences} onPick={onSuggest} />
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div className="coach-bubble coach-bubble--coach coach-thinking">
      <span className="dot" /><span className="dot" /><span className="dot" />
    </div>
  )
}

function MistakesList() {
  const [mistakes, setMistakes] = useState(null)  // null = loading

  useEffect(() => {
    getMistakes().then(setMistakes).catch(() => setMistakes([]))
  }, [])

  const handleDelete = async (id) => {
    await deleteMistake(id)
    setMistakes(prev => prev.filter(m => m.id !== id))
  }

  if (mistakes === null) return <div className="coach-mistakes-empty"><Loader2 size={20} className="spinning" /></div>
  if (!mistakes.length) return (
    <div className="coach-mistakes-empty">
      <BookMarked size={28} style={{ opacity: 0.3 }} />
      <p>No mistakes saved yet.<br />Keep practising and they'll appear here.</p>
    </div>
  )

  return (
    <div className="coach-mistakes-list">
      {mistakes.map(m => (
        <div key={m.id} className={`coach-mistake-card mistake-${m.severity}`}>
          <div className="mistake-header">
            <span className={`mistake-badge mistake-badge--${m.severity}`}>{m.severity}</span>
            <button className="mistake-delete" onClick={() => handleDelete(m.id)} title="Remove">
              <Trash2 size={13} />
            </button>
          </div>
          <div className="mistake-correction">
            <span className="correction-original">{m.original}</span>
            <span className="correction-arrow"> → </span>
            <span className="correction-fixed">{m.corrected}</span>
          </div>
          <p className="correction-reason">{m.explanation}</p>
          {m.context && <p className="mistake-context">"{m.context}"</p>}
        </div>
      ))}
    </div>
  )
}

export default function Coach({ setTab }) {
  const [messages, setMessages] = useState([WELCOME])
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(true)
  const [error, setError] = useState('')
  const [goal, setGoal] = useState(() => localStorage.getItem(GOAL_KEY) || '')
  const [goalOpen, setGoalOpen] = useState(false)
  const [goalDraft, setGoalDraft] = useState(() => localStorage.getItem(GOAL_KEY) || '')
  const [view, setView] = useState('chat')  // 'chat' | 'mistakes'
  const mediaRecorderRef = useRef(null)
  const recognitionRef = useRef(null)
  const chunksRef = useRef([])
  const messagesRef = useRef(messages)   // always-current messages for callbacks
  const goalRef = useRef(goal)
  const scrollRef = useRef(null)

  // Keep refs in sync so recorder callbacks always see latest state
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { goalRef.current = goal }, [goal])

  useEffect(() => {
    const { apiKey } = getSettings()
    setHasApiKey(!!apiKey)
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, loading])

  const saveGoal = () => {
    localStorage.setItem(GOAL_KEY, goalDraft)
    setGoal(goalDraft)
    setGoalOpen(false)
  }

  const historyFromMessages = (msgs) =>
    msgs.slice(1).map(m =>
      m.role === 'user'
        ? { role: 'user', text: m.text || '[voice message]' }
        : { role: 'coach', reply: m.reply, corrections: m.corrections, pronunciation_tips: m.pronunciation_tips, score: m.score }
    )

  // Core turn submission — takes text, optional audioBlob, and optional msgId to update
  const submitTurn = useCallback(async ({ text, audioBlob, msgId }) => {
    const { apiKey, ttsMode, playbackRate = 1.0 } = getSettings()
    if (!apiKey) { setHasApiKey(false); return }

    setError('')
    setLoading(true)

    try {
      const history = historyFromMessages(messagesRef.current)
      const result = await coachTurn({ text, audioBlob, history, apiKey, goal: goalRef.current })

      setMessages(prev => {
        const updated = prev.map(m => {
          if (m.id !== msgId) return m
          const finalText = result.transcript
            ? `"${result.transcript}"`
            : (m.text ?? '[voice message]')
          return { ...m, text: finalText }
        })
        return [...updated, { id: Date.now() + 1, role: 'coach', ...result }]
      })

      // Silently persist any corrections to Firestore
      if (result.corrections?.length) {
        saveMistakes(result.corrections, text ?? '').catch(() => {})
      }

      if (ttsMode === 'gemini') {
        speakGemini(result.reply, apiKey, playbackRate, 'Puck').catch(() => speakOnDevice(result.reply, playbackRate, true))
      } else {
        speakOnDevice(result.reply, playbackRate)
      }
    } catch (err) {
      if (err.message === 'no_api_key') {
        setHasApiKey(false)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [])  // empty deps — uses refs for messages/goal

  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text || loading) return
    const msgId = Date.now()
    setDraft('')
    setMessages(prev => [...prev, { id: msgId, role: 'user', text, isAudio: false }])
    submitTurn({ text, msgId })
  }, [draft, loading, submitTurn])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const toggleMic = useCallback(async () => {
    if (listening) {
      mediaRecorderRef.current?.stop()
      recognitionRef.current?.stop()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      // Run Web Speech API in parallel for an instant local transcript
      let localTranscript = ''
      let interimTranscript = ''
      let restartCount = 0
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.lang = 'sv-SE'
        recognition.interimResults = true
        recognition.continuous = !isMobile  // Android Chrome struggles with continuous=true
        recognition.onresult = (e) => {
          interimTranscript = ''
          for (const result of e.results) {
            if (result.isFinal) {
              localTranscript += result[0].transcript + ' '
            } else {
              interimTranscript += result[0].transcript
            }
          }
        }
        recognition.onerror = (e) => {
          // Log for debugging but don't block audio submission
          console.warn('SpeechRecognition error:', e.error)
        }
        recognition.onnomatch = () => {
          console.warn('SpeechRecognition: no match')
        }
        recognition.onend = () => {
          // On mobile, recognition often ends after one utterance.
          // Restart once if we're still recording and haven't restarted yet.
          if (isMobile && mediaRecorderRef.current?.state === 'recording' && restartCount < 1) {
            restartCount++
            setTimeout(() => {
              try { recognition.start() } catch {}
            }, 150)
          }
        }
        recognition.start()
        recognitionRef.current = recognition
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        recognitionRef.current?.stop()
        setListening(false)

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 1000) return  // too short, ignore

        const msgId = Date.now()
        // Fall back to interim transcript if no final results were captured
        const localText = localTranscript.trim() || interimTranscript.trim() || null

        // Show local transcript immediately (no waiting for Gemini)
        setMessages(prev => [...prev, {
          id: msgId,
          role: 'user',
          text: localText,   // null shows "Listening…" until Gemini replies
          isAudio: true
        }])

        submitTurn({ audioBlob: blob, text: localText, msgId })
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setListening(true)
      setError('')
    } catch {
      setError('Microphone access denied.')
    }
  }, [listening, submitTurn])

  const handleSpeak = useCallback((text) => {
    const { apiKey, ttsMode, playbackRate = 1.0 } = getSettings()
    if (ttsMode === 'gemini' && apiKey) {
      speakGemini(text, apiKey, playbackRate, 'Puck').catch(() => speakOnDevice(text, playbackRate, true))
    } else {
      speakOnDevice(text, playbackRate, true)
    }
  }, [])

  if (!hasApiKey) {
    return (
      <div className="section coach-no-key">
        <div className="coach-no-key-icon"><KeyRound size={32} /></div>
        <h3>Gemini API key required</h3>
        <p>Coach uses AI to analyze your Swedish. Add your Gemini API key in Settings to get started.</p>
        <button className="btn btn-primary" onClick={() => setTab('settings')}>Go to Settings</button>
      </div>
    )
  }

  return (
    <div className="coach-section">

      {/* Goal bar */}
      <div className="coach-goal-bar">
        <button className="coach-goal-toggle" onClick={() => { setGoalDraft(goal); setGoalOpen(o => !o) }}>
          <Target size={14} />
          <span>{goal || 'Set a learning goal…'}</span>
          {goalOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          className="coach-clear-btn"
          onClick={() => setMessages([{ ...WELCOME, id: Date.now() }])}
          title="Clear chat"
        >
          <RotateCcw size={14} />
        </button>
        {goalOpen && (
          <div className="coach-goal-editor">
            <input
              className="input coach-goal-input"
              placeholder="e.g. I want to practice ordering food in Swedish"
              value={goalDraft}
              onChange={e => setGoalDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveGoal()}
              autoFocus
            />
            <button className="btn btn-primary coach-goal-save" onClick={saveGoal}>Save</button>
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="coach-view-toggle">
        <button className={`coach-view-btn${view === 'chat' ? ' active' : ''}`} onClick={() => setView('chat')}>Chat</button>
        <button className={`coach-view-btn${view === 'mistakes' ? ' active' : ''}`} onClick={() => setView('mistakes')}>Mistakes</button>
      </div>

      {view === 'mistakes' && <MistakesList />}

      {/* Messages */}
      <div className="coach-messages" ref={scrollRef} style={{ display: view === 'chat' ? 'flex' : 'none' }}>
        {messages.map((msg) => (
          <CoachMessage key={msg.id} msg={msg} onSpeak={handleSpeak} onSuggest={setDraft} />
        ))}
        {loading && <ThinkingBubble />}
        {error && <p className="error" style={{ textAlign: 'center', fontSize: 13 }}>{error}</p>}
      </div>

      {/* Input row */}
      {view === 'chat' && <div className="coach-input-row">
        <button
          className={`coach-mic-btn${listening ? ' active' : ''}`}
          onClick={toggleMic}
          disabled={loading}
          title={listening ? 'Tap to stop & send' : 'Tap to speak'}
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <div className="coach-textarea-wrap">
          <textarea
            className="input coach-textarea"
            placeholder="Or type Swedish here…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={listening || loading}
          />
        </div>
        <button
          className="btn-icon coach-send-btn"
          onClick={handleSend}
          disabled={!draft.trim() || loading || listening}
          title="Send"
        >
          {loading && !listening ? <Loader2 size={18} className="spinning" /> : <Send size={18} />}
        </button>
      </div>}

    </div>
  )
}
