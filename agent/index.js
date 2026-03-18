#!/usr/bin/env node
/**
 * Swedish Learning App — Claude Agent
 *
 * An AI agent that accesses your vocabulary progress and audio from Firebase.
 *
 * SETUP:
 *   1. Set up Firebase Admin credentials:
 *      a) Download a service account key from Firebase Console → Project Settings → Service Accounts
 *      b) Save it as agent/service-account.json  (git-ignored)
 *      c) Set: export GOOGLE_APPLICATION_CREDENTIALS=./agent/service-account.json
 *
 *   2. Set required environment variables:
 *      export ANTHROPIC_API_KEY=sk-ant-...
 *      export FIREBASE_PROJECT_ID=your-project-id
 *      export FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
 *      export USER_UID=the-firebase-user-uid-to-access
 *      export GEMINI_API_KEY=AIza...   # Optional — for audio generation
 *
 *   3. Install dependencies (from project root):
 *      npm install firebase-admin @anthropic-ai/sdk
 *
 *   4. Run:
 *      node agent/index.js
 *      node agent/index.js --prompt "Which words am I struggling with most?"
 *      node agent/index.js --prompt "Play audio for my due words"
 *      node agent/index.js --uid <uid> --prompt "Show my progress summary"
 */

import Anthropic from '@anthropic-ai/sdk'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { GoogleGenAI } from '@google/genai'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── SRS Utilities (mirrors src/lib/srs.js) ───────────────────────────────────

const SRS_INTERVALS = [1, 2, 5, 14, 30, 90]
const SRS_MAX_LEVEL = SRS_INTERVALS.length - 1
const LEVEL_LABELS = ['Day 1', 'Day 2', 'Day 5', 'Day 14', 'Day 30', 'Day 90']

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextSrs(current, rating) {
  const now = new Date().toISOString()
  if (rating === 'know') {
    const nextLevel = Math.min((current.srsLevel ?? 0) + 1, SRS_MAX_LEVEL)
    return {
      srsLevel: nextLevel,
      srsDueDate: addDays(today(), SRS_INTERVALS[nextLevel]),
      srsLastReview: now,
    }
  }
  // 'hard' — reset to level 0, due tomorrow
  return { srsLevel: 0, srsDueDate: addDays(today(), 1), srsLastReview: now }
}

function isDue(word) {
  if (!word.srsDueDate) return true
  return word.srsDueDate <= today()
}

function daysUntilDue(word) {
  if (!word.srsDueDate) return 0
  const due = new Date(word.srsDueDate + 'T00:00:00')
  if (isNaN(due.getTime())) return 0
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((due - now) / 86400000)
}

// ─── Firebase Admin Setup ─────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length > 0) return getFirestore()

  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID environment variable is required')

  const serviceAccountPath = resolve(__dirname, 'service-account.json')
  if (existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
    initializeApp({ credential: cert(serviceAccount), projectId })
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Uses the file path automatically
    initializeApp({ projectId })
  } else {
    throw new Error(
      'Firebase credentials not found.\n' +
      'Either place agent/service-account.json in the agent directory,\n' +
      'or set GOOGLE_APPLICATION_CREDENTIALS to a service account key file path.'
    )
  }

  return getFirestore()
}

// ─── Tool Implementations ─────────────────────────────────────────────────────

function wordSummary(w) {
  return {
    id: w.id,
    swedish: w.swedish,
    english: w.english ?? null,
    type: w.type ?? 'word',
    srs_level: w.srsLevel ?? 0,
    srs_level_label: LEVEL_LABELS[w.srsLevel ?? 0],
    due_date: w.srsDueDate ?? null,
    days_until_due: daysUntilDue(w),
    is_due: isDue(w),
    has_audio: !!w.audio_url,
    audio_url: w.audio_url ?? null,
    last_review: w.srsLastReview ?? null,
    created_at: w.createdAt ?? null,
  }
}

async function getProgressSummary(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('words').get()
  const words = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  const due = words.filter(isDue)
  const levelDist = Array(6).fill(0)
  for (const w of words) levelDist[w.srsLevel ?? 0]++

  const withAudio = words.filter(w => w.audio_url)
  const dialogs = words.filter(w => w.type === 'dialog')

  return {
    today: today(),
    total_words: words.length,
    total_dialogs: dialogs.length,
    due_for_review: due.length,
    words_with_audio: withAudio.length,
    level_distribution: levelDist.map((count, i) => ({
      level: i,
      label: LEVEL_LABELS[i],
      count,
    })),
    mastered_count: levelDist[5], // level 5 = Day 90 interval
  }
}

async function listWords(db, uid, { filter = 'all', level, limit = 50 } = {}) {
  const snap = await db
    .collection('users').doc(uid).collection('words')
    .orderBy('createdAt', 'desc')
    .limit(Math.min(limit, 200))
    .get()

  let words = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  if (filter === 'due') words = words.filter(isDue)
  if (filter === 'by_level' && typeof level === 'number') {
    words = words.filter(w => (w.srsLevel ?? 0) === level)
  }
  if (filter === 'dialogs') words = words.filter(w => w.type === 'dialog')

  return words.map(wordSummary)
}

async function getWord(db, uid, id) {
  const snap = await db.collection('users').doc(uid).collection('words').doc(id).get()
  if (!snap.exists) return { error: `Word with id "${id}" not found` }

  const w = { id: snap.id, ...snap.data() }
  return {
    ...wordSummary(w),
    lines: w.lines ?? null,         // dialog lines [{speaker, text}]
    english_lines: w.englishLines ?? null,
  }
}

async function updateSrsProgress(db, uid, id, rating) {
  const snap = await db.collection('users').doc(uid).collection('words').doc(id).get()
  if (!snap.exists) return { error: `Word with id "${id}" not found` }

  const word = snap.data()
  const update = nextSrs(word, rating)
  await db.collection('users').doc(uid).collection('words').doc(id).update(update)

  return {
    success: true,
    word_id: id,
    swedish: word.swedish,
    rating,
    new_srs_level: update.srsLevel,
    new_srs_level_label: LEVEL_LABELS[update.srsLevel],
    new_due_date: update.srsDueDate,
  }
}

// Convert base64 PCM to base64 WAV (Node.js version of pcmToWav from tts.js)
function pcmToWavBase64(base64pcm) {
  const pcm = Buffer.from(base64pcm, 'base64')
  const sampleRate = 24000
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)

  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)       // PCM format
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm]).toString('base64')
}

async function getAudio(db, uid, { id, text, generate = false }) {
  // Look up the word if an id is provided
  let swedish = text
  let audioUrl = null

  if (id) {
    const snap = await db.collection('users').doc(uid).collection('words').doc(id).get()
    if (!snap.exists) return { error: `Word with id "${id}" not found` }
    const w = snap.data()
    swedish = w.swedish ?? text
    audioUrl = w.audio_url ?? null
  }

  // Return cached Firebase Storage URL if available and not forcing generation
  if (audioUrl && !generate) {
    return {
      type: 'cached_url',
      audio_url: audioUrl,
      text: swedish,
      note: 'This is a Firebase Storage download URL — valid for a limited time.',
    }
  }

  // Generate via Gemini TTS
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      error: 'No cached audio available and GEMINI_API_KEY is not set.',
      text: swedish,
      suggestion: 'Set GEMINI_API_KEY to generate audio via Gemini TTS.',
    }
  }

  if (!swedish) return { error: 'No text to generate audio for — provide id or text.' }

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: swedish,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    })

    const part = response.candidates?.[0]?.content?.parts?.[0]
    if (!part?.inlineData?.data) throw new Error('No audio data in Gemini response')

    const base64Wav = pcmToWavBase64(part.inlineData.data)
    return {
      type: 'generated',
      format: 'wav',
      encoding: 'base64',
      base64_audio: base64Wav,
      text: swedish,
      note: 'Decode with: Buffer.from(base64_audio, "base64") and save as .wav file',
    }
  } catch (err) {
    return { error: `Gemini TTS failed: ${err.message}`, text: swedish }
  }
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_progress_summary',
    description:
      'Get an overall summary of the user\'s Swedish learning progress: ' +
      'total word count, how many words are due for review today, SRS level ' +
      'distribution across all 6 levels, and number of mastered words.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_words',
    description:
      'List vocabulary words with their SRS progress data. ' +
      'Supports filtering: all words, only words due for review, ' +
      'words at a specific SRS level, or only dialog entries.',
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'due', 'by_level', 'dialogs'],
          description: 'Filter mode: all=all words, due=only due today, by_level=specific level, dialogs=only dialog entries',
        },
        level: {
          type: 'number',
          description: 'SRS level 0–5 to filter by (only relevant when filter=by_level)',
        },
        limit: {
          type: 'number',
          description: 'Maximum words to return (default 50, max 200)',
        },
      },
    },
  },
  {
    name: 'get_word',
    description:
      'Get full details for a single vocabulary word or dialog by its Firestore document ID, ' +
      'including SRS progress, audio URL, and dialog lines if applicable.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Firestore document ID of the word' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_srs_progress',
    description:
      "Update a word's spaced repetition state after a review. " +
      "'know' advances the word to the next level (longer interval). " +
      "'hard' resets back to level 0 (due again tomorrow).",
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Firestore document ID of the word' },
        rating: {
          type: 'string',
          enum: ['know', 'hard'],
          description: "'know' = user recalled it correctly; 'hard' = user struggled",
        },
      },
      required: ['id', 'rating'],
    },
  },
  {
    name: 'get_audio',
    description:
      'Get audio for a Swedish word or phrase. ' +
      'If the word has a cached audio file in Firebase Storage, returns its URL. ' +
      'Otherwise generates audio via Gemini TTS (requires GEMINI_API_KEY). ' +
      'Provide either a word id (to look up from the database) or a text string ' +
      'for on-the-fly generation.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Firestore document ID — looks up the word and returns its cached audio_url',
        },
        text: {
          type: 'string',
          description: 'Swedish text to generate audio for (used when no id is given, or when generate=true)',
        },
        generate: {
          type: 'boolean',
          description: 'Force Gemini TTS generation even if a cached URL already exists (default: false)',
        },
      },
    },
  },
]

// ─── Main Agent Loop ──────────────────────────────────────────────────────────

async function executeTool(db, uid, name, input) {
  switch (name) {
    case 'get_progress_summary':
      return JSON.stringify(await getProgressSummary(db, uid))

    case 'list_words':
      return JSON.stringify(await listWords(db, uid, input))

    case 'get_word':
      return JSON.stringify(await getWord(db, uid, input.id))

    case 'update_srs_progress':
      return JSON.stringify(await updateSrsProgress(db, uid, input.id, input.rating))

    case 'get_audio':
      return JSON.stringify(await getAudio(db, uid, input))

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2)
  const getArg = flag => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : null
  }

  const uid = getArg('--uid') ?? process.env.USER_UID
  if (!uid) {
    console.error('Error: Provide --uid <firebase-user-uid> or set USER_UID env var')
    process.exit(1)
  }

  const prompt =
    getArg('--prompt') ??
    'Give me a summary of my Swedish learning progress. ' +
    'Tell me how many words I have, how many are due for review today, ' +
    'and list the due words grouped by SRS level.'

  // Initialize services
  const db = initFirebase()
  const anthropic = new Anthropic()

  console.log(`\nSwedish Learning Agent`)
  console.log(`User UID : ${uid}`)
  console.log(`Prompt   : ${prompt}\n`)
  console.log('─'.repeat(60))

  const messages = [{ role: 'user', content: prompt }]

  // Agentic loop
  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: `You are a helpful Swedish language learning assistant.
You have access to the user's vocabulary database stored in Firebase Firestore.
You can read their word list, check SRS (spaced repetition) progress, update review results, and access audio.

SRS levels and review intervals:
  Level 0 → review in 1 day   (Day 1)
  Level 1 → review in 2 days  (Day 2)
  Level 2 → review in 5 days  (Day 5)
  Level 3 → review in 14 days (Day 14)
  Level 4 → review in 30 days (Day 30)
  Level 5 → review in 90 days (Day 90) — "mastered"

A word is "due" when its srsDueDate <= today's date.
Rating "know" advances level; "hard" resets to level 0 and sets due tomorrow.

For audio:
- Words with audio_url have pre-recorded audio in Firebase Storage.
- Words without can have audio generated via Gemini TTS.
- The get_audio tool returns either a URL or base64-encoded WAV data.`,
      tools: TOOLS,
      messages,
    })

    if (response.stop_reason === 'end_turn') {
      for (const block of response.content) {
        if (block.type === 'text') console.log('\n' + block.text)
      }
      break
    }

    // Handle tool use
    const toolBlocks = response.content.filter(b => b.type === 'tool_use')
    messages.push({ role: 'assistant', content: response.content })

    const toolResults = []
    for (const tool of toolBlocks) {
      process.stdout.write(`  [${tool.name}] `)
      try {
        const result = await executeTool(db, uid, tool.name, tool.input)
        const parsed = JSON.parse(result)
        // Show a brief summary in the console
        if (parsed.error) {
          console.log(`ERROR: ${parsed.error}`)
        } else if (Array.isArray(parsed)) {
          console.log(`${parsed.length} items`)
        } else if (parsed.total_words !== undefined) {
          console.log(`${parsed.total_words} words, ${parsed.due_for_review} due`)
        } else if (parsed.success) {
          console.log(`updated ${parsed.swedish} → level ${parsed.new_srs_level}`)
        } else if (parsed.type === 'generated') {
          console.log(`generated audio (${parsed.base64_audio.length} chars base64)`)
        } else {
          console.log('done')
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: result })
      } catch (err) {
        console.log(`FAILED: ${err.message}`)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: JSON.stringify({ error: err.message }),
          is_error: true,
        })
      }
    }

    messages.push({ role: 'user', content: toolResults })
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message)
  if (err.message.includes('credentials')) {
    console.error('\nHint: Make sure GOOGLE_APPLICATION_CREDENTIALS points to a valid service account key,')
    console.error('      or place agent/service-account.json in the agent directory.')
  }
  process.exit(1)
})
