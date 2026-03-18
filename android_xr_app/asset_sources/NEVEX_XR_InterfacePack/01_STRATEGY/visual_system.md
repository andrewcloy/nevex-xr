# Visual System

## Palette usage

The base UI stays in dark graphite and deep blue-black surfaces. Cyan and active blue provide focus, selection, and live-system energy. Text remains pale and cool, with muted blue-grey for secondary information.

## Glow restraint

Glow is a guidance cue, not a decorative effect. Use it to indicate active state, panel edge definition, or live mode emphasis. Avoid large bloom halos and avoid making every element luminous.

## Glyph vs tile usage

Glyph icons are for HUD overlays, quick live controls, reticles, and status indicators. Tile icons are for menus, launch surfaces, profile panels, settings hubs, and control panels. The same semantic icon may exist in both families, but the glyph should always remain simpler.

## Contrast hierarchy

Scene first, then active control, then secondary information. Critical alerts override this hierarchy temporarily with orange or red. Backgrounds should stay dark enough that cyan and white cues remain readable in mixed ambient conditions.

## Warning and critical color rules

Use `warning` for caution, degraded quality, low battery, and heat concern. Use `danger` for hard faults, critical thermal states, or unsafe operating conditions. These colors should be reserved so they remain meaningful.

## Thermal color containment

Thermal colors are reserved for thermal-specific controls, overlays, hotspots, and thermal cards. Do not let orange-red thermal hues dominate generic navigation, settings, or system controls.
