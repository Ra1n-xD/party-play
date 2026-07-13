# Animated Wedding Projector Placeholder Design

## Goal

Create a single standalone `фон.html` file that reproduces the supplied 16:9 PowerPoint placeholder for a wedding projector. The page must preserve the original names, date, warm neutral palette, organic corner shapes, floral decorations, and scattered sparkle accents while adding calm, continuous motion suitable for being displayed indefinitely.

## Deliverable and Architecture

- The deliverable is one self-contained HTML file at the repository root.
- The file uses semantic HTML, inline CSS, and inline SVG only.
- It has no runtime dependencies, external fonts, network requests, or separate image assets.
- The canvas fills the browser viewport and keeps the original 16:9 composition visually centered on wider and taller projector outputs.
- Decorative SVG is hidden from assistive technology; the names and date remain real selectable text.

## Visual Composition

- Base background: warm ivory matching the source slide.
- Top-left: layered taupe organic waves extending beyond the canvas.
- Top-right: a botanical arrangement in muted olive, brown, sand, and cream tones.
- Bottom-right: a soft cream organic shape with a thin berry branch.
- Across the canvas: sparse four-point ivory sparkles.
- Center: large dark-brown `Даня и Даша`, with `14.07.26` directly below in the same restrained sans-serif character as the source.
- The composition remains intentionally spacious and does not introduce buttons, controls, captions, or new wedding copy.

## Motion Design

- Background waves drift by a few pixels on long alternating cycles, creating a slow breathing effect.
- Botanical groups sway subtly around their attachment points; nearby leaves use slightly different durations to avoid synchronized mechanical movement.
- Berry branches float gently with small rotation and translation.
- Sparkles pulse and rotate at staggered intervals, with no rapid flashing.
- The central names and date remain stable, with only a very subtle ambient opacity or shadow shift so projector readability is never reduced.
- All animations loop seamlessly and use transform and opacity where possible for reliable browser performance.
- `prefers-reduced-motion: reduce` disables decorative animation and leaves the complete static composition visible.

## Responsive Behavior

- The composition is defined against a 1600×900 SVG view box and scales proportionally to the viewport.
- Decorative elements may extend beyond the viewport edge, matching the cropped source-slide treatment.
- Text uses `clamp()` fallbacks so the names remain on one line on common 16:9 and 16:10 projector resolutions.
- The page prevents scrolling and uses a safe system sans-serif font stack for offline operation.

## Verification

- Open the file directly from disk in a modern Chromium browser without a server.
- Compare the full-screen composition against the rendered source slide at 1600×900.
- Check that every animation loops without a visible jump and remains calm during prolonged viewing.
- Check common projector ratios, including 1920×1080 and 1920×1200, for clipping or unwanted scrollbars.
- Confirm the page performs no external network requests and remains complete with reduced motion enabled.

## Non-Goals

- No integration with the PartyPlay React client or its routes.
- No controls, countdown, music, slideshow behavior, or editable settings.
- No redesign of the supplied composition and no changes to the names or date.
