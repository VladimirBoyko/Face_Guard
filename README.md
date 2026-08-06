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
- Ending the session stops webcam tracks and clears the descriptor references.
- This browser MVP protects the FaceGuard page only. It cannot cover unrelated
  tabs or native applications.

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
2. Capture three single-user enrolment samples.
3. Average the samples into an in-memory face descriptor.
4. Classify continuous observations as safe, additional viewer, absent, or
   uncertain.
5. Show the decoy overlay for unsafe and uncertain states.
6. Stop the webcam and clear biometric session state when the session ends.

The matching threshold and temporal smoothing values are prototype defaults and
must be tuned using the project's documented test matrix before accuracy claims
are made.
