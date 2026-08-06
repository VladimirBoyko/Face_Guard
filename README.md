# FaceGuard

FaceGuard is a local-only browser prototype for active-session screen privacy.
It enrols an authorised user in volatile page memory, analyses webcam frames on
the device, and conceals the protected FaceGuard workspace when the user leaves,
an additional viewer appears, or the viewing state cannot be confirmed.

## Privacy boundary

- Webcam frames are processed in the browser.
- Face model files are served from this repository.
- Face descriptors are held only in JavaScript memory for the active session.
- The application has no account, database, analytics, uploads, or cloud API.
- Starting a session requests browser fullscreen so the decoy can cover the
  display while the browser remains in fullscreen mode.
- Ending the session stops webcam tracks and clears the descriptor references.
- This browser MVP protects the FaceGuard page and its fullscreen display. It
  cannot cover unrelated tabs after fullscreen is exited or native
  applications. Cross-tab protection requires a browser extension; system-wide
  protection requires a native desktop application.

## Run locally

Prerequisites: Node.js 22.13 or newer and pnpm.

```bash
pnpm install
pnpm run dev
```

Open the localhost address printed by the development server. Camera access is
available on localhost because browsers treat it as a secure context.

## Validate

```bash
pnpm run build
pnpm test
pnpm run lint
```

## Current MVP flow

1. Explain privacy behaviour and request camera consent.
2. Capture five guided single-user enrolment photos.
3. Average the five photos into an in-memory face descriptor.
4. Classify continuous observations as safe, additional viewer, absent, or
   uncertain.
5. Show the decoy overlay for unsafe and uncertain states.
6. Stop the webcam and clear biometric session state when the session ends.

The current similarity threshold is `0.45`. Absence and uncertain observations
must persist across three checks before protection activates; an additional face
still activates protection immediately. These remain prototype defaults and must
be tuned using the project's documented test matrix before accuracy claims are
made.
