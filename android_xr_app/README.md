# NEVEX XR Native Android App

Native Android XR viewer scaffold for the NEVEX XR Jetson stereo stream.

## Architecture

The app keeps the proven Jetson transport contract intact while splitting native live view into three layers:

- transport and decode: OkHttp WebSocket, `JSBF` decode, latest-frame-only coalescing
- renderable frame state: reusable bitmap buffers plus a dedicated high-frequency stereo frame flow
- presentation: fallback 2D preview today, XR spatial panels today, and a future SceneCore surface path behind the same decoded frame model

Key implementation points:

- Kotlin + Jetpack Compose for the shell and diagnostics
- Compose for XR `Subspace` panels for immersive presentation
- `StereoRenderableFrame` as the shared decoded-frame model that can feed multiple presentation targets
- reusable bitmap ring buffers to reduce per-frame allocation churn
- low-frequency session state separated from high-frequency frame state to reduce whole-tree recomposition
- optional lightweight performance instrumentation for decode, handoff, presentation cadence, and dropped frames

This keeps the current working live path stable while preparing for deeper XR rendering work such as SceneCore `SurfaceEntity` stereo routing.

## Project Structure

```text
android_xr_app/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/nevex/xr/nativeapp/
│       │   ├── MainActivity.kt
│       │   ├── stream/
│       │   │   ├── FrameRateMeter.kt
│       │   │   ├── JetsonBinaryFrameDecoder.kt
│       │   │   ├── JetsonJsonStereoFrameDecoder.kt
│       │   │   ├── JetsonStreamModels.kt
│       │   │   ├── JetsonStreamRepository.kt
│       │   │   ├── JsonExtensions.kt
│       │   │   └── ReusableBitmapBuffers.kt
│       │   └── ui/
│       │       ├── NevexXrApp.kt
│       │       ├── NevexXrViewModel.kt
│       │       └── theme/NevexTheme.kt
│       └── res/
├── gradle/
├── scripts/
│   ├── build-debug.ps1
│   ├── check-jetson-endpoint.ps1
│   ├── inspect-xr-tooling.ps1
│   ├── install-debug.ps1
│   ├── launch-app.ps1
│   ├── logcat-nevex.ps1
│   ├── run-live-view.ps1
│   └── start-emulator.ps1
├── BRINGUP.md
└── README.md
```

## Current Verified State

What is currently confirmed:

- app builds and installs successfully
- launch works on a standard phone AVD
- native WebSocket transport works against `ws://<host>:8090/jetson/messages`
- `capabilities` are received from the Jetson sender
- binary `JSBF` stereo decode works natively
- left and right eye imagery render in the non-XR fallback 2D path

What still requires a true XR target:

- Full Space activation
- XR `Subspace` compositor behavior
- spatial panel comfort and placement
- headset-representative presentation cadence

## Rendering Pipeline Notes

The live viewer now uses a more XR-ready render path than the initial scaffold:

- `JetsonStreamRepository` publishes low-frequency connection state separately from high-frequency stereo frame state
- each eye reuses mutable `Bitmap` buffers through a small ring buffer instead of allocating brand-new bitmaps every frame
- the top-level app shell no longer observes every frame update
- only the eye image nodes and optional diagnostics/perf tracker observe the high-frequency frame flow
- a shared frame model keeps the current preview paths compatible with a future SceneCore surface renderer

This is still a Compose + `Bitmap` path, not a final zero-copy renderer, but it is materially closer to sustaining a 60 FPS viewer than the original allocate-and-recompose-everything path.

## Build And Run

This module includes a working Gradle wrapper and is currently pinned to:

- Android Gradle Plugin `8.6.1`
- Gradle `8.7`
- Kotlin `2.0.21`
- `compileSdk 35`
- `targetSdk 35`
- `minSdk 34`

For detailed bring-up flows, see `BRINGUP.md`.

### Android Studio

For Android XR development, use the latest Android Studio Canary build. The official Android XR setup docs currently call out Canary because XR tooling is not guaranteed in stable Android Studio builds.

Recommended first-run path:

1. Open `android_xr_app/` in Android Studio.
2. Let Android Studio use the included Gradle wrapper.
3. In SDK Manager > SDK Tools, install or update:
   - Android SDK Build-Tools
   - Android Emulator
   - Android SDK Platform-Tools
   - Layout Inspector for API 31 - 36
4. In Device Manager, create an XR emulator using:
   - `Add a new device` -> `Create Virtual Device`
   - `XR` form factor
   - an Android XR headset or XR glasses profile
   - the Android 14 XR image `Google Play XR Intel x86_64 Atom System Image (Developer Preview)`, if that is the XR image visible on this machine
5. Run `.\scripts\inspect-xr-tooling.ps1` to confirm the SDK now has an XR system image and an XR-classified AVD.
6. Run the `app` configuration on:
   - an Android XR emulator, or
   - a connected Samsung XR headset with developer mode enabled.

Important: the package IDs for XR system images are not currently documented as stable `sdkmanager` strings in the public Android XR setup guide, so the most reliable path is Android Studio SDK Manager + Device Manager.

### Command Line

From `android_xr_app/`:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

Useful helper flows:

```powershell
.\scripts\inspect-xr-tooling.ps1
.\scripts\inspect-xr-tooling.ps1 -FailIfMissing
.\scripts\headset-presenter-preflight.ps1 -JetsonHost 192.168.1.56 -DurationSeconds 30
.\scripts\start-emulator.ps1 -ListOnly
.\scripts\start-emulator.ps1 -AvdName "<xr-avd-name>" -RequireXr -WaitForBoot
.\scripts\run-live-view.ps1 -StartEmulator -AvdName "<xr-avd-name>" -RequireXr
```

### Local SDK Resolution

- `local.properties` is generated locally and git-ignored
- this machine resolves the SDK at `C:\Users\andre\AppData\Local\Android\Sdk`
- this machine currently does not have `cmdline-tools/latest`
- this machine currently has only a standard phone system image and no XR AVD

For headset hardware:

- keep the headset on the same LAN as the Jetson sender
- confirm the sender endpoint is reachable as `ws://<jetson-ip>:8090/jetson/messages`
- keep the sender in the proven binary `stereo_frame` path
- note that the app currently enables cleartext traffic because the validated endpoint is `ws://`, not `wss://`

## First Real XR Validation

Once an XR emulator or headset is available, verify:

1. The app launches to the connect surface without crashing.
2. The Jetson host field and connect action are usable.
3. `NevexXrStream` logs show connect, open, capabilities, and first frame.
4. `NevexXrUi` logs a real Full Space request on the XR target.
5. Both eyes render in XR `Subspace` panels.
6. Diagnostics stay quiet in the healthy case and expand truthfully when requested.
7. Performance instrumentation can be toggled on without breaking normal playback.

## Recommended Next Milestone

After XR emulator or headset validation is complete:

1. Run a sustained cadence and comfort pass on a real XR target.
2. Decide whether the current spatial-panel path is sufficient or whether the next step should be a `SurfaceEntity`-backed stereo renderer.
3. If profiling still shows Compose/bitmap overhead as the dominant cost, move the final presentation path toward a surface- or texture-backed upload model while keeping the same decoded frame abstraction.
