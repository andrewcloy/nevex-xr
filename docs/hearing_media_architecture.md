# Hearing And Media Architecture

This pass adds the first optional-subsystem architecture for:

- hearing enhancement / ambient audio
- phone or media playback controls

These subsystems follow the same high-level pattern already used for thermal and
IR:

- capability/status models
- safe unavailable defaults
- small sender-side controller contracts
- browser settings/state integration
- compact status and diagnostics UI

## Important Separation

Browser UI feedback sounds are still a separate system.

- `uiAudioEnabled`
- `uiClickVolume`
- `uiBootVolume`

continue to control only browser click and boot sounds.

They do not control:

- hearing enhancement mode
- hearing gain
- phone/media playback volume
- phone/media mute state

## Hearing Enhancement Model

Shared capability fields:

- `hearingEnhancementAvailable`
- `microphoneArrayAvailable`
- `audioEnhancementBackendIdentity`
- `hearingModesSupported`
- `hearingHealthState`
- `hearingErrorText`
- `hearingGainMin`
- `hearingGainMax`
- `hearingLatencyEstimateMs`

Supported hearing modes:

- `off`
- `ambient_boost`
- `balanced`
- `voice_focus`
- `hearing_protection`

Current browser-side operator settings:

- `hearingMode`
- `hearingGain`

This pass does not add real microphone capture or DSP. The browser stores the
selected target state locally, while transport capability defaults remain safe
when the subsystem is absent.

## Hearing Controllers

Sender-side architecture stubs now exist under `scripts/sender/audio/`:

- `audio_enhancement_controller_contract.mjs`
- `unavailable_audio_enhancement_controller.mjs`
- `simulated_audio_enhancement_controller.mjs`

The simulated controller allows future bring-up and tests to exercise:

- hearing mode changes
- hearing gain changes
- fake backend identity
- fake health and latency reporting

## Phone / Media Audio Model

Shared capability fields:

- `phoneAudioAvailable`
- `bluetoothAudioConnected`
- `mediaPlaybackControlSupported`
- `mediaPlaybackState`
- `mediaVolumeMin`
- `mediaVolumeMax`

Current browser-side operator settings:

- `mediaVolume`
- `mediaMuted`

Supported control-command model:

- `play`
- `pause`
- `next`
- `previous`
- `volume_up`
- `volume_down`

This pass does not add real Bluetooth audio routing, phone integration, or
media transport.

## Media Controllers

Sender-side architecture stubs now exist under `scripts/sender/audio/`:

- `media_playback_controller_contract.mjs`
- `unavailable_media_playback_controller.mjs`
- `simulated_media_playback_controller.mjs`

The simulated controller models:

- playback state
- mute state
- bounded media volume
- simple control-command transitions

## Browser UI

The browser status/settings UI now includes a compact `Hearing & Media` section
with:

- hearing mode selector
- hearing gain slider
- media mute toggle
- media volume slider
- placeholder playback buttons

When subsystem capability flags are absent or false, these controls remain
disabled and the app continues operating normally.

## Diagnostics

Diagnostics now surface:

- hearing enhancement available/unavailable
- microphone array available/unavailable
- hearing backend identity
- current hearing mode and gain target
- hearing health state
- hearing latency estimate
- phone audio available/unavailable
- bluetooth audio connected/disconnected
- media playback control support
- media playback state
- media volume target
- media muted target

## Placeholder Icon Paths

This pass references future placeholder icon paths under
`/assets/icons/audio/`:

- `icon_hearing_amp_placeholder.png`
- `icon_audio_passthrough_placeholder.png`
- `icon_voice_focus_placeholder.png`
- `icon_hearing_protection_placeholder.png`
- `icon_bluetooth_audio_placeholder.png`
- `icon_music_player_placeholder.png`
- `icon_media_play_placeholder.png`
- `icon_media_pause_placeholder.png`
- `icon_media_next_placeholder.png`
- `icon_media_prev_placeholder.png`
- `icon_volume_placeholder.png`

These files are not required to exist yet. The current browser UI renders safe
text-based placeholder badges while preserving the future asset paths in the UI
catalog.

## Behavior When Hardware Is Absent

The system continues operating normally when:

- no microphones exist
- no hearing-enhancement backend exists
- no phone or Bluetooth audio endpoint exists
- no media playback session exists

Unavailable defaults remain explicit in diagnostics and the controls stay
non-destructive.
