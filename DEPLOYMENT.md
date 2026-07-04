# Deployment Structure

This project is split into two independent deployable applications:

## 📱 Landing Page
**Folder**: `landing-page/`
- Static HTML landing page for preservemy.world
- Contains: HTML + assets (images, videos)
- **Deploy to**: Cloudflare Pages (static site)
- **See**: `landing-page/DEPLOY.md`

## 🎮 Game Engine
**Folder**: `demo-game/`
- React + Vite flight game application
- Built with TypeScript, Three.js, React Three Fiber
- **Deploy to**: Cloudflare Pages (with build step)
- **See**: `demo-game/DEPLOY.md`

## Quick Deploy

### Landing Page (Static)
```bash
cd landing-page
wrangler pages deploy . --project-name=preservemy-landing
```

### Game Engine (React + Vite)
```bash
cd demo-game
npm install
npm run build
wrangler pages deploy dist --project-name=preservemy-game
```

## Domain Setup
- **Main domain** (`yourdomain.com`) → Landing Page
- **Game domain** (`game.yourdomain.com`) → Game Engine
- OR both under same Cloudflare project with path routing

See individual DEPLOY.md files for detailed instructions.
