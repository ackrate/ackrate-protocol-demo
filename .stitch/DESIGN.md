---
name: Ackrate Editorial Landing
colors:
  light_canvas: "#F4F2EC"
  light_surface: "#FFFDF8"
  light_tonal: "#E7F1E6"
  primary_text: "#151914"
  secondary_text: "#283128"
  boundary_forest: "#123D2C"
  action_green: "#157A4B"
  signal_lime: "#B9F36A"
  caution_rust: "#8A473A"
  dark_canvas: "#0C1611"
  dark_surface: "#101C16"
  dark_raised: "#111E18"
  dark_tonal: "#162A21"
  dark_secondary: "#17201B"
  dark_text: "#F4F2EC"
---

# Design System: Ackrate Editorial Landing

## 1. Visual Theme & Atmosphere

Ackrate is an editorial, high-trust product identity for bounded agent authority. It combines warm paper-like light surfaces with deep botanical greens, precise hairline rules, oversized serif statements, and compact sans-serif interface text. The composition feels calm and human rather than like a technical dashboard.

Whitespace is generous and density is deliberately low. Each section delivers one idea, often supported by a simple permission diagram or comparison. A huge, low-contrast `AAA` motif gives the hero a recognizable background gesture without competing with the product name.

## 2. Color Palette & Roles

### Primary Foundation

- **Warm Paper (`#F4F2EC`)** — primary light canvas.
- **Soft Ivory (`#FFFDF8`)** — alternate and elevated light surface.
- **Permission Mist (`#E7F1E6`)** — explanatory and allowed-state surface.
- **Night Canvas (`#0C1611`)** — primary dark canvas.
- **Night Surface (`#101C16`)** — alternate dark section.
- **Raised Night (`#111E18`)** — dark elevated card.
- **Permission Night (`#162A21`)** — dark explanatory surface.
- **Secondary Night (`#17201B`)** — comparison surface.

### Accent & Interactive

- **Boundary Forest (`#123D2C`)** — dark bands, light-theme logo, and text on lime.
- **Enforcement Green (`#157A4B`)** — light-theme links, active states, and emphasis.
- **Signal Lime (`#B9F36A`)** — dark-theme actions, positive signals, and the contact band.
- **Caution Rust (`#8A473A`)** — negative and old-way comparison details.

### Typography & Text Hierarchy

- **Near-Black Ink (`#151914`)** — primary light-theme text.
- **Muted Forest Ink (`#283128`)** — secondary light-theme text.
- **Warm Paper Text (`#F4F2EC`)** — primary dark-theme text; use at 60–65% opacity for secondary copy.

### Functional States

Signal Lime and Enforcement Green communicate permitted or successful states. Caution Rust is reserved for risks and the old-way comparison. Borders use primary ink at 15–20% opacity in light mode and white at 15–20% opacity in dark mode.

## 3. Typography Rules

### Hierarchy & Weights

- Display headings use Georgia, Times New Roman, then the platform serif at regular weight, with tight leading and negative tracking.
- The hero product name is exceptionally large and editorial. Its descriptor is a heavy sans-serif statement.
- Body and interface text use Inter when available, then the platform sans-serif stack.
- Kickers are 11px, uppercase, black weight, with wide `0.19em` tracking.
- Body text is 16–20px with relaxed line height for nontechnical readability.

### Spacing Principles

Display text uses tight internal rhythm. Body paragraphs use generous leading. Section-level whitespace is substantially larger than component-level spacing, producing one clear narrative beat at a time.

## 4. Component Stylings

### Buttons

Pill-shaped, heavy sans-serif controls with a minimum 52px height. Light-mode primary buttons are near-black; dark-mode primary buttons are signal lime. Secondary buttons are transparent or lightly tinted with hairline borders. Hover motion lifts controls by only 2px.

### Cards & Permission Containers

Large containers use gently rounded corners, tonal backgrounds, and hairline borders. Depth is mostly flat; any shadow is broad and diffused. Permission widgets communicate job, budget, location, deadline, and result in plain language.

### Navigation

A 64px sticky translucent bar. Canonical SVG mark and uppercase wordmark on the left, contextual anchors on wider screens, and Auto/Light/Dark plus Documentation on the right. Landing anchors point to the idea, explanation, and contact.

### Inputs & Forms

Native controls retain accessible behavior and use compact pill containers, clear labels, and visible focus outlines. Touch targets are at least 44px.

### Logo

Use `/logo.svg` through `currentColor`. Boundary Forest on light backgrounds; Signal Lime on dark backgrounds. Never redraw, distort, rotate, crop, gradient-fill, or round the geometry.

### Contact

Use a full-width Signal Lime band as the strongest conversion moment. Primary action: email `consumer-contact@ackrate.com`. Secondary action: Documentation.

## 5. Layout Principles

### Grid & Structure

The hero is capped at 1440px (`90rem`); editorial sections are capped at 1312px (`82rem`). Desktop sections may use asymmetric two-column grids. All grids collapse to one column on narrow screens.

### Whitespace Strategy

Use 80–128px vertical section spacing on desktop and 64–80px on mobile. Edge padding scales from 20px on phones to 40px on large screens. Separate sections with thin rules.

### Alignment & Visual Balance

Prefer left-aligned editorial text. Balance long copy with whitespace or one simple diagram, not clusters of cards. The hero uses an oversized background `AAA` at very low contrast.

### Responsive Behavior & Touch

The first viewport fits beneath the sticky navigation at 1920×1080 and 1280×720. Central navigation hides on the smallest screens, while brand, theme, and docs remain available. Interactive targets meet a 44px minimum.

## 6. Design System Notes for Stitch Generation

### Language to Use

Use: editorial, warm paper, botanical green, precise, low-density, high-trust, human, calm, bounded permission, hairline rules, oversized serif statements.

Avoid: generic SaaS gradients, glass-card walls, neon cyberpunk styling, dense developer dashboards, excessive badges, fabricated customer logos, or implementation-heavy landing copy.

### Color References

Use Warm Paper with Near-Black Ink for the light canvas; Night Canvas with Warm Paper Text for dark mode; Signal Lime for the contact band and dark primary actions; Boundary Forest for high-contrast structural bands.

### Component Prompts

- “Create an editorial landing hero on warm paper with an enormous low-contrast AAA background, a very large serif Ackrate wordmark, one heavy sans-serif descriptor, and Contact/Docs pill actions.”
- “Create a plain-language permission example with job, spending ceiling, approved place, deadline, and outcome using flat botanical tonal surfaces and hairline borders.”
- “Create a signal-lime contact band with a large serif question, direct email action, and documentation as the only secondary action.”

### Incremental Iteration

Change one design dimension at a time. Preserve semantic color roles and typography pairing when experimenting with layout. Validate light, dark, and Auto themes at desktop, short-laptop, and phone viewports after every material change.
