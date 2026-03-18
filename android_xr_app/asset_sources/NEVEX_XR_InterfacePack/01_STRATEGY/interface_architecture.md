# Interface Architecture

## Live mission layer

This is the default operational surface. It should preserve maximum scene visibility while exposing only critical status, active mode, target cues, and immediate capture or recenter actions. All persistent elements should have a strong reason to exist.

## Quick controls layer

This is a lightweight side strip or radial-adjacent control rail for live adjustments. It should contain brightness, gain, exposure, zoom, thermal blend, IR toggle, detection toggle, and profile switching. Controls here must be one-step or one-slider interactions with no deep nesting.

## Full settings layer

This is the non-urgent configuration surface. It holds recording defaults, network/device setup, profile tuning, data export preferences, advanced detection behavior, and all options that would otherwise overload the live experience.

## Alerts and status layer

Alerts should be card-based, interrupt only when needed, and dismiss cleanly. Persistent status belongs in minimal icon form with color escalation rules. Critical alerts can briefly occlude view space; warnings should prefer edge-safe cards and status chips.

## Calibration layer

Calibration needs a focused mode with guided steps, reduced distractions, and high-contrast alignment aids. Stereo alignment, thermal registration, horizon/recenter, and sensor validation should live here rather than in the day-to-day HUD.

## Diagnostics layer

Diagnostics is an engineering and support surface for link health, frame cadence, latency, sensor state, thermal availability, storage condition, and Jetson handshake. It should be separate from routine use and easy to capture in screenshots or recordings for troubleshooting.
