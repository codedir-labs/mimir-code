import React, { useEffect } from 'react';
import Head from 'next/head';
import { LandingNavbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { Manifesto } from '../components/landing/Manifesto';
import { LandingFooter } from '../components/landing/Footer';

export default function LandingPage() {
  // Add landing-page class to body element to prevent Nextra docs styling
  useEffect(() => {
    document.body.classList.add('landing-page');
    return () => {
      document.body.classList.remove('landing-page');
    };
  }, []);

  return (
    <>
      <Head>
        <title>Mimir Code – Open Source Model Agnostic CLI</title>
        <meta name="description" content="Iterate faster. Security by design." />
        <meta property="og:title" content="Mimir Code – Open Source Model Agnostic CLI" />
        <meta
          property="og:description"
          content="Iterate faster. Security by design."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="landing-page">
        <LandingNavbar />
        <Hero />
        <Manifesto />
        <LandingFooter />
      </div>
    </>
  );
}
