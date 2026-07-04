# Game Engine Deployment

This is the React + Vite flight game application.

## Deploy to Cloudflare Pages

### Using Cloudflare Dashboard:
1. Go to **Cloudflare Pages**
2. Create new project
3. Connect to your Git repo → select this project
4. Build settings:
   - **Framework**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node version**: 18 or higher
5. Deploy

### Using Wrangler CLI:
```bash
cd demo-game
npm install
npm run build
wrangler pages deploy dist --project-name=your-project-name
```

### Local Development:
```bash
cd demo-game
npm install
npm run dev
# Open http://localhost:5173
```

## Build & Preview:
```bash
npm run build
npm run preview
```

## Environment
- Node: v18+
- React: 18.3.1
- Vite: 5.4.21
- TypeScript: 5.7.3
