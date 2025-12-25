/**
 * Setup wizard component
 * Orchestrates first-run setup flow: security warning → theme selection
 */

import React, { useState } from 'react';
import { Box } from 'ink';
import { WizardLayout } from './WizardLayout.js';
import { SecurityWarning } from './SecurityWarning.js';
import { ThemeSelector } from './ThemeSelector.js';
import { Theme, KeyBindingsConfig } from '../../config/schemas.js';

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
    onComplete(theme);
  };

  return (
    <Box flexDirection="column">
      {step === 'security' && (
        <WizardLayout title="Welcome to Mimir">
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
