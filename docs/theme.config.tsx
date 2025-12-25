import React from 'react';
import { DocsThemeConfig, useConfig } from 'nextra-theme-docs';
import { useRouter } from 'next/router';
import { Logo } from './components/Logo';
import { GITHUB_URL, DOCS_REPO_URL, ORG_NAME } from './lib/constants';

const config: DocsThemeConfig = {
  logo: <Logo />,
  project: {
    link: GITHUB_URL,
  },
  docsRepositoryBase: DOCS_REPO_URL,

  // Footer configuration
  footer: {
    text: (
      <span>
        © {new Date().getFullYear()}{' '}
        <a href="https://github.com/codedir-labs" target="_blank" rel="noopener noreferrer">
          {ORG_NAME}
        </a>
        . AGPL-3.0 License.
      </span>
    ),
  },

  // Theme color and appearance
  primaryHue: 212, // Blue hue for the primary theme color
  primarySaturation: 100,

  // SEO configuration
  useNextSeoProps() {
    const { asPath } = useRouter();
    if (asPath !== '/') {
      return {
        titleTemplate: '%s – Mimir Code',
      };
    }
    return {
      titleTemplate: 'Mimir Code – Platform-agnostic AI Coding Agent',
    };
  },

  head: function Head() {
    const { asPath, defaultLocale, locale } = useRouter();
    const { frontMatter, title } = useConfig();
    const url =
      'https://yourusername.github.io/mimir' +
      (defaultLocale === locale ? asPath : `/${locale}${asPath}`);

    return (
      <>
        <meta property="og:url" content={url} />
        <meta property="og:title" content={frontMatter.title || title || 'Mimir Code'} />
        <meta
          property="og:description"
          content={frontMatter.description || 'Platform-agnostic, BYOK AI coding agent CLI'}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </>
    );
  },

  // Edit link configuration
  editLink: {
    text: 'Edit this page on GitHub →',
  },

  // Feedback link
  feedback: {
    content: 'Question? Give us feedback →',
    labels: 'feedback',
  },

  // Sidebar configuration
  sidebar: {
    titleComponent({ title, type }) {
      if (type === 'separator') {
        return <div style={{ fontWeight: 'bold', marginTop: '1rem' }}>{title}</div>;
      }
      return <>{title}</>;
    },
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },

  // Table of contents
  toc: {
    backToTop: true,
    title: 'On This Page',
  },

  // Navigation
  navigation: {
    prev: true,
    next: true,
  },

  // Dark mode toggle
  darkMode: true,

  // Next/Previous page navigation
  nextThemes: {
    defaultTheme: 'system',
    storageKey: 'mimir-theme',
  },

  // Banner (optional - uncomment if needed)
  // banner: {
  //   key: 'release-1.0',
  //   text: (
  //     <a href="/blog/release-1.0" target="_blank">
  //       🎉 Mimir 1.0 is released. Read more →
  //     </a>
  //   ),
  // },

  // Git timestamp
  gitTimestamp: ({ timestamp }) => (
    <>Last updated on {timestamp.toLocaleDateString()}</>
  ),
};

export default config;
