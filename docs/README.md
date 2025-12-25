# Mimir Documentation

This directory contains the official documentation for Mimir, built with [Nextra](https://nextra.site).

## Features

- ✨ **Dark/Light Theme** - Automatic theme switching with system preference support
- 🌍 **Internationalization** - Multi-language support (English, Spanish, French, German, Chinese, Japanese)
- 🔍 **Full-Text Search** - Built-in search with code block support
- 📱 **Responsive Design** - Mobile-friendly documentation
- 🚀 **Fast Performance** - Static site generation with Next.js
- 🎨 **MDX Support** - Write documentation with Markdown + React components

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm, yarn, or pnpm

### Installation

```bash
cd docs
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the documentation.

The pages will auto-reload when you make changes.

### Building

Build the static site:

```bash
npm run build
```

The output will be in the `out/` directory.

### Preview Production Build

```bash
npm run build
npm run start
```

## Project Structure

```
docs/
├── pages/              # Documentation pages (MDX)
│   ├── index.mdx      # Home page
│   ├── _meta.json     # Navigation configuration
│   ├── _app.tsx       # Custom App component
│   └── .../           # Content directories
├── public/            # Static assets
├── styles/            # Global styles
│   └── globals.css
├── theme.config.tsx   # Nextra theme configuration
├── next.config.mjs    # Next.js configuration
├── package.json
└── tsconfig.json
```

## Writing Documentation

### Creating a New Page

1. Create a new `.mdx` file in the appropriate directory:
   ```bash
   touch pages/guides/new-guide.mdx
   ```

2. Add frontmatter and content:
   ```mdx
   ---
   title: My New Guide
   description: A helpful guide about something
   ---

   # My New Guide

   Content goes here...
   ```

3. Update `_meta.json` in the directory:
   ```json
   {
     "new-guide": {
       "title": "My New Guide",
       "type": "page"
     }
   }
   ```

### Using Components

Nextra provides built-in components:

```mdx
import { Callout, Steps, Tabs, Tab } from 'nextra/components'

<Callout type="info">
  This is an informational callout
</Callout>

<Steps>
### Step 1
Do this first

### Step 2
Then do this
</Steps>

<Tabs items={['npm', 'yarn', 'pnpm']}>
  <Tab>npm install</Tab>
  <Tab>yarn add</Tab>
  <Tab>pnpm add</Tab>
</Tabs>
```

### Code Blocks

Use fenced code blocks with language tags:

````mdx
```typescript filename="example.ts" {2}
interface Config {
  apiKey: string; // This line will be highlighted
}
```
````

## Theme Configuration

Edit `theme.config.tsx` to customize:

- Logo and branding
- Navigation links
- Footer content
- Color scheme
- SEO metadata
- Social links

## Internationalization

### Adding a Translation

1. Create a locale-specific file:
   ```
   pages/index.mdx      (English)
   pages/index.es.mdx   (Spanish)
   pages/index.fr.mdx   (French)
   ```

2. Ensure the locale is configured in `theme.config.tsx`:
   ```typescript
   i18n: [
     { locale: 'en', text: 'English' },
     { locale: 'es', text: 'Español' },
     // ...
   ]
   ```

### Translation Workflow

1. Write complete English documentation first
2. Create locale-specific versions for high-priority pages
3. Keep translations in sync when updating content

## Deployment

### GitHub Pages

The documentation automatically deploys to GitHub Pages when changes are pushed to the `main` branch.

The workflow is defined in `.github/workflows/deploy-docs.yml`.

### Manual Deployment

```bash
# Build static site
npm run build

# Deploy the `out/` directory to your hosting provider
```

### Environment Variables

For GitHub Pages deployment:

- `BASE_PATH`: Set to repository name for project pages (e.g., `/mimir`)
- Leave empty for user/org pages (e.g., `username.github.io`)

## Best Practices

See [Best Practices](/best-practices) in the documentation for comprehensive guidelines on:

- Writing clear documentation
- Theme and color management
- Internationalization
- Search optimization
- Accessibility
- Performance optimization

## Troubleshooting

### Build Errors

```bash
# Clear cache and rebuild
rm -rf .next out node_modules
npm install
npm run build
```

### Search Not Working

- Ensure `search.codeblocks: true` is set in `next.config.mjs`
- Rebuild to regenerate the search index

### Styles Not Applying

- Check CSS syntax in `styles/globals.css`
- Clear browser cache
- Verify theme variables are properly defined

## Resources

- [Nextra Documentation](https://nextra.site)
- [Next.js Documentation](https://nextjs.org/docs)
- [MDX Documentation](https://mdxjs.com)
- [Markdown Guide](https://www.markdownguide.org)

## Contributing

Contributions to the documentation are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b docs/improve-guide`)
3. Make your changes
4. Test locally (`npm run dev`)
5. Build successfully (`npm run build`)
6. Submit a pull request

### Commit Convention

```
docs: <summary>

Examples:
- docs: add API reference for tools
- docs: fix typo in installation guide
- docs(i18n): add Spanish translation
```