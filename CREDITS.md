# Credits

Everything in the 3D lane (buildings, rickshaw, trees, props, animals, sea) is
generated procedurally in code. No third-party 3D models or textures are used.

## Fonts

- **Baloo 2** (weight 700, Latin + Devanagari subsets) by Ek Type,
  licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).
  Self-hosted in `public/fonts/`, used for the bilingual shop signboards.
  Source: https://fonts.google.com/specimen/Baloo+2
- **Instrument Serif** and **Instrument Sans** by Rodrigo Fuenzalida and Jordan Egstad,
  licensed under the SIL Open Font License 1.1. Self-hosted
  in `public/fonts/`, used for the project panels and labels (as on the classic site).

## Project screenshots

All screenshots are of Hardik's own projects, in `public/projects/`:

- OMEN: from the repo's `docs/screens` (github.com/HNTRHACK/OMEN).
- ChaiPay: from the repo's `docs/` (github.com/HNTRHACK/chaipay).
- UMANG: captured from the live site, umang-roan.vercel.app.
- Federated Clinical Platform, ORION, COBRA KAI: designed placeholders (`*.svg`),
  to be replaced with real screenshots.

## Personal files

- `public/me/portrait.webp`: a monogram placeholder; replace it with a real portrait
  (any aspect, it's cropped to fit the hoarding's frame).
- `public/resume.pdf`: optional. When it exists at build time, the About panel shows a
  "Download résumé" button (restart `npm run dev` after adding it).

## Libraries

- [three.js](https://threejs.org) (MIT)
- [Rapier](https://rapier.rs) physics (Apache-2.0)
- [GSAP](https://gsap.com) (GreenSock standard licence)
- [lil-gui](https://lil-gui.georgealways.com) (MIT, debug panel only)
