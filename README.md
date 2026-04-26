# Svenska — Swedish Learning App

A progressive web app for learning Swedish vocabulary through spaced repetition, AI-generated content, and a conversational language coach.

Live: [swedish-learning-app.web.app](https://swedish-learning-app.web.app)

## Features

### My Words
- Add Swedish words and phrases with English translations
- Spaced repetition system (SRS) with 6 levels (1 → 2 → 5 → 14 → 30 → 90 days)
- Flashcard review sessions with swipe gestures (right = know, left = hard)
- Audio playback via device TTS or Gemini TTS
- Playlist mode to listen through all or due words sequentially
- Infinite scroll word list with search

### Generate
- AI-generated Swedish sentences and two-person dialogs using Gemini
- High-quality audio generation with multi-speaker TTS
- One-tap save to word list with auto-cached audio

### Coach
- Conversational AI tutor (Maja) for pronunciation and grammar practice
- **Voice input** — speak directly into your mic; audio is sent to Gemini for real pronunciation feedback alongside an instant local transcript
- **Text input** — type Swedish or English; Maja answers in either language
- Grammar corrections with severity levels (major / minor)
- Pronunciation tips in English based on written or spoken Swedish
- Proactive sentence suggestions when you struggle with full phrases
- Fixed male voice (Gemini Puck) for consistent tutor responses
- Customisable learning goal that shapes Maja's coaching focus
- Mistake tracker — corrections are saved to Firestore and reviewable any time

### Settings
- Bring your own Gemini API key (stored locally, never sent to any server other than Google)
- TTS mode toggle: on-device (free, offline) or Gemini (higher quality)
- Playback speed control (0.5× – 1.5×)
- Auto-save generated content

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, PWA (vite-plugin-pwa) |
| Auth & Database | Firebase Auth, Firestore |
| File Storage | Firebase Cloud Storage |
| AI / LLM | Google Gemini API (`@google/genai`) |
| TTS | Gemini TTS + Web Speech API |
| STT | Web Speech API (local) + Gemini audio input |
| Hosting | Firebase Hosting |
| Tests | Vitest, Testing Library |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Firebase](https://console.firebase.google.com) project with Auth, Firestore, and Storage enabled
- A [Gemini API key](https://aistudio.google.com/app/apikey) (free tier works)

### Installation

```bash
git clone https://github.com/yuyangtj/swedish-learning-app.git
cd swedish-learning-app
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Sign in with an account created in your Firebase Auth console.

Your Gemini API key is entered inside the app under **Settings** — it stays in your browser and is only sent directly to Google's API.

### Tests

```bash
npm test          # watch mode
npm run test:run  # single run
```

### Deploy

```bash
npm run deploy
```

This builds the app and deploys hosting + Firestore rules to Firebase in one step.

## Firestore Data Model

```
users/{uid}/
├── words/{wordId}          — vocabulary words and dialogs (SRS state, audio URL)
├── mistakes/{mistakeId}    — grammar corrections logged by the Coach
└── settings                — API key, TTS mode, playback rate, auto-save
```

## Project Structure

```
src/
├── components/
│   ├── Coach.jsx       — Coach tab (voice/text input, chat UI, mistake tracking)
│   ├── Generate.jsx    — Generate tab (AI text and dialog generation)
│   ├── Login.jsx       — Auth screen
│   ├── Settings.jsx    — Settings tab
│   └── WordList.jsx    — My Words tab (SRS review, playlist, word cards)
├── lib/
│   ├── coach.js        — Gemini coaching integration (multi-turn, audio input)
│   ├── db.js           — Firestore CRUD operations
│   ├── firebase.js     — Firebase app initialisation
│   ├── gemini.js       — Text and dialog generation
│   ├── srs.js          — Spaced repetition logic
│   ├── storage.js      — localStorage helpers (settings, streak)
│   └── tts.js          — TTS: device (Web Speech API) and Gemini
├── App.jsx             — Root component, tab navigation, auth state
└── index.css           — All styles (CSS variables, dark mode)
```
