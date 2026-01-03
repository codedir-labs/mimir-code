/**
 * Provider Setup Wizard - Interactive multi-provider configuration
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';
import type { StorageLocationType } from '@/shared/utils/CredentialsManager.js';
import { MultiSelectInput } from './MultiSelectInput.js';

/** Get provider signup URL */
function getProviderSignupURL(provider: string): string {
  const urls: Record<string, string> = {
    deepseek: 'https://platform.deepseek.com',
    anthropic: 'https://console.anthropic.com',
    openai: 'https://platform.openai.com',
    google: 'https://makersuite.google.com',
  };
  return urls[provider] || 'https://example.com';
}

/** Welcome step component */
const WelcomeStep: React.FC<{ infoColorFn: (s: string) => string }> = ({ infoColorFn }) => (
  <Box flexDirection="column" padding={1}>
    <Box marginBottom={1}><Text bold>{infoColorFn('Provider Setup Wizard')}</Text></Box>
    <Box marginBottom={1}><Text>Welcome! Let's configure your LLM providers.</Text></Box>
    <Box marginBottom={1}><Text dimColor>You're in Local Mode (no Teams account).</Text></Box>
    <Box marginBottom={1}><Text dimColor>API keys will be stored on this machine only.</Text></Box>
    <Box marginTop={1}><Text dimColor>Press Enter to continue, Esc to cancel</Text></Box>
  </Box>
);

/** Provider selection step component */
const ProviderSelectionStep: React.FC<{
  infoColorFn: (s: string) => string;
  providers: ProviderOption[];
  selectedProviders: string[];
  onSubmit: (selected: string[]) => void;
}> = ({ infoColorFn, providers, selectedProviders, onSubmit }) => {
  const items = providers.map((p) => ({
    label: p.label, value: p.value, description: p.description, disabled: !p.enabled,
  }));
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold>{infoColorFn('Select Providers')}</Text></Box>
      <Box marginBottom={1}><Text>Choose which LLM providers you want to use:</Text></Box>
      <Box marginTop={1}>
        <MultiSelectInput items={items} onSubmit={onSubmit} initialSelected={selectedProviders} />
      </Box>
      <Box marginTop={1}><Text dimColor>Navigate Space Toggle Enter Submit Esc Back</Text></Box>
    </Box>
  );
};

/** Storage selection step component */
const StorageSelectionStep: React.FC<{
  infoColorFn: (s: string) => string;
  onSelect: (storage: StorageLocationType) => void;
}> = ({ infoColorFn, onSelect }) => {
  const items = [
    { label: 'OS Keychain (Recommended)', value: 'keychain', description: 'Secure, encrypted, managed by your OS' },
    { label: 'Encrypted File', value: 'file', description: 'Stored in ~/.mimir/credentials.enc' },
    { label: 'Environment Variable', value: 'env', description: 'Manual setup in .env or shell' },
  ];
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold>{infoColorFn('Storage Location')}</Text></Box>
      <Box marginBottom={1}><Text>Where should we store this API key?</Text></Box>
      <Box>
        <SelectInput
          items={items.map((item) => ({ label: `${item.label}\n  ${item.description}`, value: item.value }))}
          onSelect={(item) => onSelect(item.value as StorageLocationType)}
        />
      </Box>
      <Box marginTop={1}><Text dimColor>Navigate Enter Select Esc Back</Text></Box>
    </Box>
  );
};

/** Connection test step component */
const ConnectionTestStep: React.FC<{
  infoColorFn: (s: string) => string;
  errorColorFn: (s: string) => string;
  successColorFn: (s: string) => string;
  providerLabel: string;
  testing: boolean;
  error: string | null;
}> = ({ infoColorFn, errorColorFn, successColorFn, providerLabel, testing, error }) => (
  <Box flexDirection="column" padding={1}>
    <Box marginBottom={1}><Text bold>{infoColorFn('Testing Connection')}</Text></Box>
    <Box marginBottom={1}><Text>Testing {providerLabel} API key...</Text></Box>
    {testing && <Box><Text><Spinner type="dots" /> {infoColorFn('Connecting...')}</Text></Box>}
    {error && !testing && (
      <Box flexDirection="column">
        <Box marginBottom={1}><Text>{errorColorFn(`Connection failed: ${error}`)}</Text></Box>
        <Box><Text dimColor>Press Enter to retry, Esc to skip</Text></Box>
      </Box>
    )}
    {!testing && !error && <Box marginBottom={1}><Text>{successColorFn('Connection successful!')}</Text></Box>}
  </Box>
);

/** Summary step component */
const SummaryStep: React.FC<{
  successColorFn: (s: string) => string;
  configuredProviders: ProviderConfigResult[];
  availableProviders: ProviderOption[];
}> = ({ successColorFn, configuredProviders, availableProviders }) => (
  <Box flexDirection="column" padding={1}>
    <Box marginBottom={1}><Text bold>{successColorFn('Setup Complete!')}</Text></Box>
    <Box marginBottom={1}><Text>Configured providers:</Text></Box>
    {configuredProviders.map((config) => {
      const label = availableProviders.find((p) => p.value === config.provider)?.label || config.provider;
      return (
        <Box key={config.provider} marginBottom={1} flexDirection="column">
          <Box><Text>{successColorFn('* ')}</Text><Text bold>{label}</Text></Box>
          <Box paddingLeft={2}><Text dimColor>Storage: {config.storage}</Text></Box>
          <Box paddingLeft={2}><Text dimColor>Status: Ready</Text></Box>
        </Box>
      );
    })}
    <Box marginTop={1} marginBottom={1}>
      <Text>Active provider: <Text bold>{configuredProviders[0]?.provider || 'None'}</Text></Text>
    </Box>
    <Box marginBottom={1}><Text>You can now:</Text></Box>
    <Box paddingLeft={2} flexDirection="column">
      <Text dimColor>* Start chatting: mimir</Text>
      <Text dimColor>* Switch providers: /model</Text>
      <Text dimColor>* Reconfigure: mimir connect</Text>
    </Box>
    <Box marginTop={1}><Text dimColor>Press Enter to finish</Text></Box>
  </Box>
);

/** Provider config step component */
const ProviderConfigStep: React.FC<{
  infoColorFn: (s: string) => string;
  errorColorFn: (s: string) => string;
  providerLabel: string;
  currentIndex: number;
  totalCount: number;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onSubmit: () => void;
  error: string | null;
  provider: string;
}> = ({ infoColorFn, errorColorFn, providerLabel, currentIndex, totalCount, apiKey, onApiKeyChange, onSubmit, error, provider }) => (
  <Box flexDirection="column" padding={1}>
    <Box marginBottom={1}>
      <Text bold>{infoColorFn(`Configure ${providerLabel} (${currentIndex + 1} of ${totalCount})`)}</Text>
    </Box>
    <Box marginBottom={1}><Text>Enter your {providerLabel} API key:</Text></Box>
    <Box marginBottom={1}>
      <Text dimColor>Key: </Text>
      <TextInput value={apiKey} onChange={onApiKeyChange} onSubmit={onSubmit} mask="*" placeholder="sk-..." />
    </Box>
    {error && <Box marginBottom={1}><Text>{errorColorFn(`${error}`)}</Text></Box>}
    <Box marginBottom={1}><Text dimColor>Don't have an API key?</Text></Box>
    <Box marginBottom={1}><Text dimColor>Get one at: {getProviderSignupURL(provider)}</Text></Box>
    <Box marginTop={1}><Text dimColor>Enter Submit Esc Back</Text></Box>
  </Box>
);

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
  theme, availableProviders, onComplete, onCancel, testConnection, preselectedProvider,
}) => {
  const [step, setStep] = useState<WizardStep>(preselectedProvider ? 'provider-config' : 'welcome');
  const [selectedProviders, setSelectedProviders] = useState<string[]>(preselectedProvider ? [preselectedProvider] : []);
  const [currentProviderIndex, setCurrentProviderIndex] = useState(0);
  const [currentApiKey, setCurrentApiKey] = useState('');
  const [currentStorage, setCurrentStorage] = useState<StorageLocationType>('keychain');
  const [configuredProviders, setConfiguredProviders] = useState<ProviderConfigResult[]>([]);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const themeDefinition = React.useMemo(() => getTheme(theme), [theme]);
  const primaryColor = themeDefinition.rawColors.borderColor || '#88c0d0';
  const { error: errorColorFn, success: successColorFn, info: infoColorFn } = themeDefinition.colors;

  const handleTestSuccess = useCallback(() => {
    const provider = selectedProviders[currentProviderIndex] ?? '';
    const config: ProviderConfigResult = { provider, apiKey: currentApiKey, storage: currentStorage, testSuccess: true };
    setConfiguredProviders((prev) => [...prev, config]);
    setTestingConnection(false);
    if (currentProviderIndex < selectedProviders.length - 1) {
      setCurrentProviderIndex((i) => i + 1);
      setCurrentApiKey('');
      setTestError(null);
      setStep('provider-config');
    } else {
      setStep('summary');
    }
  }, [selectedProviders, currentProviderIndex, currentApiKey, currentStorage]);

  const testCurrentConnection = useCallback(async () => {
    if (!testConnection) { handleTestSuccess(); return; }
    setTestingConnection(true);
    setTestError(null);
    try {
      const provider = selectedProviders[currentProviderIndex] ?? '';
      const success = await testConnection(provider, currentApiKey);
      if (success) { handleTestSuccess(); }
      else { setTestError('Connection test failed. Please check your API key.'); setTestingConnection(false); }
    } catch (error) {
      setTestError((error as Error).message || 'Connection test failed');
      setTestingConnection(false);
    }
  }, [testConnection, selectedProviders, currentProviderIndex, currentApiKey, handleTestSuccess]);

  const handleBack = useCallback(() => {
    if (step === 'provider-selection') setStep('welcome');
    else if (step === 'provider-config') {
      if (preselectedProvider) onCancel();
      else { setStep('provider-selection'); setCurrentApiKey(''); setTestError(null); }
    } else if (step === 'storage-selection') setStep('provider-config');
    else if (step === 'connection-test' && !testingConnection) setStep('storage-selection');
    else if (step !== 'summary') onCancel();
  }, [step, preselectedProvider, onCancel, testingConnection]);

  useInput((_input, key) => { if (key.escape) handleBack(); });

  const handleProviderSelection = useCallback((items: string[]) => {
    if (items.length === 0) { onCancel(); return; }
    setSelectedProviders(items);
    setCurrentProviderIndex(0);
    setStep('provider-config');
  }, [onCancel]);

  const handleApiKeySubmit = useCallback(() => {
    if (!currentApiKey || currentApiKey.length < 10) { setTestError('Please enter a valid API key'); return; }
    setStep('storage-selection');
  }, [currentApiKey]);

  const handleStorageSelection = useCallback((storage: StorageLocationType) => {
    setCurrentStorage(storage);
    setStep('connection-test');
    void testCurrentConnection();
  }, [testCurrentConnection]);

  useInput((_input, key) => {
    if (key.escape) onCancel();
    else if (key.return && step === 'welcome') setStep('provider-selection');
    else if (key.return && step === 'summary') onComplete(configuredProviders);
    else if (key.return && step === 'connection-test' && testError) { setTestError(null); setStep('provider-config'); }
  }, { isActive: true });

  const provider = selectedProviders[currentProviderIndex] ?? '';
  const providerLabel = availableProviders.find((p) => p.value === provider)?.label || provider;

  const renderStep = () => {
    switch (step) {
      case 'welcome': return <WelcomeStep infoColorFn={infoColorFn} />;
      case 'provider-selection': return <ProviderSelectionStep infoColorFn={infoColorFn} providers={availableProviders} selectedProviders={selectedProviders} onSubmit={handleProviderSelection} />;
      case 'provider-config': return <ProviderConfigStep infoColorFn={infoColorFn} errorColorFn={errorColorFn} providerLabel={providerLabel} currentIndex={currentProviderIndex} totalCount={selectedProviders.length} apiKey={currentApiKey} onApiKeyChange={setCurrentApiKey} onSubmit={handleApiKeySubmit} error={testError} provider={provider} />;
      case 'storage-selection': return <StorageSelectionStep infoColorFn={infoColorFn} onSelect={handleStorageSelection} />;
      case 'connection-test': return <ConnectionTestStep infoColorFn={infoColorFn} errorColorFn={errorColorFn} successColorFn={successColorFn} providerLabel={providerLabel} testing={testingConnection} error={testError} />;
      case 'summary': return <SummaryStep successColorFn={successColorFn} configuredProviders={configuredProviders} availableProviders={availableProviders} />;
      default: return null;
    }
  };

  return <Box flexDirection="column" borderStyle="round" borderColor={primaryColor} padding={1}>{renderStep()}</Box>;
};
