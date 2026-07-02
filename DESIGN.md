# Design

## Theme

Warm old-money collegiate. Cream paper surfaces, deep forest green authority, gold as a seal — never decoration. Funnel pages open on a dark forest hero (dark-academia register) and settle into cream for the persuasion body.

## Color

| Token | Value | Use |
|---|---|---|
| `--cream` | `#FDF8F0` | page background |
| `--sage` | `#4A7C59` | primary brand, buttons, links |
| `--sage-deep` | `#3A6347` | button hover, emphasized text |
| `--forest` | `#1E4D38` | dark hero/guarantee surfaces, dark CTAs |
| `--forest-deep` | `#16382A` | dark section gradients, footer |
| `--gold` | `#C5A572` | accent words (italic serif), seals, rules |
| `--gold-deep` | `#A8854E` | eyebrows/labels on cream |
| `--ink` | `#1F2B23` | headlines on cream |
| `--muted` | `#5C6B60` | body text on cream (4.6:1 on cream) |
| `--line` | `#E4DECF` | hairline borders on cream |
| `--cream-on-dark` | `rgba(253,248,240,.92)` | body on forest |

Never: navy + lime (deprecated legacy ad palette), blue/purple accents, gradient text.

## Typography

- **Display: Lora** (500/600/700). Headlines with *italic gold accent words* — the signature move ("got in *themselves*", "where your student *stands*").
- **Body/UI: Instrument Sans** (400/500/600). Eyebrows uppercase, 0.12em tracking, gold-deep.
- Hero headline clamp(34px → 54px); section headline clamp(26px → 36px); body 16–17px/1.65.
- `text-wrap: balance` on headings.

## Components

- **Buttons:** pill-less, 2px radius, sage fill / cream text; on dark surfaces gold fill with forest text is the primary. Ghost secondary with 1px sage border.
- **Proof frames:** white card, 1px `--line`, 14px radius, soft shadow only where the artifact needs lift (screenshots of real evidence).
- **Seals/badges:** 1px gold-tinted border pill, uppercase Instrument Sans 12px.
- **Video frame:** forest surround, 16px radius, custom poster (never a raw webcam frame), honest duration label.
- **Dark sections:** forest background, cream text, gold accents; used for hero and guarantee only.

## Motion

Fade-up reveals 0.6s ease-out, content visible by default (reveals are additive, never gate visibility — no-JS and reduced-motion get full content). Stagger ≤3 siblings. Nothing bounces.

## Imagery

Dark-academia library and collegiate photography (warm golden-hour grading). Real evidence screenshots (College Board reports, MySchools offers, parent texts) presented as first-class artifacts. Real tutor headshots. Logos: `logo-transparent.png` on cream, `logo-white-transparent.png` on forest.
