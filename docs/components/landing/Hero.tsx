import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { INSTALL_COMMANDS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { LinuxIcon, AppleIcon, NpmIcon as NpmIconComponent, WindowsIcon as WindowsIconComponent } from '@/components/InstallTabs';
import { GameOfLifeBackground } from './GameOfLifeBackground';
import { Logo } from '@/components/Logo';

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
        'group relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors pointer-events-auto',
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



export function Hero() {
  const [activeTab, setActiveTab] = useState<'unix' | 'windows' | 'npm'>('npm');

  return (
    <section className="relative min-h-[calc(100vh-60px)] flex items-center justify-center overflow-hidden bg-background">
      {/* Game of Life background */}
      <GameOfLifeBackground />

      <div className="relative w-full max-w-5xl mx-auto px-4 py-20 sm:px-6 lg:px-8 pointer-events-none">
        {/* Title */}
        <div className="text-center mb-16 pointer-events-none">
          <h1 className="mb-6 pointer-events-none flex justify-center">
            <Logo size="hero" />
          </h1>
          <p className="text-xl sm:text-2xl text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed pointer-events-none">
            Iterate faster. Security by design.
          </p>
        </div>

        {/* Installation Section */}
        <div className="w-full max-w-3xl mx-auto relative pointer-events-none">
          {/* Blur background - positioned behind but not affecting content */}
          <div
            className="absolute -inset-8 bg-background/80 rounded-3xl pointer-events-none"
            style={{
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
              zIndex: 0
            }}
          />

          <div className="relative border-b-2 border-border z-10 pointer-events-auto">
            {/* Tabs and WIP badge on same row */}
            <div className="flex items-center justify-between">
              {/* Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('npm')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 border-b-2 transition-colors select-none outline-none pointer-events-auto',
                    'hover:bg-muted/50 hover:text-foreground',
                    activeTab === 'npm'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground'
                  )}
                >
                  <NpmIconComponent className="h-8 w-8" />
                </button>
                <button
                  onClick={() => setActiveTab('unix')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 border-b-2 transition-colors select-none outline-none pointer-events-auto',
                    'hover:bg-muted/50 hover:text-foreground',
                    activeTab === 'unix'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground'
                  )}
                >
                  <LinuxIcon className="h-5 w-5" />
                  <AppleIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setActiveTab('windows')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 border-b-2 transition-colors select-none outline-none pointer-events-auto',
                    'hover:bg-muted/50 hover:text-foreground',
                    activeTab === 'windows'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground'
                  )}
                >
                  <WindowsIconComponent className="h-5 w-5" />
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
          <div className="relative py-6 z-10 pointer-events-auto">
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
