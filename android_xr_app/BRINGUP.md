# NEVEX XR Bring-Up Guide

This guide covers emulator and headset bring-up for the native `android_xr_app`
module, with a specific focus on distinguishing true Android XR targets from
standard phone emulators.

## Current Machine Status

Verified on this Windows machine:

- `android_xr_app` builds successfully with `.\scripts\build-debug.ps1`
- debug APK output exists at `app/build/outputs/apk/debug/app-debug.apk`
- Android Studio JBR is installed at `C:\Program Files\Android\Android Studio\jbr`
- Android SDK is installed at `C:\Users\andre\AppData\Local\Android\Sdk`
- Android Emulator revision `36.4.10` is installed
- `adb.exe` and `emulator.exe` are present

Current XR caveats on this machine:

- only one AVD is configured: `Medium_Phone_API_36.1`
- that AVD is a standard phone emulator, not an XR emulator
- no XR system image is currently installed
- no XR AVD is currently configured
- `cmdline-tools/latest` is not installed, so SDK installs are easiest through Android Studio SDK Manager

Use the current phone AVD only for startup, install, networking, and basic
connect-flow smoke tests. Use an Android XR emulator image or Samsung XR
headset for real XR validation.

## Helper Scripts

PowerShell helper scripts live in `android_xr_app/scripts/`:

- `build-debug.ps1`
- `install-debug.ps1`
- `launch-app.ps1`
- `logcat-nevex.ps1`
- `compare-presenter-modes.ps1`
- `headset-presenter-preflight.ps1`
- `start-emulator.ps1`
- `check-jetson-endpoint.ps1`
- `inspect-xr-tooling.ps1`
- `run-live-view.ps1`

The helper scripts now classify targets and warn when the selected device is not
XR-capable.

## XR Emulator Preparation

### Android Studio requirement

Use the latest Android Studio Canary build for Android XR development. The
official Android XR setup docs currently call out Canary because stable Android
Studio builds may not include the XR tools and Device Manager form factors.

### Windows requirements for the Android XR emulator

Per the current Android XR docs, the Windows host should meet:

- Windows 11 or later
- Intel 9th gen or later, or AMD Ryzen 1000 series or later
- 16 GB RAM or higher
- 8 GB VRAM or higher
- VMX CPU extensions enabled in BIOS

If the standard Android emulator already runs successfully on the machine, VMX
support is typically already good enough.

### SDK Manager components required

In Android Studio `SDK Manager -> SDK Tools`, install or update:

- Android SDK Build-Tools
- Android Emulator
- Android SDK Platform-Tools
- Layout Inspector for API 31 - 36

Then use Device Manager to install or create:

- an Android XR system image
- an XR headset or XR glasses AVD

Important: the official Android XR setup pages do not currently publish stable
`sdkmanager` package IDs for XR system images, so the most reliable install path
is Android Studio SDK Manager + Device Manager.

On this machine, the XR image you should expect to choose in Device Manager is:

- `Google Play XR Intel x86_64 Atom System Image (Developer Preview)`

### Create an XR-capable AVD

In Android Studio:

1. Open `Tools -> Device Manager`.
2. Select `Add a new device -> Create Virtual Device`.
3. Choose the `XR` form factor.
4. Pick either an XR headset or XR glasses profile.
5. Choose the Android 14 XR image `Google Play XR Intel x86_64 Atom System Image (Developer Preview)` if that is the XR image shown.
6. Finish the AVD creation and boot it once.

### Detect whether XR packages are really installed

Use:

```powershell
.\scripts\inspect-xr-tooling.ps1
```

What this script checks:

- whether `cmdline-tools/latest` is available
- installed emulator revision
- installed system images
- whether any installed system image looks XR-specific
- configured AVDs
- whether any configured AVD looks XR-specific

If the script still reports only `Standard` system images and `Standard` AVDs,
do not treat emulator validation as XR truth yet.

## Exact Build / Install / Run Commands

### Build the debug APK

```powershell
cd C:\Users\andre\Desktop\NEVEX_XR\android_xr_app
.\scripts\build-debug.ps1
```

Raw command:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

### Inspect local XR readiness

```powershell
.\scripts\inspect-xr-tooling.ps1
```

Fail immediately if the machine is still not XR-ready:

```powershell
.\scripts\inspect-xr-tooling.ps1 -FailIfMissing
```

### Start an emulator

List configured AVDs with XR classification:

```powershell
.\scripts\start-emulator.ps1 -ListOnly
```

Start a specific AVD:

```powershell
.\scripts\start-emulator.ps1 -AvdName "Medium_Phone_API_36.1" -WaitForBoot
```

Require an XR-classified AVD:

```powershell
.\scripts\start-emulator.ps1 -AvdName "<xr-avd-name>" -RequireXr -WaitForBoot
```

### Confirm connected devices

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

### Install the APK

```powershell
.\scripts\install-debug.ps1
```

If multiple devices are connected:

```powershell
.\scripts\install-debug.ps1 -Serial emulator-5554
```

### Launch the app

```powershell
.\scripts\launch-app.ps1
```

Force-stop first, then relaunch:

```powershell
.\scripts\launch-app.ps1 -StopFirst
```

### Combined build / install / launch flow

Start the emulator, install, and launch:

```powershell
.\scripts\run-live-view.ps1 -StartEmulator -AvdName "<avd-name>"
```

Require an XR target:

```powershell
.\scripts\run-live-view.ps1 -StartEmulator -AvdName "<xr-avd-name>" -RequireXr
```

### Watch app logcat

```powershell
.\scripts\logcat-nevex.ps1 -Clear -Launch
```

Relevant tags:

- `NevexXrStream`
- `NevexXrUi`

### Check Jetson endpoint reachability

Host-only check:

```powershell
.\scripts\check-jetson-endpoint.ps1 -JetsonHost 192.168.1.56 -Port 8090 -SkipDeviceCheck
```

Host + device check:

```powershell
.\scripts\check-jetson-endpoint.ps1 -JetsonHost 192.168.1.56 -Port 8090
```

Raw Windows TCP test:

```powershell
Test-NetConnection 192.168.1.56 -Port 8090
```

Useful raw device checks:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell ping -c 1 192.168.1.56
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell sh -c "toybox nc -z -w 3 192.168.1.56 8090 && echo TCP_OK || echo TCP_FAIL"
```

## Emulator Bring-Up Checklist

### Standard phone emulator

Use this only for:

- install / launch checks
- Jetson endpoint reachability
- WebSocket connection sanity
- fallback 2D preview validation

Do not use it as final XR truth for:

- Full Space
- XR spatial panels
- spatial compositor behavior
- headset comfort or cadence

### XR emulator

Minimum checklist:

1. Confirm Android Studio Canary is installed.
2. Confirm the required SDK Tools are installed.
3. Run `.\scripts\inspect-xr-tooling.ps1`.
4. Confirm the script reports at least one XR system image and one XR AVD.
5. Start the XR AVD with `-RequireXr`.
6. Confirm `adb devices` shows the emulator.
7. Build, install, and launch the app.
8. Keep `logcat-nevex.ps1` running during the first connection attempt.
9. Verify `NevexXrUi` logs a Full Space request after the first live frame.
10. Verify both eye panels render in XR space.

### Exact machine flow after XR AVD creation

Once you install the XR image in Android Studio and create the XR AVD, use this exact sequence:

```powershell
cd C:\Users\andre\Desktop\NEVEX_XR\android_xr_app
.\scripts\inspect-xr-tooling.ps1 -FailIfMissing
.\scripts\start-emulator.ps1 -AvdName "<xr-avd-name>" -RequireXr -WaitForBoot
.\scripts\build-debug.ps1
.\scripts\install-debug.ps1
.\scripts\launch-app.ps1 -StopFirst
.\scripts\check-jetson-endpoint.ps1 -JetsonHost 192.168.1.56 -Port 8090
.\scripts\logcat-nevex.ps1 -Clear
```

Or, for the combined helper path:

```powershell
cd C:\Users\andre\Desktop\NEVEX_XR\android_xr_app
.\scripts\inspect-xr-tooling.ps1 -FailIfMissing
.\scripts\run-live-view.ps1 -StartEmulator -AvdName "<xr-avd-name>" -RequireXr
.\scripts\logcat-nevex.ps1 -Clear
```

## Samsung XR Headset Bring-Up Checklist

1. Enable developer mode on the headset.
2. Enable USB debugging or wireless debugging.
3. Connect the headset to this Windows machine and accept the adb trust prompt.
4. Confirm `adb devices -l` shows the headset serial.
5. Confirm the headset is on the same LAN as the Jetson sender.
6. Build and install `app-debug.apk`.
7. Launch the app via `launch-app.ps1`.
8. Keep `logcat-nevex.ps1` running during the first connection attempt.
9. Enter the Jetson IP and begin live view.
10. Confirm Full Space and spatial panel behavior in-headset.

## Headset Presenter Validation Runbook

Use this only when a real Samsung XR headset is connected in `adb`.

1. Confirm the headset is visible in detailed adb output:
   - `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l`
2. Run the headset preflight:
   - `.\scripts\headset-presenter-preflight.ps1 -JetsonHost 192.168.1.56 -DurationSeconds 30`
3. If the preflight reports only emulator targets, stop there and wait for the headset to appear in adb.
4. Build and install the latest debug APK on the headset:
   - `.\scripts\install-debug.ps1 -Serial "<headset-serial>" -Build`
5. Launch the app on the headset in the baseline presenter mode:
   - `.\scripts\launch-app.ps1 -Serial "<headset-serial>" -StopFirst -AutoConnect -JetsonHost 192.168.1.56 -PresenterMode normal`
6. Run the mode comparison sweep on the headset:
   - `.\scripts\compare-presenter-modes.ps1 -Serial "<headset-serial>" -RequirePhysical -JetsonHost 192.168.1.56 -DurationSeconds 30`
7. Compare the headset results against the existing emulator sweep before making the next renderer decision.

Result template for the real-device sweep:

```text
- target: <serial> / <model or display name> / <classification>
- mode: <normal|clear|pattern|post-only>
- L/R present ms: <left> / <right>
- L/R FPS: <left> / <right>
- L/R jitter ms: <left> / <right>
- skew: <present skew avg ms>
- ready / superseded: ready <left>/<right>, superseded <left>/<right>
- frameReadyToLockMs: <left avg> / <right avg>
- dominant stage: <left> / <right>
- conclusion: <one short sentence>
```

Decision rule:

- If the headset reproduces the large `normal` vs `clear` / `post-only` gap, the next render-path change should reduce or remove CPU bitmap draw/scaling from the hot present path.
- If the headset does not reproduce that gap, keep the current `SurfaceView` presenter architecture and redirect optimization effort away from presenter micro-optimization.

## Windows Machine + Jetson Backend Checklist

1. Confirm the Jetson sender is running and healthy.
2. Confirm the target endpoint is `ws://<jetson-ip>:8090/jetson/messages`.
3. Confirm Windows can reach the Jetson:
   - `Test-NetConnection <jetson-ip> -Port 8090`
4. Confirm the device or emulator can also reach the Jetson:
   - `.\scripts\check-jetson-endpoint.ps1 -JetsonHost <jetson-ip> -Port 8090`
5. Keep the Jetson stream in the proven binary `stereo_frame` mode.

## First Live Validation Checklist

On the first real XR emulator or headset run, verify:

1. The app launches to the premium connect screen.
2. Jetson IP entry is usable.
3. Tapping `Enter immersive live view` triggers a real WebSocket attempt.
4. `logcat` shows:
   - `Connecting to ws://...`
   - `WebSocket opened`
   - `Capabilities received ...`
   - `First stereo frame rendered ...`
5. The lifecycle advances from idle -> connecting -> open -> receiving.
6. Full Space request occurs after the first live frame.
7. Both stereo panels render once frames arrive.
8. No crash occurs.
9. No cleartext/network-security block occurs.
10. No obviously broken XR layout or unusable spatial placement appears.
11. Performance instrumentation can be toggled on and reports decode and presentation metrics without breaking playback.

## Troubleshooting

### `inspect-xr-tooling.ps1` reports only `Standard`

- You do not yet have an XR system image or XR AVD installed.
- Use Android Studio Canary.
- Install the required SDK Tools in SDK Manager.
- Create an XR device in Device Manager using the `XR` form factor.

### App installs but will not launch

- Check `adb devices` first.
- Run `launch-app.ps1 -StopFirst`.
- Watch `logcat-nevex.ps1 -Clear -Launch`.
- Look for `AndroidRuntime` fatal exceptions and `ActivityManager` launch failures.

### Cleartext traffic blocked

- The app manifest already enables `android:usesCleartextTraffic="true"`.
- If the device still blocks cleartext traffic, check device policy or OEM network restrictions.
- Confirm the endpoint is still `ws://` and not being rewritten.
- Confirm `logcat` is not reporting a network security policy exception.

### Jetson endpoint unreachable

- Run `check-jetson-endpoint.ps1 -JetsonHost <jetson-ip> -Port 8090`.
- Confirm Windows can reach the Jetson over TCP.
- Confirm the device is on the same LAN / subnet.
- Confirm the Jetson sender is listening on `0.0.0.0:8090`, not only localhost.

### Connection succeeds but no frames arrive

- Watch `NevexXrStream` logs.
- Confirm `capabilities` and `transport_status` arrive.
- If the app opens the socket but never renders a first frame, the backend may be healthy at transport level but not emitting `stereo_frame`.
- Re-check Jetson sender health, active profile, and live binary frame traffic.

### XR presentation looks wrong

- Make sure the target is actually XR-classified by `inspect-xr-tooling.ps1` or the helper script warnings.
- Do not treat the standard phone AVD as XR layout truth.
- Re-test on an XR emulator image or real Samsung XR headset.
- Confirm the app still requests Full Space after the first live frame.

## Recommended Next Step After XR Validation

After the first XR emulator or headset run:

- capture a longer 10 to 15 minute live-view soak
- compare receive cadence versus presentation cadence
- decide whether the current spatial-panel path is sufficient or whether the next milestone should move to a SceneCore `SurfaceEntity` renderer
