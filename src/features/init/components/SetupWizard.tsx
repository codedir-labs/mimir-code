/**
 * Setup wizard component
 * Orchestrates first-run setup flow: security warning → theme selection
 */

import React, { useState } from 'react';
import { Box } from 'ink';
import { WizardLayout } from '@/shared/ui/WizardLayout.js';
import { SecurityWarning } from '@/shared/ui/SecurityWarning.js';
import { ThemeSelector } from '@/shared/ui/ThemeSelector.js';
import { Theme, KeyBindingsConfig } from '@/shared/config/schemas.js';

export interface SetupWizardProps {
  onComplete: (theme: Theme) => void | Promise<void>;
  onCancel: () => void;
  keyBindings: KeyBindingsConfig;
}

type WizardStep = 'security' | 'theme';

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, onCancel, keyBindings }) => {
  const [step, setStep] = useState<WizardStep>('security');

  const handleSecurityAccept = () => {
    setStep('theme');
  };

  const handleThemeSelect = (theme: Theme) => {
    void onComplete(theme);
  };

  return (
    <Box flexDirection="column">
      {step === 'security' && (
        <WizardLayout title="Welcome to Mimir Code">
          <SecurityWarning
            onAccept={handleSecurityAccept}
            onCancel={onCancel}
            keyBindings={keyBindings}
          />
        </WizardLayout>
      )}
      {step === 'theme' && (
        <WizardLayout title="">
          <ThemeSelector
            onSelect={handleThemeSelect}
            onCancel={onCancel}
            keyBindings={keyBindings}
          />
        </WizardLayout>
      )}
    </Box>
  );
};
