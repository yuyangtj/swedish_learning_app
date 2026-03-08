import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './lib/firebase.js'
import Login from './components/Login.jsx'
import WordList from './components/WordList.jsx'
import Generate from './components/Generate.jsx'
import Settings from './components/Settings.jsx'
import { BookOpen, Sparkles, SlidersHorizontal, Sun, Moon } from 'lucide-react'

const TABS = [
  { id: 'words', label: 'My Words', Icon: BookOpen },
  { id: 'generate', label: 'Generate', Icon: Sparkles },
  { id: 'settings', label: 'Settings', Icon: SlidersHorizontal }
]

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = loading
  const [tab, setTab] = useState('words')
  const [dark, setDark] = useState(() => localStorage.getItem('sv_theme') === 'dark')

  useEffect(() => {
    return onAuthStateChanged(auth, u => setUser(u ?? null))
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('sv_theme', dark ? 'dark' : 'light')
  }, [dark])

  if (user === undefined) return <div className="loading">Loading...</div>
  if (!user) return <Login />

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">Svenska</h1>
        <span className="header-sub">Swedish Learning</span>
        <button className="theme-toggle" onClick={() => setDark(d => !d)} title="Toggle theme">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <main className="main">
        {tab === 'words' && <WordList />}
        {tab === 'generate' && <Generate />}
        {tab === 'settings' && <Settings />}
      </main>

      <nav className="bottom-nav">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`nav-btn ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={22} />
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
