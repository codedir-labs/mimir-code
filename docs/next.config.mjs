import nextra from 'nextra';

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
  defaultShowCopyCode: true,
  latex: true,
  search: {
    codeblocks: true,
  },
});

export default withNextra({
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: process.env.BASE_PATH || '',
  // GitHub Pages specific configuration
  trailingSlash: true,
});
