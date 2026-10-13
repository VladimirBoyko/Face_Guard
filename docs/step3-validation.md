# FaceGuard 2.0 Step 3 validation record

## Outcome

Step 3 adds repeatable automated coverage for enrolment, protection-state
transitions, permissions, overlay policy, configuration, camera shutdown, and
biometric-memory cleanup. It also records a short packaged-app observation.
Controlled physical recognition testing remains deliberately open for the
project team to complete; no accuracy or universal-protection claim is made.

The detailed, editable matrix is in `docs/step3-test-matrix.csv`.

## Automated regression coverage

The repository contains 22 passing Node tests. The Step 3 additions cover:

- accepting five clear, single-face enrolment samples and producing one
  normalised descriptor;
- rejecting missing, multiple, low-quality, or incomplete enrolment faces;
- Safe, Extra-viewer, Absent, and Uncertain transitions;
- temporary recognition loss and conservative recovery;
- desktop overlay activation and removal policy;
- trusted, video-only permission policy;
- distinct permission-denied and camera-unavailable outcomes;
- stopping every media track;
- overwriting descriptor/sample arrays before releasing their references;
- fresh restart state and central configuration validation;
- configurable persistence and derived transition timing.

Type checking, linting, the production web build, and the macOS package build
are part of the pull-request verification sequence.

## Runtime observations

A short packaged macOS session produced state-transition inference times from
71 to 95 ms. Safe similarity scores ranged from 0.46 to 0.60. Borderline
observations classified as absent ranged from 0.34 to 0.44. During that short
session, three absence-triggered protection events occurred, followed by
successful recovery. This is evidence of recognition instability, not a
calibration dataset.

Protection appeared 1.372 to 1.377 seconds after the first logged absent
observation. It cleared 0.722 to 0.745 seconds after the first logged safe
observation. With the 650 ms sampling interval, a physical event that begins
just after a camera check may add up to one further interval.

After session termination, the packaged Electron process group used
approximately 726 MiB RSS. A post-session CPU sample read 0.0 percent; because
active inference had already stopped, this is not an active-session CPU result.
Long-session CPU, memory, battery, and thermal measurements remain pending.

## Configuration decisions

No recognition or timing default was changed in Step 3:

| Setting | Retained value | Reason |
| --- | ---: | --- |
| Face-match threshold | 0.45 | The short session showed a narrow boundary but contained no impostor dataset. Lowering the threshold without false-accept evidence could miss a privacy event. |
| Detector confidence | 0.60 | No controlled detection dataset was collected. |
| Monitoring interval | 650 ms | Runtime timings matched the central state model; usability and energy testing are still required. |
| Absence persistence | 3 observations | Filters short losses while concealing within roughly two observed intervals. |
| Extra-viewer persistence | 1 observation | Fails closed because a missed extra viewer is more serious than a temporary overlay. |
| Uncertain persistence | 3 observations | Filters brief incomplete detections while preserving fail-closed behaviour. |
| Safe recovery | 2 observations | Prevents removal after a single borderline safe result. |
| Concealment/recovery delay | 0 ms | Persistence already supplies the timing control. |

All values remain centralised in `src/core/configuration.ts`, and invalid ranges
now produce validation errors. Any later change should reference repeated test
records, not visual impression.

## Defects addressed

- Enrolment acceptance is now a pure, tested rule instead of UI-only branching.
- Camera startup errors distinguish permission denial from general
  unavailability.
- Session cleanup stops all tracks and explicitly overwrites descriptor arrays
  before releasing references.
- Renderer-to-main technical events carry only a rounded similarity value and
  transition duration; they never carry images or descriptors.
- Permission and overlay decisions are pure, testable policies.
- Timing expectations are derived from the central interval rather than copied
  constants.

## Unresolved defects and limitations

- The short authorised-user session had three likely false activations near the
  current recognition boundary. A larger genuine-user and impostor dataset is
  required before tuning.
- Physical permission denial, camera contention/disconnect, lighting, pose,
  distance, camera placement, glasses, sleep/wake, and long-session tests remain
  pending.
- Multiple displays, display hot-plug, Spaces, Stage Manager, Mission Control,
  and native full-screen applications remain unverified.
- FaceGuard cannot protect the login window, lock screen, FileVault prompt,
  secure surfaces, or windows above its macOS overlay level.
- The menu bar and Dock remain available by design so the user can stop the app.
- There is no liveness or anti-spoofing defence, privileged helper, or crash
  watchdog.
- The app is unsigned and not notarised.

## Supported macOS evidence

On one Apple-silicon Mac and one display, the packaged desktop app completed
five-photo enrolment, performed local monitoring, activated and removed its
native overlay independently of the original browser tab, stopped the webcam,
and cleared the active session. The overlay was exercised over Chrome, Finder,
Preview, Visual Studio Code, and Microsoft Word.

This extends protection beyond the browser MVP while preserving its local-only
processing and session-only descriptor model. It does not establish universal
macOS coverage.

## Assessment-ready evidence

FaceGuard 2.0 replaced the browser-only decoy with an Electron-owned native
macOS overlay. The React/Human.js renderer still performs webcam analysis
locally and retains the averaged five-photo descriptor only in active-session
memory. The desktop process receives viewing states and narrow metrics, never
facial images or embeddings. Automated regression tests cover enrolment,
state transitions, permissions, overlay recovery, configuration, camera
shutdown, and descriptor deletion. A packaged runtime test demonstrated
protection over five normal macOS applications, transition inference of 71–95
ms, observed concealment of 1.372–1.377 seconds, and recovery of 0.722–0.745
seconds. Recognition tuning remains provisional because the short test exposed
borderline similarity scores and likely false activations; therefore the 0.45
match and 0.60 detector defaults were retained pending controlled testing.
