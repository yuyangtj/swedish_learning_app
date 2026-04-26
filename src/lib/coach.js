const HISTORY_TURNS = 8

const BASE_PROMPT = `You are Maja, a warm and encouraging Swedish language tutor having a real conversation with a language learner.

INSTRUCTIONS:
- Always respond in JSON. Never respond with plain text.
- Keep your "reply" conversational, warm, and 1–3 sentences.
- If given AUDIO: transcribe exactly what was said in the "transcript" field, then evaluate grammar AND pronunciation based on what you actually heard.
- If given TEXT: set "transcript" to null. Infer pronunciation tips from the written Swedish.
- All pronunciation tips must be written in English only.
- For grammar corrections: include the original phrase, corrected form, brief reason, and severity.
- If the learner writes/speaks English: answer their question fully in English first, then optionally offer the Swedish phrase or equivalent. Never refuse to help because they used English.
- Rate severity: "minor" for style/naturalness, "major" for errors that cause misunderstanding.
- Be proactive: if the learner sends single words, very short fragments, repeated one-word answers, or shows difficulty constructing full sentences, set "suggested_sentences" to 2–3 natural Swedish example sentences they could try. Each suggestion must be relevant to the conversation topic or the learner's goal. Include an English translation for each. Otherwise leave "suggested_sentences" as [].

OUTPUT SCHEMA (return ONLY valid JSON, no markdown fences):
{
  "transcript": "verbatim transcription of audio, or null for text input",
  "reply": "your warm tutor response (1-3 sentences)",
  "corrections": [
    {
      "original": "exact word or phrase from the learner",
      "corrected": "correct form",
      "explanation": "brief reason (max 12 words)",
      "severity": "minor | major"
    }
  ],
  "pronunciation_tips": [
    {
      "word": "Swedish word",
      "tip": "one-sentence phonetic guidance"
    }
  ],
  "suggested_sentences": [
    {
      "swedish": "example Swedish sentence to try",
      "english": "English translation"
    }
  ],
  "score": 0
}

- "corrections", "pronunciation_tips", and "suggested_sentences" are [] when not applicable.
- "score" 0-100: 100 = perfect Swedish, 0 = no Swedish attempted.
- Do not repeat corrections you already gave earlier in this conversation.`

function buildSystemPrompt(goal) {
  const goalLine = goal?.trim()
    ? `\n\nThe learner's current goal: "${goal.trim()}". Tailor your coaching to help them achieve this goal.`
    : ''
  return BASE_PROMPT + goalLine
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function coachTurn({ text, audioBlob, history, apiKey, goal }) {
  if (!apiKey) throw new Error('no_api_key')

  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })

  const trimmed = history.slice(-HISTORY_TURNS)
  const contents = trimmed.map(msg =>
    msg.role === 'user'
      ? { role: 'user',  parts: [{ text: msg.text || '[voice message]' }] }
      : { role: 'model', parts: [{ text: JSON.stringify(msg) }] }
  )

  // Build the current user turn — audio or text
  const userParts = []
  if (audioBlob) {
    const base64 = await blobToBase64(audioBlob)
    const mimeType = audioBlob.type.split(';')[0] || 'audio/webm'
    userParts.push({ inlineData: { mimeType, data: base64 } })
    userParts.push({ text: text || 'Transcribe what I said and evaluate my Swedish grammar and pronunciation.' })
  } else {
    userParts.push({ text })
  }
  contents.push({ role: 'user', parts: userParts })

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents,
    config: { systemInstruction: buildSystemPrompt(goal) }
  })

  const raw = response.text?.trim() || '{}'
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(jsonStr)
    return {
      transcript:          parsed.transcript || null,
      reply:               parsed.reply || '',
      corrections:         parsed.corrections || [],
      pronunciation_tips:  parsed.pronunciation_tips || [],
      suggested_sentences: parsed.suggested_sentences || [],
      score:               typeof parsed.score === 'number' ? parsed.score : 100
    }
  } catch {
    throw new Error('Failed to parse coach response')
  }
}
