# Keyboard Shortcuts

**CRITICAL**: All shortcuts MUST be configurable and dynamically loaded from config.

## Configuration Location

`.mimir/config.yml` under `keyBindings` section. See `docs/pages/configuration/keybinds.mdx` for full documentation.

## Default Shortcuts

- `Ctrl+C`, `Escape` - Interrupt
- `Shift+Tab` - Switch modes
- `Ctrl+E` - Edit instruction
- `Enter` - Accept/confirm
- `Ctrl+Space`, `Tab` - Autocomplete
- `ArrowUp`, `ArrowDown` - Navigate
- `?` - Help overlay
- `Ctrl+L` - Clear screen
- `Ctrl+Z` - Undo
- `Ctrl+Y` (Cmd+Shift+Z on Mac) - Redo

## Leader Key Support

Prefix mechanism to avoid terminal conflicts:

```yaml
keyBindings:
  leader: Ctrl+X
  leaderTimeout: 1000
  newSession: n         # Ctrl+X → n
  interrupt: [Ctrl+C, Escape]
```

## Disabling Shortcuts

Individual:
```yaml
keyBindings:
  help: none
```

Global:
```yaml
keyBindings:
  enabled: false
```

## Implementation Rules

### 1. NEVER Hardcode Shortcuts

❌ **BAD**:
```typescript
<Text>Press Enter to accept</Text>
const footer = '↑↓ navigate | Enter select | Esc cancel';
```

✅ **GOOD**:
```typescript
const footerText = buildFooterText([
  { shortcut: keyBindings.accept, label: 'select' }
]);
```

### 2. ALWAYS Use Centralized Keyboard System

- All handling through `KeyboardEventBus` and `useKeyboardAction`
- Action-based routing (`'accept'`, `'interrupt'`, `'navigateUp'`)
- Supports multiple keys per action

### 3. Pass Config to Components

```typescript
const footerText = useMemo(() => {
  const navigateKeys = `${keyBindings.navigateUp[0]}${keyBindings.navigateDown[0]}`;
  return ` ${navigateKeys} navigate `;
}, [keyBindings]);
```

### 4. Platform-Specific Handling

`KeyBindingsManager` auto-converts `Ctrl` to `Cmd` on macOS.
Use `KeyBindingsManager.toPlatformBinding()` for display.

### 5. ALWAYS Use formatKeyboardShortcut()

Import from `src/shared/utils/keyboardFormatter.js`:

```typescript
import { formatKeyboardShortcut, buildFooterText } from '../utils/keyboardFormatter.js';

formatKeyboardShortcut('ArrowUp');  // → '↑'
formatKeyboardShortcut('Enter');    // → '↵'
formatKeyboardShortcut(['Ctrl+C', 'Escape']);  // → 'Ctrl+C, ⎋'

buildFooterText([
  { shortcut: ['ArrowUp', 'ArrowDown'], label: 'navigate' },
  { shortcut: 'Enter', label: 'select' },
]);
// → '↑↓ navigate | ↵ select'
```

**Icon mappings**:
- Arrows: ↑ ↓ ← →
- Special: ↵ (Enter), ⎋ (Escape), ⇥ (Tab), ⌫ (Backspace), ⌦ (Delete)
- Modifiers: ⇧ (Shift), ⌃ (Ctrl), ⌥ (Alt), ⌘ (Cmd)

## Why This Matters

Users customize shortcuts. Hardcoded text breaks their experience.
