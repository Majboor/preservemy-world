# preservemy.world 🌍🚪

> Walkable memory, heritage at risk. Turn ordinary phone footage into 3D worlds you can wander back into.

**preservemy.world** takes the places people are quietly losing — a family room before a move, a courtyard before repair, a mountain path before the season changes it — and turns everyday video into **walkable 3D memories**. No stock footage, no fancy rig. Just a phone, a place worth keeping, and a door you can open again later.

This repository holds the marketing site (a lovingly hand-built, scroll-animated landing experience) and an **experimental 3D reconstruction demo** that renders real captured scenes as point clouds and Gaussian splats right in the browser.

<p align="center">
  <img src="docs/media/hero-desktop.png" alt="preservemy.world hero — Discover the places we're trying to keep" width="100%" />
</p>

---

## ✨ What's inside

| Piece | What it does |
| --- | --- |
| **Landing site** (`index.html` + `assets/`) | A full scroll-driven story: hero, live worlds, "how it works", capabilities, real stories, and program forms. Smooth scrolling via Lenis, kinetic type via SplitType. |
| **Demo world** (`demo-game/`) | An in-browser 3D viewer built on [three.js](https://threejs.org/) + [Spark](https://sparkjs.dev/) that streams a captured scene as a Gaussian splat, with a point-cloud loader and a guided camera trajectory. Installable as a PWA. |
| **Lite mode** | A lightweight media path for phones and choppy connections — the hero still moves, your battery still lives. |

## 🖼️ A look around

| Desktop hero | On your phone | The 3D demo |
| --- | --- | --- |
| ![Desktop hero](docs/media/hero-desktop.png) | ![Mobile hero](docs/media/hero-mobile.png) | ![3D reconstruction demo](docs/media/demo-pointcloud.png) |

## 🌱 Features

- **Walk, don't scroll** — every world is a timestamped place you can move through, not a flat photo.
- **Captured by real people, on real phones** — no stock footage anywhere on the site.
- **Fully responsive** — the layout, type, and media all adapt gracefully from a 4K monitor down to a pocket screen.
- **Fast & considerate** — reduced-motion support, lite mode for weak connections, and lazily-loaded video posters.
- **Social-ready** — Open Graph and Twitter card metadata so shared links look the part.
- **Installable demo** — the reconstruction viewer ships a web manifest and service worker, so it can live on a home screen.

## 🚀 Run it locally

No build step, no toolchain, no drama. It's static — you just need to serve the folder over HTTP (opening `index.html` via `file://` won't load the modules or fonts correctly).

```bash
# 1. Grab the code
git clone https://github.com/waleedsworld/preservemy-world.git
cd preservemy-world

# 2. Serve it with anything that speaks HTTP. Python is already on most machines:
python3 -m http.server 5803

# 3. Open the door
#    Landing page → http://127.0.0.1:5803/
#    3D demo      → http://127.0.0.1:5803/demo-game/
```

Prefer Node? `npx serve .` works just as well. Prefer Docker? There's a `Dockerfile` that serves the site on port 8080 with nginx:

```bash
docker build -t preservemy-world .
docker run --rm -p 8080:8080 preservemy-world
# → http://127.0.0.1:8080/
```

> 💡 **Heads up:** the 3D demo streams its scene from a remote splat host. On a slow or offline connection the viewer will show a friendly "still loading / could not load" message instead of the world — that's expected, not a bug in your setup.

## 🗂️ Project layout

```
preservemy-world/
├── index.html          # the landing experience (all CSS/JS inline)
├── assets/             # fonts, hero videos, world clips, posters, social icons
├── demo-game/          # the in-browser 3D reconstruction viewer (PWA)
│   ├── index.html      # three.js + Spark scene + guided trajectory
│   ├── loader-point-cloud.json
│   ├── trajectory.json
│   └── manifest.webmanifest
└── Dockerfile          # nginx static-serve for deployment
```

## 🧰 Built with

- Hand-written HTML/CSS/JS — no framework, all styles and logic inline for a single-request feel
- [Lenis](https://lenis.darkroom.engineering/) for buttery smooth scrolling
- [SplitType](https://github.com/lukePeavey/SplitType) for line-by-line kinetic typography
- [three.js](https://threejs.org/) + [Spark](https://sparkjs.dev/) for the Gaussian-splat 3D demo
- Custom typefaces (GT Standard, FS, Inter, DM Mono) for that editorial feel

## 🌐 Live demo

Deploying soon. In the meantime, the "Run it locally" section above gets you the full experience in about thirty seconds.

## 📄 License & credits

Original design, copy, and code for preservemy.world. The captured worlds, footage, and heritage sites belong to the people and places that shared them — please treat them with the care they deserve.

---

<p align="center"><em>Preserve the places the world might forget.</em></p>
