# FaceGuard

FaceGuard 2.0 is a local-only macOS and Windows desktop proof of concept for active-session
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
  desktop mode for protection across normal application windows.

## Run FaceGuard from GitHub

FaceGuard runs entirely on the local computer. No cloud account, API key,
database, or deployment is required.

### 1. Install the prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 22.13 or newer
- pnpm 11
- macOS on Apple silicon, or Windows 10/11 x64
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

### 4. Start FaceGuard 2.0

```bash
pnpm run desktop:dev
```

FaceGuard opens as a desktop window and adds a shield icon to the macOS menu
bar or Windows system tray. Closing its main window hides it; monitoring
continues from that background control.

### 5. Start a protected session

1. Select **Start private session**.
2. Allow FaceGuard camera access when macOS or Windows asks.
3. Be the only person visible in the camera.
4. Take all five enrolment photos, following each red position marker.
5. After the fifth accepted photo, FaceGuard starts monitoring automatically.
6. Hide the main window if desired; desktop protection continues from the menu
   bar or Windows system tray.
7. Select **End session** in the window or **End session and clear memory** in
   the tray menu to stop the camera and clear temporary descriptors.

All webcam analysis and biometric descriptors remain on the device. The five
photos are converted into temporary in-memory descriptors and are not uploaded
or saved by FaceGuard.

### 6. Stop FaceGuard

Choose **Quit FaceGuard** from the shield menu. On Windows, open hidden tray
icons if the shield is not immediately visible. During development you can also
return to the terminal and press `Ctrl+C`.

### 7. Build a local macOS application

```bash
pnpm run desktop:package
```

The unsigned development application is produced under
`out/FaceGuard-darwin-arm64/FaceGuard.app`. It is for local proof-of-concept
testing and is not notarised for distribution.

### 8. Build the Windows installer

On a Windows 10/11 x64 computer:

```powershell
pnpm run desktop:make:windows
```

The Squirrel installer is produced at
`out/make/squirrel.windows/x64/FaceGuard-Setup.exe`. It creates Start Menu and
desktop integration and installs FaceGuard for the current Windows user.

You can also run the **Build Windows installer** GitHub Actions workflow. Its
`FaceGuard-Windows-x64` artifact contains the installer and update metadata.
The current installer is unsigned, so Windows SmartScreen may show an
unrecognised-publisher warning until a Windows code-signing certificate is
configured.

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
  on Windows it hides to the system tray. Select its shield icon and choose
  **Show FaceGuard**.
- **macOS blocks the packaged app:** The proof-of-concept build is unsigned.
  Use development mode or explicitly allow the local build in macOS security
  settings. Production distribution requires signing and notarisation.
- **Windows warns about the installer:** The proof-of-concept installer is not
  yet Authenticode-signed. Use it only for controlled testing until signing is
  added.
- **A Windows protection overlay does not appear:** Right-click the FaceGuard
  system-tray icon and select **Test desktop protection overlay**. Select
  **Open diagnostic log** to locate the privacy-safe technical log; it records
  state and window visibility but never camera images or facial descriptors.
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
3. Keep all five photo descriptors in session memory and compare each detected
   face against every enrolment view.
4. Average the strongest two template similarities for recognition.
5. Classify continuous observations as safe, additional viewer, absent, or
   uncertain.
6. Show one native decoy window per detected display for persistent unsafe and
   uncertain states.
7. Stop the webcam and clear biometric session state when the session ends.

The normal similarity threshold is `0.45`. A single mismatched or temporarily
unclear face follows the normal absence persistence rule. Detecting an
additional face immediately latches protection; that latch survives later
absent or uncertain frames and uses a separate `0.55` recovery threshold.
FaceGuard requires two consecutive authorised-user matches before removing
latched protection.
The second recovery scan runs immediately after the first successful scan rather
than waiting for the normal monitoring interval.
Absence must
persist across six checks before protection activates, while uncertain
observations require three checks. An additional face still activates
protection immediately. These remain prototype defaults and must be tuned using
the project's documented test matrix
before accuracy claims are made. Desktop limits and the repeatable proof-of-concept test procedure are in
[docs/desktop-poc.md](docs/desktop-poc.md). Step 3 automated results, runtime
observations, and the manual test backlog are in
[docs/step3-validation.md](docs/step3-validation.md) and
[docs/step3-test-matrix.csv](docs/step3-test-matrix.csv).
