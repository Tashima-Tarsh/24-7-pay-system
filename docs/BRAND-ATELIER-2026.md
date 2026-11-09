# 24/7 Pay — Atelier brand specification

The premium visual system is designed for UPI checkout, the merchant workspace, the platform control center, and the public marketing site. This is a design identity, not a certification statement.

| Token | Color | Purpose |
|---|---|---|
| Ivory | `#F6F1E6` | Warm accessible page canvas |
| Paper | `#FFFDF8` | Dashboard cards, forms and invoices |
| Forest | `#183D30` | Identity, navigation, dark storytelling |
| Copper | `#B84D2F` | Primary actions and selected emphasis |
| Brass | `#D9AC63` | Premium decorative accents |
| Ink | `#21392D` | Primary text on light backgrounds |

The SVG mark at `public/assets/pay247-mark.svg` scales cleanly to any resolution, and should be used instead of rasterizing logos into component source.

The shared stylesheet `public/assets/247-brand.css` is loaded **after** the original marketing, workspace and checkout styles to preserve structural layout while replacing the previous navy/cyan/violet appearance. Scope differences use the `data-pay-surface` attribute on the page body.

Do not advertise that payment apps opening, customer-provided UTRs, or status animations constitute verified funds received. Existing payment confirmation safeguards are not changed by this design release.

MFA and credential provisioning are intentionally not altered as part of this visual redesign.
