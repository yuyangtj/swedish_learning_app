export async function generateDialog(prompt, apiKey) {
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `You are a Swedish language teacher. Generate a natural two-person dialog in Swedish based on the user's prompt.
Use EXACTLY these speaker labels: "Person A" and "Person B".
Respond in EXACTLY this format:

Person A: [Swedish line]
Person B: [Swedish line]
Person A: [Swedish line]
Person B: [Swedish line]
(4–8 exchanges total)
---
Person A: [English translation]
Person B: [English translation]
(mirror each line above)

No extra text before or after.`
    }
  })

  const raw = response.text?.trim() || ''
  const [swedishPart, englishPart] = raw.split('---').map(s => s.trim())

  // Parse lines into [{speaker, text}] arrays
  const parseLines = block =>
    (block || '').split('\n')
      .map(l => l.match(/^(Person [AB]):\s*(.+)$/))
      .filter(Boolean)
      .map(([, speaker, text]) => ({ speaker, text: text.trim() }))

  return {
    lines: parseLines(swedishPart),
    englishLines: parseLines(englishPart),
    swedishDialog: swedishPart || raw
  }
}

export async function generateSwedish(prompt, apiKey) {
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `You are a Swedish language teacher. Generate Swedish text based on the user's prompt.
Always respond in EXACTLY this format (no extra text before or after):

Swedish: [Swedish text here]
English: [English translation here]

Keep it natural and appropriate for language learners.`
    }
  })

  const text = response.text?.trim() || ''

  // Parse the structured response
  const swMatch = text.match(/Swedish:\s*(.+?)(?:\n|$)/s)
  const enMatch = text.match(/English:\s*(.+?)(?:\n|$)/s)

  return {
    swedish: swMatch?.[1]?.trim() || text,
    english: enMatch?.[1]?.trim() || '',
    raw: text
  }
}
