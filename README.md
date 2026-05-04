# Project Tutor

Project Tutor is a local-first learning web app that turns a project folder of knowledge files into a study workspace. It can explain documents, search the loaded corpus, quiz you, score teach-back answers, track mastery, and support browser-native voice input/output.

## What Is Loaded

The current bundled snapshot was generated from:

```text
/Users/robertdomondon/downloads/new_civilization
```

It includes Markdown, text, JSON, and visible placeholder entries for Office documents that need conversion before full tutoring.

## Run Locally

From this directory:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Open:

```text
http://localhost:4173/
```

To view from a phone on the same Wi-Fi, open your Mac's network URL, for example:

```text
http://10.0.0.61:4173/
```

## Refresh The Knowledge Snapshot

```bash
node scripts/build-knowledge.mjs /path/to/knowledge-folder
```

This rewrites `data/knowledge.js`.

## App Features

- Knowledge file browser with search and section filters
- Explanation mode grounded in file summaries and headings
- Ask mode over the loaded snapshot
- Quiz mode with multiple-choice and teach-back checks
- Mastery tracking in local storage
- Browser-native dictation for questions and teach-back answers
- Browser-native read-aloud for explanations
- PWA manifest, icon, and service worker for mobile home-screen use

## Notes

Voice features depend on the browser's Web Speech API support and microphone permissions. For best mobile behavior, use Safari on iPhone or Chrome/Edge on Android.
