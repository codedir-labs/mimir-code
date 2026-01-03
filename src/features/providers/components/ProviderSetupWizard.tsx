/**
 * Provider Setup Wizard - Interactive multi-provider configuration
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';
import type { StorageLocationType } from '@/shared/utils/CredentialsManager.js';
import { MultiSelectInput } from './MultiSelectInput.js';

/**
 * Provider option for selection
 */
export interface ProviderOption {
  label: string;
  value: string;
  description: string;
  enabled: boolean;
}

/**
 * Provider configuration result
 */
export interface ProviderConfigResult {
  provider: string;
  apiKey: string;
  storage: StorageLocationType;
  testSuccess: boolean;
}

/**
 * Wizard step
 */
type WizardStep =
  | 'welcome'
  | 'provider-selection'
  | 'provider-config'
  | 'storage-selection'
  | 'connection-test'
  | 'summary';

/**
 * Props
 */
export interface ProviderSetupWizardProps {
  readonly theme: Theme;
  readonly availableProviders: ProviderOption[];
  readonly onComplete: (results: ProviderConfigResult[]) => void;
  readonly onCancel: () => void;
  readonly testConnection?: (provider: string, apiKey: string) => Promise<boolean>;
  readonly preselectedProvider?: string; // Skip provider selection if specified
}

/**
 * Provider Setup Wizard component
 */
export const ProviderSetupWizard: React.FC<ProviderSetupWizardProps> = ({
  theme,
  availableProviders,
  onComplete,
  onCancel,
  testConnection,
  preselectedProvider,
}) => {
  const [step, setStep] = useState<WizardStep>(preselectedProvider ? 'provider-config' : 'welcome');
  const [selectedProviders, setSelectedProviders] = useState<string[]>(
    preselectedProvider ? [preselectedProvider] : []
  );
  const [currentProviderIndex, setCurrentProviderIndex] = useState(0);
  const [currentApiKey, setCurrentApiKey] = useState('');
  const [currentStorage, setCurrentStorage] = useState<StorageLocationType>('keychain');
  const [configuredProviders, setConfiguredProviders] = useState<ProviderConfigResult[]>([]);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Get theme colors
  const themeDefinition = React.useMemo(() => getTheme(theme), [theme]);
  const primaryColor = themeDefinition.rawColors.borderColor || '#88c0d0';
  const errorColorFn = themeDefinition.colors.error;
  const successColorFn = themeDefinition.colors.success;
  const infoColorFn = themeDefinition.colors.info;

  // Handle ESC key globally
  useInput((_input, key) => {
    if (key.escape) {
      handleBack();
    }
  });

  /**
   * Handle welcome step
   */
  const handleWelcome = () => {
    setStep('provider-selection');
  };

  /**
   * Handle going back
   */
  const handleBack = () => {
    switch (step) {
      case 'provider-selection':
        setStep('welcome');
        break;
      case 'provider-config':
        if (preselectedProvider) {
          onCancel(); // Can't go back if pre-selected
        } else {
          setStep('provider-selection');
          setCurrentApiKey('');
          setTestError(null);
        }
        break;
      case 'storage-selection':
        setStep('provider-config');
        break;
      case 'connection-test':
        if (!testingConnection) {
          setStep('storage-selection');
        }
        break;
      case 'summary':
        // Can't go back from summary
        break;
      default:
        onCancel();
    }
  };

  /**
   * Handle provider selection
   */
  const handleProviderSelection = (selectedItems: string[]) => {
    if (selectedItems.length === 0) {
      onCancel();
      return;
    }

    setSelectedProviders(selectedItems);
    setCurrentProviderIndex(0);
    setStep('provider-config');
  };

  /**
   * Handle API key input
   */
  const handleApiKeySubmit = async () => {
    if (!currentApiKey || currentApiKey.length < 10) {
      setTestError('Please enter a valid API key');
      return;
    }

    setStep('storage-selection');
  };

  /**
   * Handle storage selection
   */
  const handleStorageSelection = (storage: StorageLocationType) => {
    setCurrentStorage(storage);
    setStep('connection-test');

    // Auto-test connection
    testCurrentConnection();
  };

  /**
   * Test current provider connection
   */
  const testCurrentConnection = async () => {
    if (!testConnection) {
      // Skip test if not provided
      handleTestSuccess();
      return;
    }

    setTestingConnection(true);
    setTestError(null);

    try {
      const provider = selectedProviders[currentProviderIndex] ?? '';
      const success = await testConnection(provider, currentApiKey);

      if (success) {
        handleTestSuccess();
      } else {
        setTestError('Connection test failed. Please check your API key.');
        setTestingConnection(false);
      }
    } catch (error) {
      setTestError((error as Error).message || 'Connection test failed');
      setTestingConnection(false);
    }
  };

  /**
   * Handle successful test
   */
  const handleTestSuccess = () => {
    const provider = selectedProviders[currentProviderIndex] ?? '';

    // Save configuration
    const config: ProviderConfigResult = {
      provider,
      apiKey: currentApiKey,
      storage: currentStorage,
      testSuccess: true,
    };

    setConfiguredProviders([...configuredProviders, config]);
    setTestingConnection(false);

    // Move to next provider or summary
    if (currentProviderIndex < selectedProviders.length - 1) {
      setCurrentProviderIndex(currentProviderIndex + 1);
      setCurrentApiKey('');
      setTestError(null);
      setStep('provider-config');
    } else {
      setStep('summary');
    }
  };

  /**
   * Handle retry after failed test
   */
  const handleRetry = () => {
    setTestError(null);
    setStep('provider-config');
  };

  /**
   * Handle final completion
   */
  const handleFinish = () => {
    onComplete(configuredProviders);
  };

  /**
   * Render welcome step
   */
  const renderWelcome = () => (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>{infoColorFn('🔑 Provider Setup Wizard')}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Welcome! Let's configure your LLM providers.</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          You're in Local Mode (no Teams account).
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          API keys will be stored on this machine only.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter to continue, Esc to cancel</Text>
      </Box>
    </Box>
  );

  /**
   * Render provider selection step
   */
  const renderProviderSelection = () => {
    const items = availableProviders.map((p) => ({
      label: p.label,
      value: p.value,
      description: p.description,
      disabled: !p.enabled,
    }));

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>{infoColorFn('Select Providers')}</Text>
        </Box>

        <Box marginBottom={1}>
          <Text>Choose which LLM providers you want to use:</Text>
        </Box>

        <Box marginTop={1}>
          <MultiSelectInput
            items={items}
            onSubmit={handleProviderSelection}
            initialSelected={selectedProviders}
          />
        </Box>

        <Box marginTop={1}>
          <Text dimColor>↑↓ Navigate  Space Toggle  Enter Submit  Esc Back</Text>
        </Box>
      </Box>
    );
  };

  /**
   * Render provider configuration step
   */
  const renderProviderConfig = () => {
    const provider = selectedProviders[currentProviderIndex];
    const providerLabel = availableProviders.find((p) => p.value === provider)?.label || provider;

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>
            {infoColorFn(
              `Configure ${providerLabel} (${currentProviderIndex + 1} of ${selectedProviders.length})`
            )}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text>Enter your {providerLabel} API key:</Text>
        </Box>

        <Box marginBottom={1}>
          <Text dimColor>Key: </Text>
          <TextInput
            value={currentApiKey}
            onChange={setCurrentApiKey}
            onSubmit={handleApiKeySubmit}
            mask="*"
            placeholder="sk-..."
          />
        </Box>

        {testError && (
          <Box marginBottom={1}>
            <Text>{errorColorFn(`✗ ${testError}`)}</Text>
          </Box>
        )}

        <Box marginBottom={1}>
          <Text dimColor>Don't have an API key?</Text>
        </Box>

        <Box marginBottom={1}>
          <Text dimColor>Get one at: {getProviderSignupURL(provider ?? '')}</Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Enter Submit  Esc Back</Text>
        </Box>
      </Box>
    );
  };

  /**
   * Render storage selection step
   */
  const renderStorageSelection = () => {
    const items = [
      {
        label: 'OS Keychain (Recommended)',
        value: 'keychain',
        description: 'Secure, encrypted, managed by your OS',
      },
      {
        label: 'Encrypted File',
        value: 'file',
        description: 'Stored in ~/.mimir/credentials.enc',
      },
      {
        label: 'Environment Variable',
        value: 'env',
        description: 'Manual setup in .env or shell',
      },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>{infoColorFn('Storage Location')}</Text>
        </Box>

        <Box marginBottom={1}>
          <Text>Where should we store this API key?</Text>
        </Box>

        <Box>
          <SelectInput
            items={items.map((item) => ({
              label: `${item.label}\n  ${item.description}`,
              value: item.value,
            }))}
            onSelect={(item) => handleStorageSelection(item.value as StorageLocationType)}
          />
        </Box>

        <Box marginTop={1}>
          <Text dimColor>↑↓ Navigate  Enter Select  Esc Back</Text>
        </Box>
      </Box>
    );
  };

  /**
   * Render connection test step
   */
  const renderConnectionTest = () => {
    const provider = selectedProviders[currentProviderIndex];
    const providerLabel = availableProviders.find((p) => p.value === provider)?.label || provider;

    const renderTestContent = () => {
      if (testingConnection) {
        return (
          <Box>
            <Text>
              <Spinner type="dots" /> {infoColorFn('Connecting...')}
            </Text>
          </Box>
        );
      }

      if (testError) {
        return (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text>{errorColorFn(`✗ Connection failed: ${testError}`)}</Text>
            </Box>
            <Box>
              <Text dimColor>Press Enter to retry, Esc to skip</Text>
            </Box>
          </Box>
        );
      }

      return (
        <Box marginBottom={1}>
          <Text>{successColorFn('✓ Connection successful!')}</Text>
        </Box>
      );
    };

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>{infoColorFn('Testing Connection')}</Text>
        </Box>

        <Box marginBottom={1}>
          <Text>Testing {providerLabel} API key...</Text>
        </Box>

        {renderTestContent()}
      </Box>
    );
  };

  /**
   * Render summary step
   */
  const renderSummary = () => (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>{successColorFn('🎉 Setup Complete!')}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Configured providers:</Text>
      </Box>

      {configuredProviders.map((config) => {
        const providerLabel =
          availableProviders.find((p) => p.value === config.provider)?.label || config.provider;

        return (
          <Box key={config.provider} marginBottom={1} flexDirection="column">
            <Box>
              <Text>{successColorFn('✓ ')}</Text>
              <Text bold>{providerLabel}</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text dimColor>Storage: {config.storage}</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text dimColor>Status: Ready</Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1} marginBottom={1}>
        <Text>
          Active provider: <Text bold>{configuredProviders[0]?.provider || 'None'}</Text>
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>You can now:</Text>
      </Box>

      <Box paddingLeft={2} flexDirection="column">
        <Text dimColor>• Start chatting: mimir</Text>
        <Text dimColor>• Switch providers: /model</Text>
        <Text dimColor>• Reconfigure: mimir connect</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter to finish</Text>
      </Box>
    </Box>
  );

  /**
   * Render current step
   */
  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return renderWelcome();
      case 'provider-selection':
        return renderProviderSelection();
      case 'provider-config':
        return renderProviderConfig();
      case 'storage-selection':
        return renderStorageSelection();
      case 'connection-test':
        return renderConnectionTest();
      case 'summary':
        return renderSummary();
      default:
        return null;
    }
  };

  /**
   * Handle keyboard input
   */
  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    } else if (key.return && step === 'welcome') {
      handleWelcome();
    } else if (key.return && step === 'summary') {
      handleFinish();
    } else if (key.return && step === 'connection-test' && testError) {
      handleRetry();
    }
  }, { isActive: true });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={primaryColor} padding={1}>
      {renderStep()}
    </Box>
  );
};

/**
 * Get provider signup URL
 */
function getProviderSignupURL(provider: string): string {
  const urls: Record<string, string> = {
    deepseek: 'https://platform.deepseek.com',
    anthropic: 'https://console.anthropic.com',
    openai: 'https://platform.openai.com',
    google: 'https://makersuite.google.com',
  };

  return urls[provider] || 'https://example.com';
}
