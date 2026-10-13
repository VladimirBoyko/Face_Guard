# FaceGuard 2.0 macOS desktop proof of concept

## Implemented architecture

FaceGuard uses an Electron main process, a sandboxed React renderer, a narrow
preload bridge, and one native overlay window per detected display. The renderer
owns webcam access, Human.js inference, five-photo enrolment, and the temporary
descriptor. It sends only `safe`, `extra-viewer`, `absent`, or `uncertain` plus a
protection boolean to the main process. The main process owns the menu-bar item,
window lifecycle, camera permission request, and desktop overlay.

No face image, embedding, or reusable biometric template is sent through IPC,
written to disk, or included in technical logs. Ending a session stops all media
tracks, zeroes descriptor arrays, releases the engine, and tells the desktop
process to remove session protection.

## Central prototype settings

All tuning values live in `src/core/configuration.ts`: recognition threshold,
detector confidence, enrolment quality, monitoring interval, absence persistence,
additional-viewer persistence, uncertain persistence, concealment delay, safe
recovery observations, and recovery delay. The current `0.45` match threshold
and `0.60` detector confidence are retained only as prototype defaults.

## Reproduce the states

1. Run `pnpm run desktop:dev`, select **Start private session**, grant Camera
   permission, and complete the five guided photos alone in frame.
2. **Safe:** remain alone and visible after enrolment. Two safe observations are
   required to recover from protection.
3. **Extra-viewer:** have a second person enter the camera frame. The default is
   one observation, so protection should appear immediately.
4. **Absent:** leave the camera frame. Protection appears after three consecutive
   absent observations.
5. **Uncertain:** partially obstruct the camera or create conditions where a
   detected face lacks a complete descriptor. Protection appears after three
   consecutive uncertain observations.
6. End the session and confirm that the camera indicator turns off and the UI
   reports **Camera stopped. Enrolment removed.**

For an overlay-only smoke test, package the app and run its executable with
`--faceguard-test-overlay`. The menu-bar menu also provides **Test desktop
protection overlay**. Neither method creates a facial descriptor.

## Runtime evidence from this implementation pass

- Apple-silicon macOS package completed successfully.
- The packaged app opened its camera, loaded local models, accepted five photos,
  entered Safe monitoring, and ended with camera off and enrolment cleared.
- With the manual protection test active, foreground activation was exercised
  for Google Chrome, Finder, Preview, Visual Studio Code, and Microsoft Word.
  The overlay manager remained active across those switches on one display.
- The overlay uses macOS `screen-saver` window level, `showInactive`, and
  `setVisibleOnAllWorkspaces`. `setContentProtection(true)` intentionally keeps
  protected overlay content out of ordinary screen captures, so application
  switching was checked live rather than documented using screenshots.

This verifies a proof of concept, not universal macOS protection.

## Known limits and defects

- Only one Apple-silicon Mac and one attached display were exercised. Per-display
  windows are implemented, but multiple physical displays remain unverified.
- Normal windowed applications were tested. Separate Spaces, Stage Manager,
  native full-screen transitions, Mission Control, and hot-plugged displays need
  dedicated testing.
- FaceGuard cannot cover the login window, lock screen, FileVault prompt, secure
  input surfaces, or macOS windows placed above the screen-saver level.
- The overlay intentionally uses each display work area, leaving the menu bar and
  Dock available so the user can stop FaceGuard. Those surfaces are not concealed.
- A crash or force-quit of the Electron main process removes protection; there is
  no watchdog or privileged helper in this proof of concept.
- Anti-spoofing and liveness checks remain disabled. A photograph or video attack
  has not been evaluated.
- Thresholds and persistence values have not been calibrated against a formal
  dataset. False accepts, false rejects, lighting, pose, and demographic effects
  require measured testing.
- The app is unsigned and not notarised. The generated package is suitable only
  for local development testing.
- CPU, memory, thermal, and battery use have not yet been benchmarked over long
  sessions.

## Recommended Step 3 work

1. Build a repeatable recognition and state-transition test matrix across people,
   lighting, poses, absence durations, and additional viewers.
2. Measure false accept/reject behaviour and tune configuration from evidence.
3. Test multiple displays, Spaces, Stage Manager, native full screen, sleep/wake,
   camera disconnects, and display hot-plugging.
4. Add long-session CPU, memory, battery, and thermal measurements.
5. Add a watchdog decision and a documented fail-safe policy for main-process
   crashes.
6. Add application icons, hardened runtime entitlements, code signing,
   notarisation, and a controlled distribution package.
7. Conduct privacy/security review of IPC, model assets, dependencies, and log
   retention before any user trial.
