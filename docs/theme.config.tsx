import React from 'react';
import { DocsThemeConfig, useConfig } from 'nextra-theme-docs';
import { useRouter } from 'next/router';

const config: DocsThemeConfig = {
  logo: (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
      </svg>
      <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>Mimir</span>
    </div>
  ),
  project: {
    link: 'https://github.com/sebastianstupak/mimir',
  },
  docsRepositoryBase: 'https://github.com/sebastianstupak/mimir/tree/main/docs',

  // Footer configuration
  footer: {
    text: (
      <span>
        MIT {new Date().getFullYear()} ©{' '}
        <a href="https://github.com/sebastianstupak/mimir" target="_blank" rel="noopener noreferrer">
          Mimir
        </a>
        .
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
        titleTemplate: '%s – Mimir',
      };
    }
    return {
      titleTemplate: 'Mimir – Platform-agnostic AI Coding Agent',
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
        <meta property="og:title" content={frontMatter.title || title || 'Mimir'} />
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

  // i18n configuration
  i18n: [
    { locale: 'en', text: 'English' },
    { locale: 'es', text: 'Español' },
    { locale: 'fr', text: 'Français' },
    { locale: 'de', text: 'Deutsch' },
    { locale: 'zh', text: '中文' },
    { locale: 'ja', text: '日本語' },
  ],
};

export default config;
