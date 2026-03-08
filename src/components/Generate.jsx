import { useState, useEffect } from 'react'
import { generateSwedish, generateDialog } from '../lib/gemini.js'
import { speakOnDevice, getGeminiAudioBlob, getGeminiDialogAudioBlob } from '../lib/tts.js'
import { addWord, addDialog, updateWordAudio } from '../lib/db.js'
import { getSettings } from '../lib/storage.js'
import { BookmarkPlus, Check, Loader2, Volume2, Sparkles } from 'lucide-react'

// Module-level — survives tab switches within the same session
const cache = { audioBlob: null, savedWord: null }

const TEXT_TIPS = [
  ['Common Swedish greeting', 'Give me a common Swedish greeting'],
  ['Order food at a restaurant', 'How do I order food at a restaurant in Swedish?'],
  ['Translate a sentence', 'Translate: I would like to go to the library'],
  ['Talk about the weather', 'Give me a simple Swedish sentence about the weather']
]

const DIALOG_TIPS = [
  ['Order coffee at a café', 'A dialog about ordering coffee at a café'],
  ['Ask for directions', 'A dialog about asking for directions in a city'],
  ['At a doctor appointment', 'A dialog at a Swedish doctor appointment'],
  ['Meeting someone new', 'A dialog between two people meeting for the first time']
]

export default function Generate() {
  const [mode, setMode] = useState('text') // 'text' | 'dialog'
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState(null)
  const [dialogResult, setDialogResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [ttsStatus, setTtsStatus] = useState(() => cache.audioBlob ? 'ready' : 'idle')
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'uploading' | 'done'
  const [error, setError] = useState('')

  // Sync ttsStatus when returning to this tab if audio was generated while away
  useEffect(() => {
    if (cache.audioBlob) setTtsStatus('ready')
  }, [])

  function reset() {
    setSaveStatus('idle')
    setTtsStatus('idle')
    cache.audioBlob = null
    cache.savedWord = null
  }

  function switchMode(m) {
    setMode(m)
    setPrompt('')
    setResult(null)
    setDialogResult(null)
    setError('')
    reset()
  }

  async function handleGenerate(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    setDialogResult(null)
    reset()

    const settings = getSettings()
    if (!settings.apiKey) {
      setError('Add your Gemini API key in Settings first.')
      return
    }

    setLoading(true)
    try {
      let generated
      if (mode === 'text') {
        generated = await generateSwedish(prompt, settings.apiKey)
        setResult(generated)
      } else {
        generated = await generateDialog(prompt, settings.apiKey)
        setDialogResult(generated)
      }
      if (settings.autoSave) {
        await doSave(mode, generated)
      }
    } catch (err) {
      setError('Generation failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // On-device TTS — free, no API cost, works offline
  function handleListen() {
    const settings = getSettings()
    const rate = settings.playbackRate ?? 1.0
    const text = mode === 'dialog'
      ? dialogResult?.lines?.map(l => l.text).join(' ')
      : result?.swedish
    if (text) speakOnDevice(text, rate)
  }

  // Gemini TTS — uses API credit once, then plays from cache on repeat presses
  async function handleGenerateAudio() {
    setError('')
    setTtsStatus('loading')
    try {
      const settings = getSettings()
      if (!settings.apiKey) throw new Error('Gemini API key required')
      const src = mode === 'dialog' ? dialogResult : result

      // Fetch only on first press; replay from cache afterwards
      if (!cache.audioBlob) {
        let blob
        if (mode === 'dialog' && src) {
          blob = await getGeminiDialogAudioBlob(src.swedishDialog, settings.apiKey)
        } else if (src) {
          blob = await getGeminiAudioBlob(src.swedish, settings.apiKey)
        }
        cache.audioBlob = blob
      }

      const blob = cache.audioBlob
      const rate = settings.playbackRate ?? 1.0
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.playbackRate = rate
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      setTtsStatus('ready')

      // If the word was already saved without audio, patch it now
      const saved = cache.savedWord
      if (saved && !saved.hasAudio) {
        updateWordAudio(saved.id, saved.text, blob).catch(() => {})
        cache.savedWord = { ...saved, hasAudio: true }
      }
    } catch (err) {
      setError('Audio generation failed: ' + err.message)
      setTtsStatus('idle')
    }
  }

  // Save text + audio if already generated; never generates audio on its own
  async function doSave(currentMode, generated) {
    setSaveStatus('uploading')
    const audioBlob = cache.audioBlob ?? null
    let entry
    if (currentMode === 'dialog') {
      entry = await addDialog(generated.lines, generated.englishLines, generated.swedishDialog, audioBlob)
    } else {
      entry = await addWord(generated.swedish, generated.english, audioBlob)
    }
    cache.savedWord = { id: entry.id, text: entry.swedish, hasAudio: !!audioBlob }
    setSaveStatus('done')
  }

  async function handleSave() {
    setError('')
    const currentMode = mode
    const generated = currentMode === 'dialog' ? dialogResult : result
    if (!generated) return
    try {
      await doSave(currentMode, generated)
    } catch (err) {
      setError('Save failed: ' + err.message)
      setSaveStatus('idle')
    }
  }

  const saving = saveStatus === 'uploading'
  const saved = saveStatus === 'done'
  const saveLabel = saving ? 'Saving...' : saved
    ? (cache.audioBlob ? 'Saved with audio!' : 'Saved!')
    : (cache.audioBlob ? 'Save with audio' : '+ Save')

  const tips = mode === 'dialog' ? DIALOG_TIPS : TEXT_TIPS
  const hasResult = mode === 'text' ? !!result : !!dialogResult

  return (
    <div className="section">
      <div className="mode-toggle">
        <button className={`mode-btn ${mode === 'text' ? 'active' : ''}`} onClick={() => switchMode('text')}>
          Text
        </button>
        <button className={`mode-btn ${mode === 'dialog' ? 'active' : ''}`} onClick={() => switchMode('dialog')}>
          Dialog
        </button>
      </div>

      <form className="add-form" onSubmit={handleGenerate}>
        <textarea
          className="input textarea"
          placeholder={mode === 'text'
            ? "Describe what you want in Swedish... e.g. 'Give me a common Swedish greeting'"
            : "Describe the dialog scenario... e.g. 'A conversation about ordering coffee at a café'"}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={3}
          required
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {mode === 'text' && result && (
        <div className="result-card">
          <div className="result-swedish">{result.swedish}</div>
          {result.english && <div className="result-english">{result.english}</div>}
          <ResultActions
            ttsStatus={ttsStatus} saving={saving} saved={saved} saveLabel={saveLabel}
            onListen={handleListen} onGenerateAudio={handleGenerateAudio} onSave={handleSave}
          />
        </div>
      )}

      {mode === 'dialog' && dialogResult && (
        <div className="result-card">
          <div className="dialog-lines">
            {dialogResult.lines.map((line, i) => (
              <div key={i} className={`dialog-line ${line.speaker === 'Person A' ? 'line-a' : 'line-b'}`}>
                <span className="dialog-speaker">{line.speaker}</span>
                <span className="dialog-text">{line.text}</span>
              </div>
            ))}
          </div>
          {dialogResult.englishLines?.length > 0 && (
            <details className="dialog-translation">
              <summary>Show English translation</summary>
              <div className="dialog-lines translation">
                {dialogResult.englishLines.map((line, i) => (
                  <div key={i} className="dialog-line">
                    <span className="dialog-speaker">{line.speaker}</span>
                    <span className="dialog-text">{line.text}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div className="result-hint">Person A: Kore · Person B: Puck</div>
          <ResultActions
            ttsStatus={ttsStatus} saving={saving} saved={saved} saveLabel={saveLabel}
            onListen={handleListen} onGenerateAudio={handleGenerateAudio} onSave={handleSave}
          />
        </div>
      )}

      {!hasResult && (
        <div className="tips">
          <p><strong>Try prompts like:</strong></p>
          <ul>
            {tips.map(([label, p]) => (
              <li key={label} className="tip-item" onClick={() => setPrompt(p)}>{label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ResultActions({ ttsStatus, saving, saved, saveLabel, onListen, onGenerateAudio, onSave }) {
  return (
    <div className="result-actions">
      <button className="btn btn-secondary" onClick={onListen}>
        <Volume2 size={16} />
        Listen
      </button>
      <button className="btn btn-secondary" onClick={onGenerateAudio} disabled={ttsStatus === 'loading'}>
        {ttsStatus === 'loading' ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
        {ttsStatus === 'loading' ? 'Generating...' : ttsStatus === 'ready' ? 'Play again' : 'Generate Audio'}
      </button>
      <button className="btn btn-secondary" onClick={onSave} disabled={saving || saved}>
        {saved ? <Check size={16} /> : saving ? <Loader2 size={16} className="spin" /> : <BookmarkPlus size={16} />}
        {saveLabel}
      </button>
    </div>
  )
}
