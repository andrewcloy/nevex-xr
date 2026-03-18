# NEVEX XR Audio Design Language

## Character

The target character is:

- clean
- minimal
- synthetic but tasteful
- restrained
- aviation-inspired rather than cinematic
- readable in a headset

## What To Avoid

- playful UI chirps
- gamey beeps
- novelty sounds
- huge bass impacts
- long reverb tails
- harsh shrill highs
- dramatic risers or booms

## Waveform Guidance

Recommended:

- sine as the clean foundation
- triangle for slightly firmer body
- very restrained saw content for selected alerts only
- layered dual-tones for high-priority cues

Use sparingly:

- square components at low mix only where extra definition is needed

## Envelope Guidance

- fast but softened transients
- short attack for alerts, slightly rounded attack for UI
- controlled decay
- little or no sustain for confirms
- no long reverb tails

## Stereo Guidance

- use stereo conservatively
- subtle left-right offset is acceptable for heading and directional navigation cues
- avoid wide theatrical stereo images
- critical warnings should remain centered and stable

## Frequency Guidance By Category

### UI

- high-mid or mid accents
- soft and light

### Detection

- slightly brighter than UI
- focused and readable

### Navigation

- mid to high-mid
- distinct but not sharp

### Warnings

- lower-mid plus high-mid composite if needed
- clear contrast from confirms and navigation

### Boot / Readiness / State

- premium mid and upper-mid phrasing
- confident, trustworthy, not showy

## Duration Guidance

- passive UI cues: about 60 to 120 ms
- confirms: about 100 to 220 ms
- navigation cues: about 120 to 260 ms
- detections: about 140 to 230 ms
- warnings: about 280 to 650 ms
- boot / readiness phrases: about 500 to 800 ms

## Urgency Rules

- passive confirmations should be short and quiet
- navigation cues should be distinct but rate-limited
- detection cues should be more focused than UI cues
- urgent alerts should be unmistakable and clearly higher priority
