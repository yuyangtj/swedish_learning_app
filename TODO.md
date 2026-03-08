# TODO

## Infrastructure
- [ ] **Separate dev/prod Firebase projects** — currently `npm run dev` and the deployed app share the same Firestore + Storage. Create a `swedish-learning-app-dev` Firebase project and point `.env.local` at it to avoid polluting real data during testing.
- [x] **Review Firestore security rules** — confirm rules only allow users to read/write their own `users/{uid}/words` subcollection and `users/{uid}` settings doc.

## Bugs / Polish
- [ ] **Dark mode not synced across devices** — theme preference is stored in `localStorage` only; it should be included in `saveCloudSettings` so it follows the user to Android/other browsers.
- [ ] **Review session uses stale word snapshot** — `ReviewSession` snapshots `initialWords` at start, so if `audio_url` gets patched during a session the card still shows the Play icon instead of Volume2. Fix: pass a live word lookup map from the parent.

## Testing
- [ ] **Add component tests** — `WordCard` edit flow, `ReviewSession` swipe/rating, `Generate` auto-save + audio patching.
- [ ] **Add db.js integration tests** — mock Firestore and verify `updateWordAudio` patches the right doc.

## Features
- [ ] **Daily review reminder** — Web Push notification or at least a badge on the PWA icon showing how many cards are due.
- [ ] **Bulk actions in My Words** — select multiple words to delete or regenerate audio in one go.
- [ ] **Export / import** — download all words as JSON for backup; import from JSON to restore or migrate.
- [ ] **Usage cost tracker** — show a rough estimate of Gemini API calls made this session (text generations + TTS generations) so the user can keep an eye on spend.
- [ ] **Word stats** — total reviews, know/hard ratio per word, visible somewhere in the word card or a detail view.
