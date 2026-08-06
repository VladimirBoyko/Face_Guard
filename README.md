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

## Run FaceGuard from GitHub

FaceGuard runs entirely on the local computer. No cloud account, API key,
database, or deployment is required.

### 1. Install the prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 22.13 or newer
- pnpm 10
- A current desktop browser with a webcam, such as Chrome or Edge

After installing Node.js, enable pnpm:

```bash
corepack enable
corepack prepare pnpm@10 --activate
```

If `corepack` is unavailable, install pnpm with:

```bash
npm install --global pnpm@10
```

Confirm the tools are available:

```bash
node --version
pnpm --version
git --version
```

### 2. Download the repository

```bash
git clone https://github.com/VladimirBoyko/Face_Guard.git
cd Face_Guard
```

### 3. Install the project dependencies

```bash
pnpm install --frozen-lockfile
```

Run this once after cloning, and again whenever `pnpm-lock.yaml` changes.

### 4. Start FaceGuard

```bash
pnpm run dev
```

Open the local address printed in the terminal, normally
[http://localhost:3000](http://localhost:3000). Keep the terminal running while
using FaceGuard.

### 5. Start a protected session

1. Select **Start private session**.
2. Allow camera access and accept fullscreen mode when the browser asks.
3. Be the only person visible in the camera.
4. Take all five enrolment photos, following each red position marker.
5. After the fifth accepted photo, FaceGuard starts monitoring automatically.
6. Select **End session** to stop the camera, clear the temporary face
   descriptor, and exit fullscreen.

All webcam analysis and biometric descriptors remain on the device. The five
photos are converted into temporary in-memory descriptors and are not uploaded
or saved by FaceGuard.

### 6. Stop the local server

Return to the terminal and press `Ctrl+C`.

### Troubleshooting

- **Camera does not start:** Allow camera access for `localhost` in the browser's
  site settings, then reload the page.
- **Fullscreen did not open:** Use the **Full screen** button shown during the
  session. Some browser settings block automatic fullscreen requests.
- **Face analysis is slow:** Close other camera applications and enable browser
  hardware acceleration.
- **Port 3000 is already in use:** Use the different local address printed by
  the development server.
- **Dependencies fail to install:** Confirm Node.js is at least version 22.13,
  then run `pnpm install --frozen-lockfile` again.

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
