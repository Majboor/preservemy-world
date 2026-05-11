# Landing Page Deployment

This is the static landing page for preservemy.world.

## Deploy to Cloudflare Pages

### Using Cloudflare Dashboard:
1. Go to **Cloudflare Pages**
2. Create new project
3. Connect to your Git repo → select this project
4. Build settings:
   - **Build command**: (leave empty - no build needed)
   - **Build output directory**: `.` or leave empty
5. Deploy

### Using Wrangler CLI:
```bash
npm install -g wrangler
cd landing-page
wrangler pages deploy .
```

### Using Direct Upload:
```bash
cd landing-page
wrangler pages deploy --project-name=your-project-name .
```

## Files
- `index.html` - Main landing page
- `assets/` - Images and videos for the page
