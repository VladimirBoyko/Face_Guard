# FaceGuard

FaceGuard 2.0 is a local-only macOS desktop proof of concept for active-session
screen privacy. It enrols an authorised user in volatile memory, analyses webcam
frames on the device, and places a native protection window over the desktop when
the user leaves, an additional viewer appears, or the view cannot be confirmed.
The original browser prototype remains available for comparison.

## Privacy boundary

- Webcam frames are processed inside the local desktop renderer.
- Face model files are served from this repository.
- Face descriptors are held only in JavaScript memory for the active session.
- The application has no account, database, analytics, uploads, or cloud API.
- The desktop shell receives viewing states only; facial descriptors never cross
  into the Electron main process.
- Native always-on-top windows provide protection independently of browser tabs.
- Ending the session stops webcam tracks and clears the descriptor references.
- The legacy browser mode still protects only its own fullscreen page. Use the
  macOS desktop mode for protection across normal application windows.

## Run FaceGuard from GitHub

FaceGuard runs entirely on the local computer. No cloud account, API key,
database, or deployment is required.

### 1. Install the prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 22.13 or newer
- pnpm 11
- macOS on Apple silicon for the currently tested package
- A webcam

After installing Node.js, enable pnpm:

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
```

If `corepack` is unavailable, install pnpm with:

```bash
npm install --global pnpm@11
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

### 4. Start FaceGuard 2.0 for macOS

```bash
pnpm run desktop:dev
```

FaceGuard opens as a desktop window and adds a shield icon to the macOS menu
bar. Closing its main window hides it; it continues running from the menu bar.

### 5. Start a protected session

1. Select **Start private session**.
2. Allow FaceGuard camera access when macOS asks.
3. Be the only person visible in the camera.
4. Take all five enrolment photos, following each red position marker.
5. After the fifth accepted photo, FaceGuard starts monitoring automatically.
6. Hide the main window if desired; desktop protection continues from the menu
   bar.
7. Select **End session** in the window or **End session and clear memory** in
   the menu-bar menu to stop the camera and clear temporary descriptors.

All webcam analysis and biometric descriptors remain on the device. The five
photos are converted into temporary in-memory descriptors and are not uploaded
or saved by FaceGuard.

### 6. Stop FaceGuard

Choose **Quit FaceGuard** from the shield menu. During development you can also
return to the terminal and press `Ctrl+C`.

### 7. Build a local macOS application

```bash
pnpm run desktop:package
```

The unsigned development application is produced under
`out/FaceGuard-darwin-arm64/FaceGuard.app`. It is for local proof-of-concept
testing and is not notarised for distribution.

### Legacy browser mode

```bash
pnpm run dev
```

Open the local URL printed in the terminal, normally
[http://localhost:3000](http://localhost:3000). Browser mode cannot protect
unrelated native applications.

### Troubleshooting

- **Camera does not start:** Open **System Settings → Privacy & Security →
  Camera**, enable FaceGuard, then restart it.
- **The window disappeared:** FaceGuard normally hides to the macOS menu bar;
  select its shield icon and choose **Show FaceGuard**.
- **macOS blocks the packaged app:** The proof-of-concept build is unsigned.
  Use development mode or explicitly allow the local build in macOS security
  settings. Production distribution requires signing and notarisation.
- **Face analysis is slow:** Close other camera applications and enable browser
  hardware acceleration.
- **Port 3000 is already in use:** Use the different local address printed by
  the development server.
- **Dependencies fail to install:** Confirm Node.js is at least version 22.13,
  then run `pnpm install --frozen-lockfile` again.

## Validate

```bash
pnpm run build
node --test tests/*.test.mjs
pnpm run lint
pnpm run desktop:typecheck
pnpm run desktop:package
```

## Current MVP flow

1. Explain privacy behaviour and request camera consent.
2. Capture five guided single-user enrolment photos.
3. Average the five photos into an in-memory face descriptor.
4. Classify continuous observations as safe, additional viewer, absent, or
   uncertain.
5. Show one native decoy window per detected display for persistent unsafe and
   uncertain states.
6. Stop the webcam and clear biometric session state when the session ends.

The current similarity threshold is `0.45`. Absence and uncertain observations
must persist across three checks before protection activates; an additional face
still activates protection immediately. These remain prototype defaults and must
be tuned using the project's documented test matrix before accuracy claims are
made. Desktop limits and the repeatable proof-of-concept test procedure are in
[docs/desktop-poc.md](docs/desktop-poc.md). Step 3 automated results, runtime
observations, and the manual test backlog are in
[docs/step3-validation.md](docs/step3-validation.md) and
[docs/step3-test-matrix.csv](docs/step3-test-matrix.csv).
