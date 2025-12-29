# UI Development (Ink Terminal)

**CRITICAL**: All UI development uses Ink (React for terminals) with strict theming.

## Color System

### NEVER Hardcode Colors

❌ **BAD**:
```typescript
<Text color="#ff0000">Error</Text>
<Text color="cyan">Info</Text>
```

✅ **GOOD**:
```typescript
import { getTheme } from '@/shared/config/themes';

const theme = getTheme(config.ui.theme);
<Text color={theme.colors.error}>Error</Text>
<Text color={theme.colors.info}>Info</Text>
```

### Theme Access

```typescript
const theme = getTheme(config.ui.theme);

// Standard colors
theme.colors.primary
theme.colors.error
theme.colors.success
theme.colors.warning
theme.colors.info

// Raw hex values (for chalk)
theme.rawColors.autocompleteBg
```

## Background Colors

Ink's `backgroundColor` prop is unreliable. Use chalk's `bgHex()`:

```typescript
import chalk from 'chalk';
import { getTheme } from '@/shared/config/themes';

const theme = getTheme(config.ui.theme);
const bg = chalk.bgHex(theme.rawColors.autocompleteBg);
const fg = chalk.hex(theme.rawColors.autocompleteText);

<Text>{bg(fg('Content with background'))}</Text>
```

## Layout Considerations

### No True Z-Axis

Ink doesn't support overlays. Reserve fixed space for popups/autocomplete:

```typescript
<Box flexDirection="column">
  {/* Main content */}
  <Box height={terminalHeight - 5}>
    <ChatInterface />
  </Box>

  {/* Reserved space for autocomplete */}
  <Box height={5}>
    {showAutocomplete && <CommandAutocomplete />}
  </Box>
</Box>
```

### Full-Width Backgrounds

Apply chalk background to padded content:

```typescript
const width = process.stdout.columns || 80;
const bg = chalk.bgHex(theme.rawColors.headerBg);
const text = ` Header `.padEnd(width);
<Text>{bg(text)}</Text>
```

## Best Practices

1. **Theme-first** - Always use theme system for colors
2. **Responsive** - Use `useTerminalSize()` for dynamic layouts
3. **Fixed space** - Reserve space for popups/autocomplete
4. **Chalk backgrounds** - Use `bgHex()` instead of `backgroundColor` prop
5. **Test across themes** - Verify with dark, light, colorblind themes
