# NEVEX XR XR Usability Rules

## Purpose

These rules are intended to keep NEVEX XR usable in an actual headset, not just visually coherent in static previews.

## Core Rules

### 1. The scene is the product

Every persistent element steals attention from the real world. Default to less UI, not more.

### 2. Live controls must beat browse controls

Frequently used in-operation adjustments belong in the quick layer. Browsing and configuration belong in the main menu.

### 3. Not every feature deserves equal visibility

High-frequency tasks should be close. Rare tasks should be quieter and deeper.

### 4. Menus must explain themselves

Main navigation should use icon plus label. Do not expect users to decode a row of abstract tiles while wearing the headset.

### 5. One panel, one question

Each screen or panel should have a single primary intent, such as:

- adjust image
- tune thermal
- start capture
- review playback
- check device state

If a panel answers multiple unrelated questions, split it.

## HUD Rules

- keep persistent HUD indicators to a minimum
- prefer subtle status chips over persistent bright badges
- only show warnings when actionable or safety-relevant
- do not surface engineering metrics in routine HUD states
- detection overlays should be suppressible quickly

## Quick Menu Rules

- keep to about 6 to 8 items
- use direct sliders, segmented controls, and toggles
- avoid multiple nested panels
- remove low-frequency settings from this layer
- if a control needs explanation text, it probably belongs in the main menu

## Main Menu Rules

- keep top-level categories few and broad
- use labels with icons
- avoid giant scroll dumps
- use grouped sections under each category
- if a category contains many options, show subgroup cards or section headers first

## Advanced Layer Rules

- calibration, diagnostics, service, and recovery live here
- destructive or risky actions need confirmation
- expert tools should not be mixed with normal UI preferences
- the path into advanced areas should be deliberate, but not hidden

## Label Rules

### Labels required

- main menu categories
- first-level submenu entries
- destructive actions
- export actions
- profile choices
- advanced tools
- calibration utilities

### Labels optional

- repeat-use quick menu controls after they are spatially stable
- small HUD indicators with universally understood semantics

### Labels not needed inside artwork

- icons themselves should remain text-free
- labels belong in UI layout, not baked into PNG assets

## Density Rules

- prefer 5 to 7 visible actions on a panel
- use section headers before using scrolling
- split any panel that becomes a feature dump
- keep text short and scannable

## State Rules

- active state should be clear without relying on tiny visual changes
- disabled state should look intentionally unavailable, not merely dim
- warning state should use orange sparingly
- critical state should use red rarely and with strong meaning
- thermal colors should appear only where thermal meaning exists

## Motion And Focus Rules

- panel transitions should be calm and quick
- avoid theatrical motion that distracts from the scene
- preserve a clear focus target during navigation
- do not allow UI stacks to pile up into layered confusion

## Input Rules

- primary confirm action should always be predictable
- back behavior should always unwind one logical layer
- avoid long-press for essential functions
- destructive actions should require explicit confirmation

## Audit Rules For Future Features

When adding a new feature, ask:

1. Is this used during live operation?
2. Does it need one-step access?
3. Does it belong in `Vision`, `Thermal`, `Capture`, `Playback`, `Device`, `System`, or `Advanced`?
4. Can it live inside an existing grouped section?
5. Does it need an icon, or only a labeled row?

If those answers are unclear, the feature should not become a new top-level destination.
