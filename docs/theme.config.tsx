import React from 'react';
import { DocsThemeConfig } from 'nextra-theme-docs';
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
    content: (
      <span>
        © {new Date().getFullYear()}{' '}
        <a href="https://github.com/codedir-labs" target="_blank" rel="noopener noreferrer">
          {ORG_NAME}
        </a>
        . AGPL-3.0 License.
      </span>
    ),
  },

  // Edit link configuration
  editLink: {
    content: 'Edit this page on GitHub →',
  },

  // Feedback link
  feedback: {
    content: 'Question? Give us feedback →',
    labels: 'feedback',
  },

  // Sidebar configuration
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },

  // Table of contents
  toc: {
    backToTop: true,
  },

  // Dark mode toggle
  darkMode: true,
};

export default config;
