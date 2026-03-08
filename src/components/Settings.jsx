import { useState, useEffect } from 'react'
import { getSettings, saveSettings } from '../lib/storage.js'
import { loadCloudSettings, saveCloudSettings } from '../lib/db.js'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase.js'

export default function Settings() {
  const [apiKey, setApiKey] = useState('')
  const [ttsMode, setTtsMode] = useState('device')
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [autoSave, setAutoSave] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Fill immediately from local cache so the form is instant
    const local = getSettings()
    setApiKey(local.apiKey || '')
    setTtsMode(local.ttsMode || 'device')
    setPlaybackRate(local.playbackRate ?? 1.0)
    setAutoSave(local.autoSave ?? false)

    // Then pull from Firestore — cloud wins if it has an API key and local doesn't
    loadCloudSettings().then(cloud => {
      if (!cloud) return
      const merged = { ...local, ...cloud }
      saveSettings(merged)
      setApiKey(merged.apiKey || '')
      setTtsMode(merged.ttsMode || 'device')
      setPlaybackRate(merged.playbackRate ?? 1.0)
      setAutoSave(merged.autoSave ?? false)
    }).catch(() => {}) // offline — local cache is fine
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    const settings = { apiKey: apiKey.trim(), ttsMode, playbackRate, autoSave }
    saveSettings(settings)
    saveCloudSettings(settings).catch(() => {}) // best-effort cloud sync
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSignOut() {
    await signOut(auth)
  }

  return (
    <div className="section">
      <form className="settings-form" onSubmit={handleSave}>
        <div className="setting-group">
          <label className="setting-label">Gemini API Key</label>
          <input
            className="input"
            type="password"
            placeholder="AIza..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <p className="hint">
            Required for AI text generation and Gemini TTS.
            Get one at <span className="link-text">aistudio.google.com</span>
          </p>
        </div>

        <div className="setting-group">
          <label className="setting-label">Text-to-Speech Mode</label>
          <div className="radio-group">
            <label className="radio-option">
              <input
                type="radio"
                value="device"
                checked={ttsMode === 'device'}
                onChange={() => setTtsMode('device')}
              />
              <div>
                <strong>On-device (default)</strong>
                <p className="hint">Uses your phone's built-in Swedish voice. No API key needed. Works offline.</p>
              </div>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                value="gemini"
                checked={ttsMode === 'gemini'}
                onChange={() => setTtsMode('gemini')}
              />
              <div>
                <strong>Gemini TTS</strong>
                <p className="hint">Higher quality AI voice. Requires API key and internet.</p>
              </div>
            </label>
          </div>
        </div>

        <div className="setting-group">
          <label className="setting-label">Playback Speed</label>
          <div className="speed-options">
            {[0.5, 0.75, 1.0, 1.25, 1.5].map(rate => (
              <button
                key={rate}
                type="button"
                className={`speed-btn ${playbackRate === rate ? 'active' : ''}`}
                onClick={() => setPlaybackRate(rate)}
              >
                {rate}×
              </button>
            ))}
          </div>
          <p className="hint">Applies to all audio playback and on-device TTS.</p>
        </div>

        <div className="setting-group">
          <label className="setting-label">Auto-save</label>
          <label className="toggle-row">
            <div className={`toggle-switch ${autoSave ? 'on' : ''}`} onClick={() => setAutoSave(v => !v)}>
              <div className="toggle-thumb" />
            </div>
            <div>
              <strong>Auto-save after generating</strong>
              <p className="hint">Saves text immediately after generation. Press "Generate Audio" first if you want audio included — it will be picked up automatically.</p>
            </div>
          </label>
        </div>

        <button className="btn btn-primary" type="submit">
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </form>

      <div className="tips">
        <p><strong>Setup guide:</strong></p>
        <ul>
          <li>For on-device TTS on Android, go to <em>Settings &gt; Accessibility &gt; Text-to-speech</em> and install a Swedish language pack.</li>
          <li>For Gemini features, get a free API key from Google AI Studio.</li>
        </ul>
      </div>

      <button className="btn btn-signout" onClick={handleSignOut}>
        Sign Out
      </button>
    </div>
  )
}
