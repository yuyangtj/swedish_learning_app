// On-device TTS via Web Speech API
export function speakOnDevice(text, playbackRate = 1.0) {
  if (!window.speechSynthesis) {
    alert('Speech synthesis not supported in this browser.')
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'sv-SE'
  utterance.rate = 0.85 * playbackRate
  utterance.pitch = 1.0

  // Try to find a Swedish voice
  const voices = window.speechSynthesis.getVoices()
  const svVoice = voices.find(v => v.lang.startsWith('sv'))
  if (svVoice) utterance.voice = svVoice

  window.speechSynthesis.speak(utterance)
}

// Gemini TTS — fetches audio and returns a WAV Blob
export async function getGeminiAudioBlob(text, apiKey) {
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: text,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }
        }
      }
    }
  })

  const part = response.candidates?.[0]?.content?.parts?.[0]
  if (!part?.inlineData?.data) throw new Error('No audio data in response')
  return pcmToWav(part.inlineData.data)
}

// Multi-speaker dialog TTS — Person A: Kore (female), Person B: Puck (male)
export async function getGeminiDialogAudioBlob(dialogText, apiKey) {
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: dialogText,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Person A',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            {
              speaker: 'Person B',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
            }
          ]
        }
      }
    }
  })

  const part = response.candidates?.[0]?.content?.parts?.[0]
  if (!part?.inlineData?.data) throw new Error('No audio data in response')
  return pcmToWav(part.inlineData.data)
}

// Play Gemini TTS audio
export async function speakGemini(text, apiKey, playbackRate = 1.0) {
  const blob = await getGeminiAudioBlob(text, apiKey)
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.playbackRate = playbackRate
  audio.onended = () => URL.revokeObjectURL(url)
  return audio.play()
}

// Gemini TTS returns raw PCM (24kHz, 16-bit, mono) — wrap it in a WAV header
function pcmToWav(base64pcm) {
  const pcm = Uint8Array.from(atob(base64pcm), c => c.charCodeAt(0))
  const sampleRate = 24000
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.length
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const write = (offset, str) =>
    [...str].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))

  write(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)       // chunk size
  view.setUint16(20, 1, true)        // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  write(36, 'data')
  view.setUint32(40, dataSize, true)
  new Uint8Array(buffer, 44).set(pcm)

  return new Blob([buffer], { type: 'audio/wav' })
}
