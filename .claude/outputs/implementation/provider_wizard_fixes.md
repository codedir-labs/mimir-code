# Provider Wizard UX Fixes

**Date:** 2025-12-29
**Status:** ✅ Complete - Needs Testing

## Issues Fixed

### 1. Quick Setup Skips Wizard ✅

**Problem:** When running `mimir connect anthropic`, it still showed the full wizard with provider selection.

**Expected:** Skip provider selection and go directly to API key entry.

**Fix:**
- Added `preselectedProvider` prop to `ProviderSetupWizard`
- Skip 'welcome' and 'provider-selection' steps when provider is pre-selected
- Start directly at 'provider-config' step

**Files Changed:**
- `src/features/providers/components/ProviderSetupWizard.tsx:54` - Added prop
- `src/features/providers/components/ProviderSetupWizard.tsx:68-71` - Initial state
- `src/features/providers/commands/ConnectCommand.ts:127` - Pass to wizard
- `src/features/providers/commands/ConnectCommand.ts:241` - Quick setup

**Usage:**
```bash
# Before: Showed full wizard with provider selection
# After: Goes directly to API key entry for Anthropic
mimir connect anthropic
```

### 2. ESC Key Navigation ✅

**Problem:** Pressing ESC didn't allow going back in the wizard.

**Expected:** ESC key should navigate back to previous step.

**Fix:**
- Added `handleBack()` function to navigate backwards
- Added global `useInput` hook to handle ESC key
- Implemented step-by-step back navigation:
  - provider-selection → welcome
  - provider-config → provider-selection (or cancel if pre-selected)
  - storage-selection → provider-config
  - connection-test → storage-selection (if not testing)
  - summary → cannot go back

**Files Changed:**
- `src/features/providers/components/ProviderSetupWizard.tsx:93-124` - handleBack()
- `src/features/providers/components/ProviderSetupWizard.tsx:86-91` - ESC handler
- `src/features/providers/components/MultiSelectInput.tsx:24,63-65` - ESC in multi-select

**Usage:**
```bash
# Navigate through wizard, press ESC to go back at any step
mimir connect

# Press ESC during provider selection → returns to welcome
# Press ESC during API key entry → returns to provider selection
# Press ESC during quick setup → exits wizard
```

### 3. Multi-Select for Providers ✅

**Problem:** Could only select one provider at a time.

**Expected:** Use Space to toggle multiple providers, then Enter to submit.

**Fix:**
- Replaced `SelectInput` with existing `MultiSelectInput` component
- Added proper keyboard instructions
- Space toggles selection
- Enter submits selected providers
- Shows checkboxes for selected items

**Files Changed:**
- `src/features/providers/components/ProviderSetupWizard.tsx:13` - Import MultiSelectInput
- `src/features/providers/components/ProviderSetupWizard.tsx:277-308` - Replace SelectInput

**Usage:**
```bash
mimir connect

# Provider selection screen:
# ↑↓ Navigate between providers
# Space - Toggle selection (can select multiple)
# Enter - Submit selected providers
# ESC - Go back

# Example:
> [✓] Anthropic - High-quality reasoning and coding (Claude)
  [ ] OpenAI - Popular GPT models
  [✓] DeepSeek - Fast and affordable
  [ ] Google - Gemini frontier models
```

## New User Experience

### Quick Setup (Single Provider)
```bash
$ mimir connect anthropic

🔑 Configure Anthropic (1 of 1)

Enter your Anthropic API key:
Key: ********************

Choose storage location:
> Keychain (Recommended)
  Encrypted file
  Environment variable

Testing connection... ✓

✓ Setup complete!

Configured 1 provider:
  • anthropic (keychain)

You can now start chatting: mimir
```

### Full Wizard (Multiple Providers)
```bash
$ mimir connect

🔑 Provider Setup Wizard

Welcome! Let's configure your LLM providers.

You're in Local Mode (no Teams account).
API keys will be stored on this machine only.

Press Enter to continue, Esc to cancel

---

Select Providers

Choose which LLM providers you want to use:

> [✓] Anthropic - High-quality reasoning and coding (Claude)
  [✓] OpenAI - Popular GPT models
  [ ] DeepSeek - Fast and affordable
  [ ] Google - Gemini frontier models

↑↓ Navigate  Space Toggle  Enter Submit  Esc Back

---

Configure Anthropic (1 of 2)

Enter your Anthropic API key:
Key: ********************

(Press ESC to go back to provider selection)

---

Choose storage location:
> Keychain (Recommended)
  Encrypted file
  Environment variable

(Press ESC to re-enter API key)

---

Testing connection... ✓
Connected successfully!

---

Configure OpenAI (2 of 2)

Enter your OpenAI API key:
Key: ********************

---

Summary

✓ Setup complete!

Configured 2 providers:
  • anthropic (keychain)
  • openai (keychain)

You can now start chatting: mimir

Press Enter to finish
```

## Implementation Details

### Component Architecture

**ProviderSetupWizard**
- Main wizard orchestrator
- Manages wizard steps
- Handles keyboard navigation
- Supports pre-selected provider mode

**MultiSelectInput**
- Reusable multi-select component
- Space to toggle, Enter to submit
- ESC to cancel
- Checkbox visual indicators

**ConnectCommand**
- `listProviders()` - Show configured providers
- `quickSetup(provider)` - Single provider setup
- `runWizard()` - Full wizard flow
- `removeProvider(provider)` - Remove configuration

### State Management

```typescript
// Wizard state
const [step, setStep] = useState<WizardStep>(
  preselectedProvider ? 'provider-config' : 'welcome'
);
const [selectedProviders, setSelectedProviders] = useState<string[]>(
  preselectedProvider ? [preselectedProvider] : []
);
const [currentProviderIndex, setCurrentProviderIndex] = useState(0);
const [currentApiKey, setCurrentApiKey] = useState('');
const [currentStorage, setCurrentStorage] = useState<StorageLocationType>('keychain');
const [configuredProviders, setConfiguredProviders] = useState<ProviderConfigResult[]>([]);
```

### Navigation Flow

```
Normal Mode (no provider specified):
welcome → provider-selection → provider-config → storage-selection → connection-test → [next provider or summary]

Quick Setup Mode (provider specified):
provider-config → storage-selection → connection-test → summary

Back Navigation (ESC):
provider-selection ← welcome
provider-config ← provider-selection
storage-selection ← provider-config
connection-test ← storage-selection
```

## Testing Checklist

- [ ] `mimir connect` - Full wizard works
- [ ] `mimir connect anthropic` - Quick setup skips provider selection
- [ ] ESC from provider selection goes to welcome
- [ ] ESC from API key entry goes back to provider selection
- [ ] ESC during quick setup exits wizard
- [ ] Space toggles provider selection (checkbox appears)
- [ ] Can select multiple providers
- [ ] Enter submits selected providers
- [ ] All providers can be configured in sequence
- [ ] Storage selection step works
- [ ] Connection test shows spinner
- [ ] Summary shows all configured providers
- [ ] Keyboard shortcuts display correctly

## Known Limitations

1. **Cannot go back after connection test starts**
   - Prevents race conditions
   - User must wait or cancel

2. **Cannot go back from summary**
   - Final step, no previous state to restore

3. **Pre-selected mode cannot change provider**
   - If user wants different provider, must cancel and restart

## Future Enhancements

### Recommended Next Steps
- [ ] Add provider logo/icons (if terminal supports)
- [ ] Show real-time connection status
- [ ] Provider-specific setup instructions
- [ ] Link to provider signup pages
- [ ] Estimate connection time
- [ ] Save partial progress (resume later)
- [ ] OAuth support (see oauth_integration_design.md)

### Nice to Have
- [ ] Fuzzy search for providers
- [ ] Filter by category (popular, cloud, open-source)
- [ ] Model selection during setup
- [ ] Test with specific model
- [ ] Cost estimates per provider
- [ ] Usage quota warnings

## Files Modified

```
src/features/providers/components/ProviderSetupWizard.tsx
  - Added preselectedProvider prop
  - Added handleBack() navigation
  - Added global ESC handler
  - Replaced SelectInput with MultiSelectInput
  - Updated keyboard help text

src/features/providers/components/MultiSelectInput.tsx
  - Added onCancel prop
  - Added ESC key handling

src/features/providers/commands/ConnectCommand.ts
  - Updated quickSetup() to pass preselectedProvider
  - Updated runWizard() to accept preselectedProvider
```

## Build Instructions

```bash
# Build all packages
yarn build

# Or individually:
cd packages/mimir-agents && yarn build
cd ../mimir-agents-runtime && yarn build
cd ../.. && yarn build

# Test the changes
mimir connect
mimir connect anthropic
mimir providers --list
```

## Migration Notes

**Breaking Changes:** None
**Backwards Compatible:** Yes
**Config Changes:** None

Existing users with configured providers will see no difference. New users get improved UX.

## References

- Issue: User reported wizard always shows provider selection
- Issue: ESC key doesn't work to go back
- Issue: Cannot select multiple providers
- Design: `.claude/best-practices/ui_development.md`
- Related: `.claude/outputs/implementation/oauth_integration_design.md`
