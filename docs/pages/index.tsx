import React from 'react';
import Head from 'next/head';
import { LandingNavbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { LandingFooter } from '../components/landing/Footer';

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>Mimir Code – Open Source Model Agnostic CLI</title>
        <meta name="description" content="Open source, model agnostic CLI tool for agentic work" />
        <meta property="og:title" content="Mimir Code – Open Source Model Agnostic CLI" />
        <meta
          property="og:description"
          content="Open source, model agnostic CLI tool for agentic work"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="landing-page">
        <LandingNavbar />
        <Hero />
        <LandingFooter />
      </div>
    </>
  );
}
