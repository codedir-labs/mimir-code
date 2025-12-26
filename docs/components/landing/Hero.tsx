import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { PROJECT_NAME, INSTALL_COMMANDS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { LinuxIcon, AppleIcon } from '@/components/InstallTabs';

interface TerminalLineProps {
  command: string;
  prompt?: string;
  comment?: string;
}

function TerminalLine({ command, prompt = '$', comment }: TerminalLineProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLineClick = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
        'hover:bg-muted/50'
      )}
      onClick={handleLineClick}
    >
      <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm select-none">
        <span>{prompt}</span>
      </div>
      <code className="flex-1 font-mono text-sm text-foreground select-all">
        {command}
        {comment && <span className="text-muted-foreground ml-2">{comment}</span>}
      </code>
      <button
        onClick={handleCopy}
        className={cn(
          'p-1.5 rounded text-muted-foreground hover:text-foreground transition-all',
          'opacity-0 group-hover:opacity-100'
        )}
        aria-label="Copy to clipboard"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function TerminalWindow({ children, platform = 'unix' }: { children: React.ReactNode; platform?: 'unix' | 'windows' }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden font-mono text-sm terminal-shadow">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 min-h-[40px]">
        {platform === 'windows' ? (
          <div className="flex items-center gap-2 h-3">
            <div className="text-xs text-muted-foreground font-sans leading-none">PowerShell</div>
          </div>
        ) : (
          <div className="flex gap-1.5 h-3">
            <div className="w-3 h-3 rounded-full bg-destructive/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
        )}
      </div>
      {/* Terminal content */}
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

// Icon components
function NpmIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}


export function Hero() {
  const [activeTab, setActiveTab] = useState<'unix' | 'windows' | 'npm'>('npm');

  return (
    <section className="relative min-h-[calc(100vh-60px)] flex items-center justify-center overflow-hidden bg-background">
      {/* Minimal dot pattern background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--muted))_1px,transparent_1px)] bg-[size:24px_24px] opacity-40 dark:opacity-20" />

      <div className="relative w-full max-w-5xl mx-auto px-4 py-20 sm:px-6 lg:px-8">
        {/* Title */}
        <div className="text-center mb-16">
          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter mb-6 text-foreground">
            {PROJECT_NAME}
          </h1>
          <p className="text-xl sm:text-2xl text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
            Open source, model agnostic CLI tool for agentic work
          </p>
        </div>

        {/* Installation Section */}
        <div className="w-full max-w-3xl mx-auto">
          <div className="relative border-b-2 border-border">
            {/* Tabs and WIP badge on same row */}
            <div className="flex items-center justify-between">
              {/* Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('npm')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 border-b-2 transition-colors select-none outline-none',
                    'hover:bg-muted/50 hover:text-foreground',
                    activeTab === 'npm'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground'
                  )}
                >
                  <NpmIcon />
                </button>
                <button
                  onClick={() => setActiveTab('unix')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 border-b-2 transition-colors select-none outline-none',
                    'hover:bg-muted/50 hover:text-foreground',
                    activeTab === 'unix'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground'
                  )}
                >
                  <LinuxIcon />
                  <AppleIcon />
                </button>
                <button
                  onClick={() => setActiveTab('windows')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 border-b-2 transition-colors select-none outline-none',
                    'hover:bg-muted/50 hover:text-foreground',
                    activeTab === 'windows'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground'
                  )}
                >
                  <WindowsIcon />
                </button>
              </div>

              {/* WIP Badge on the right */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted/50 text-muted-foreground text-xs font-medium tracking-wide mb-[-2px]">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span>Work in Progress</span>
              </div>
            </div>
          </div>

          {/* Terminal content */}
          <div className="py-6">
            {activeTab === 'npm' && (
              <TerminalWindow platform="unix">
                <TerminalLine command={INSTALL_COMMANDS.npm} />
                <TerminalLine command="mimir" comment="# start building" />
              </TerminalWindow>
            )}

            {activeTab === 'unix' && (
              <TerminalWindow platform="unix">
                <TerminalLine command={INSTALL_COMMANDS.unix} />
                <TerminalLine command="mimir" comment="# start building" />
              </TerminalWindow>
            )}

            {activeTab === 'windows' && (
              <TerminalWindow platform="windows">
                <TerminalLine command={INSTALL_COMMANDS.windows} prompt="PS>" />
                <TerminalLine command="mimir" prompt="PS>" comment="# start building" />
              </TerminalWindow>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
