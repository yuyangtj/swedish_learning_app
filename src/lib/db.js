import {
  collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, updateDoc, getDoc, setDoc
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { auth, db, storage } from './firebase.js'
import { initSrs, nextSrs } from './srs.js'

// Words are stored as: users/{uid}/words/{wordId}
// User settings are stored at: users/{uid}  (top-level doc, merge-safe)
// No composite index needed — orderBy on a single field within a subcollection.
function wordsCol() {
  return collection(db, 'users', auth.currentUser.uid, 'words')
}

function userDoc() {
  return doc(db, 'users', auth.currentUser.uid)
}

export async function loadCloudSettings() {
  const snap = await getDoc(userDoc())
  return snap.exists() ? (snap.data().settings ?? null) : null
}

export async function saveCloudSettings(settings) {
  await setDoc(userDoc(), { settings }, { merge: true })
}

export async function getWords() {
  const snap = await getDocs(query(wordsCol(), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateWordSrs(id, currentWord, rating) {
  const srsUpdate = nextSrs(currentWord, rating)
  await updateDoc(doc(db, 'users', auth.currentUser.uid, 'words', id), srsUpdate)
  return srsUpdate
}

export async function addWord(swedish, english = '', audioBlob = null) {
  let audio_url = null
  if (audioBlob) {
    audio_url = await uploadAudio(audioBlob, swedish)
  }
  const payload = {
    swedish: swedish.trim(),
    english: english.trim(),
    audio_url,
    createdAt: new Date().toISOString(),
    ...initSrs()
  }
  const ref_ = await addDoc(wordsCol(), payload)
  return { id: ref_.id, ...payload }
}

export async function addDialog(lines, englishLines, swedishDialog, audioBlob = null) {
  let audio_url = null
  if (audioBlob) {
    audio_url = await uploadAudio(audioBlob, `dialog_${Date.now()}`)
  }
  const payload = {
    type: 'dialog',
    lines,           // [{speaker, text}]
    englishLines,    // [{speaker, text}]
    swedish: swedishDialog, // raw text for fallback
    audio_url,
    createdAt: new Date().toISOString(),
    ...initSrs()
  }
  const ref_ = await addDoc(wordsCol(), payload)
  return { id: ref_.id, ...payload }
}

export async function updateWordAudio(id, swedish, audioBlob) {
  const audio_url = await uploadAudio(audioBlob, swedish)
  await updateDoc(doc(db, 'users', auth.currentUser.uid, 'words', id), { audio_url })
  return audio_url
}

export async function updateWord(id, swedish, english) {
  await updateDoc(doc(db, 'users', auth.currentUser.uid, 'words', id), {
    swedish: swedish.trim(),
    english: english.trim()
  })
}

export async function deleteWord(id, audioUrl = null) {
  if (audioUrl) {
    try {
      // Extract storage path from the download URL:
      // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}?...
      const path = decodeURIComponent(audioUrl.split('/o/')[1].split('?')[0])
      await deleteObject(ref(storage, path))
    } catch {
      // File may already be gone — ignore
    }
  }
  await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'words', id))
}

async function uploadAudio(blob, swedish) {
  const uid = auth.currentUser.uid
  const name = `${Date.now()}_${swedish.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}.wav`
  const storageRef = ref(storage, `audio/${uid}/${name}`)
  await uploadBytes(storageRef, blob, { contentType: 'audio/wav' })
  return getDownloadURL(storageRef)
}
