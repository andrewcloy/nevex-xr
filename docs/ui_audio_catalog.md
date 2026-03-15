# UI Audio Catalog

This pass adds temporary placeholder browser UI sounds under
`public/assets/audio/...`.

These files are intentionally centralized so they can be replaced later without
changing the event wiring in the UI code.

## Placeholder Sources

| Usage | Source Windows file | Final filename | Final project path | Notes |
| --- | --- | --- | --- | --- |
| Button and menu click feedback | `C:\Windows\Media\Windows Menu Command.wav` | `ui_click.wav` | `public/assets/audio/ui/ui_click.wav` | Temporary placeholder for general UI click feedback. |
| App startup / boot cue | `C:\Windows\Media\Windows Startup.wav` | `boot_startup.wav` | `public/assets/audio/system/boot_startup.wav` | Temporary placeholder for the browser-side boot/startup cue. |

## Wiring Summary

- Audio paths are centralized in `src/ui/assets/uiAssets.ts`.
- Browser playback is handled by `src/ui/ui_audio.ts`.
- Browser-side audio preferences live in `SettingsStore` as:
  `uiAudioEnabled`, `uiClickVolume`, and `uiBootVolume`.
- Hearing enhancement and phone/media audio are intentionally separate optional
  subsystems. They use different settings fields and do not reuse the browser
  UI click/boot sound preferences.
- Click sound is triggered from existing DOM renderer interaction handlers:
  hand-menu item activation, connection/config buttons, source/adaptor toggles,
  overlay and thermal/IR control changes, and slider interaction start.
- Boot sound is requested once when the browser renderer initializes.

## Operator Controls

- `UI Sounds Enabled` mutes or unmutes all browser UI sounds.
- `Click Volume` controls future click playback volume.
- `Boot Volume` controls future boot/startup playback volume.
- These controls are browser-side only and do not affect transport, sender,
  protocol, or thermal/IR control behavior.

## Persistence

- When browser local storage is available, UI audio preferences are restored
  from the `samsung-xr-app.ui-audio-settings` key.
- If local storage is unavailable or blocked, the app falls back safely to
  session-local defaults.

## Autoplay Behavior

- Browsers may block automatic audio playback before the first user gesture.
- When that happens, the boot sound is deferred silently and retried on the
  first supported UI interaction.
- To avoid overlapping sounds on that first interaction, the deferred boot cue
  takes priority over the click sound for that event.
- If UI audio is muted before that deferred retry happens, the deferred boot
  cue is skipped.

## Replacing The Placeholders Later

Replace either of these files in place:

- `public/assets/audio/ui/ui_click.wav`
- `public/assets/audio/system/boot_startup.wav`

No event wiring changes should be needed as long as the filenames and paths
stay the same.
