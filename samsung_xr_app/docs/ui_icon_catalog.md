# UI Icon Catalog

This pass standardizes the latest downloaded PNG batch into runtime-stable public
asset URLs under `public/assets/icons/...`, which the browser loads as
`/assets/icons/...`.

## Mapped Icons

| Target | Source filename | Final project path | Notes |
| --- | --- | --- | --- |
| `icon_exit_menu.png` | `ChatGPT Image Mar 13, 2026, 03_31_14 PM.png` | `public/assets/icons/menu/icon_exit_menu.png` | Chosen over `03_32_04 PM` because the text-free arrow-out graphic scales better in compact UI. |
| `icon_exit_nevex.png` | `ChatGPT Image Mar 13, 2026, 03_27_12 PM.png` | `public/assets/icons/menu/icon_exit_nevex.png` | Direct match for exiting the NEVEX shell. |
| `icon_close_menu.png` | `ChatGPT Image Mar 13, 2026, 03_22_19 PM.png` | `public/assets/icons/menu/icon_close_menu.png` | Approximate close/dismiss affordance. |
| `icon_quick_settings.png` | `ChatGPT Image Mar 13, 2026, 03_30_16 PM.png` | `public/assets/icons/settings/icon_quick_settings.png` | Chosen over `03_28_03 PM` because the sliders-only icon stays readable at small sizes. |
| `icon_settings.png` | `ChatGPT Image Mar 13, 2026, 02_31_10 PM.png` | `public/assets/icons/settings/icon_settings.png` | Clear gear/settings match. |
| `icon_power.png` | `ChatGPT Image Mar 13, 2026, 03_29_00 PM.png` | `public/assets/icons/system/icon_power.png` | Clear power/system control match. |
| `icon_wifi.png` | `ChatGPT Image Mar 13, 2026, 02_41_08 PM.png` | `public/assets/icons/system/icon_wifi.png` | Direct transport/connectivity match. |
| `icon_target_lock.png` | `ChatGPT Image Mar 13, 2026, 02_39_08 PM.png` | `public/assets/icons/detection/icon_target_lock.png` | Locked target silhouette. |
| `icon_tracking.png` | `ChatGPT Image Mar 13, 2026, 02_39_55 PM.png` | `public/assets/icons/detection/icon_tracking.png` | Multi-target tracking match. |
| `icon_animal_detect.png` | `ChatGPT Image Mar 13, 2026, 03_12_01 PM.png` | `public/assets/icons/detection/icon_animal_detect.png` | Chosen over `03_05_59 PM`; reads more like general wildlife detection than a locked single target. |
| `icon_compass.png` | `ChatGPT Image Mar 13, 2026, 02_37_19 PM.png` | `public/assets/icons/navigation/icon_compass.png` | Direct compass/orientation match. |
| `icon_map_navigation.png` | `ChatGPT Image Mar 13, 2026, 03_10_42 PM.png` | `public/assets/icons/navigation/icon_map_navigation.png` | Chosen over `03_06_44 PM`; map-pin/route composition is more explicit. |
| `icon_rangefinder.png` | `ChatGPT Image Mar 13, 2026, 02_38_15 PM.png` | `public/assets/icons/sensors/icon_rangefinder.png` | Clear rangefinding reticle with distance readout. |
| `icon_calibration.png` | `ChatGPT Image Mar 13, 2026, 03_01_35 PM.png` | `public/assets/icons/sensors/icon_calibration.png` | Wrench plus reticle makes the calibration intent clear. |
| `icon_scan_mode.png` | `ChatGPT Image Mar 13, 2026, 03_04_37 PM.png` | `public/assets/icons/sensors/icon_scan_mode.png` | Radar sweep / scan-mode match. |
| `icon_ir_laser.png` | `ChatGPT Image Mar 13, 2026, 03_07_52 PM.png` | `public/assets/icons/sensors/icon_ir_laser.png` | Approximate IR laser / aiming emitter match. |

## UI Integration Notes

- The new catalog is exposed in `src/ui/assets/uiAssets.ts` under
  `productionIcons`.
- Current menu/status/settings integration only uses the icons that clearly fit
  existing UI affordances today.
- Several mapped icons are cataloged but intentionally not shown yet because
  the current UI does not expose a matching control or workflow without adding
  new behavior.

## Planned Audio Placeholder Paths

The hearing/media architecture pass also reserves future placeholder icon URLs
under `public/assets/icons/audio/` and exposes them through
`src/ui/assets/uiAssets.ts`:

- `/assets/icons/audio/icon_hearing_amp_placeholder.png`
- `/assets/icons/audio/icon_audio_passthrough_placeholder.png`
- `/assets/icons/audio/icon_voice_focus_placeholder.png`
- `/assets/icons/audio/icon_hearing_protection_placeholder.png`
- `/assets/icons/audio/icon_bluetooth_audio_placeholder.png`
- `/assets/icons/audio/icon_music_player_placeholder.png`
- `/assets/icons/audio/icon_media_play_placeholder.png`
- `/assets/icons/audio/icon_media_pause_placeholder.png`
- `/assets/icons/audio/icon_media_next_placeholder.png`
- `/assets/icons/audio/icon_media_prev_placeholder.png`
- `/assets/icons/audio/icon_volume_placeholder.png`

These files do not need to exist yet. The current browser UI renders safe
text-based fallback badges while preserving the final placeholder paths for the
upcoming icon pack.
