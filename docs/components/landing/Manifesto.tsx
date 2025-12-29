import React from 'react';
import { Shield, Zap, Wrench, FileSearch, Users } from 'lucide-react';

interface PrincipleProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  align?: 'left' | 'right';
}

function Principle({ icon, title, description, align = 'left' }: PrincipleProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
      {/* Content */}
      <div className={`flex flex-col gap-4 ${align === 'right' ? 'lg:order-2' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
          <h3 className="text-2xl font-bold text-foreground">{title}</h3>
        </div>
        <p className="text-lg text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {/* Placeholder for feature showcase */}
      <div className={`flex items-center justify-center min-h-[200px] rounded-lg border-2 border-dashed border-border/50 bg-muted/20 ${align === 'right' ? 'lg:order-1' : ''}`}>
        <span className="text-sm text-muted-foreground/50">Feature showcase</span>
      </div>
    </div>
  );
}

export function Manifesto() {
  const principles = [
    {
      icon: <Shield className="h-6 w-6" />,
      title: 'Yours to control',
      description:
        'You choose the model. Bring your own keys, use defaults, or enforce org-wide policies. Block vendors, set budgets, own your data. No lock-in, no surprises.',
      align: 'left' as const,
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: 'Fast where you need it, isolated where you don\'t',
      description:
        'Native execution for rapid iteration. Docker sandboxing when running untrusted code. You decide the risk tolerance—not the tool.',
      align: 'right' as const,
    },
    {
      icon: <Wrench className="h-6 w-6" />,
      title: 'Built for your workflow',
      description:
        'Custom tools, slash commands, hooks, plugins, MCP servers. Configure your theme, keybinds, and shortcuts. Mimir adapts to you, not the other way around.',
      align: 'left' as const,
    },
    {
      icon: <FileSearch className="h-6 w-6" />,
      title: 'Transparent and auditable',
      description:
        'Every action assessed. Permission system with risk levels. Audit trails for compliance. You approve, review, and understand what\'s happening.',
      align: 'right' as const,
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: 'Individual-first, enterprise-ready',
      description:
        'Powerful for solo developers. Enforceable policies for teams. Centralized config, quotas, and guardrails when you scale. Start simple, grow secure.',
      align: 'left' as const,
    },
  ];

  return (
    <section className="relative py-24 px-4 bg-muted/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-foreground">
            We believe AI coding agents should be...
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Principles that guide everything we build
          </p>
        </div>

        <div className="space-y-24">
          {principles.map((principle, index) => (
            <Principle key={index} {...principle} />
          ))}
        </div>
      </div>
    </section>
  );
}
