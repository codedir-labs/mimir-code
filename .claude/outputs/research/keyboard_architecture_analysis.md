# Keyboard Architecture Analysis - The Complete Mess

## Current State: 3 Competing Systems

### System 1: KeyboardEventBus (Global)
**Location**: `src/shared/keyboard/KeyboardEventBus.ts`

**How it works**:
- Top-level `useKeyboardInput` hook in ChatApp
- Converts raw keys → actions (interrupt, accept, navigateUp, etc.)
- Dispatches to registered handlers
- Priority-based execution
- Context-aware filtering

**Problems**:
- Currently **DISABLED** because conflicts with ReadlineTextInput
- Can't coexist with other useInput hooks
- Inverted logic doesn't work (passthrough fails)

### System 2: ReadlineTextInput (Component)
**Location**: `src/shared/ui/ReadlineTextInput.tsx`

**How it works**:
- Own useInput hook
- Handles text editing (Ctrl+A/E/W/K/U, Ctrl+Arrow)
- Callbacks for Tab/Escape/Ctrl+C

**Problems**:
- Callbacks reference nonexistent state (`setShowAutocomplete` not in scope)
- Backspace vs Delete detection broken
- Ctrl+A/E/W/K/U **NOT WORKING** (never tested)
- Conflicts with KeyboardEventBus when both active
- Home/End still don't work (Ink limitation)

### System 3: InputBox State Management
**Location**: `src/features/chat/components/InputBox.tsx`

**How it works**:
- Manages autocomplete state
- Receives callbacks from ReadlineTextInput

**Problems**:
- Callbacks crash because they reference state from wrong scope
- No access to `setShowAutocomplete` or `setSelectedIndex`
- Can't handle keyboard shortcuts directly

---

## The Architecture Conflict

```
User Presses Key
    ↓
┌─────────────────────────────────────┐
│  Who handles it?                    │
├─────────────────────────────────────┤
│ 1. ChatApp useKeyboardInput         │ ← DISABLED (conflicts)
│    → KeyboardEventBus               │
│    → ChatInterface handlers         │
│                                     │
│ 2. ReadlineTextInput useInput       │ ← ACTIVE (but buggy)
│    → Text editing logic             │
│    → Callbacks (broken)             │
│                                     │
│ 3. InputBox callbacks               │ ← RECEIVES callbacks
│    → State updates (crash)          │
└─────────────────────────────────────┘
         ↓
    💥 CONFLICTS & CRASHES
```

---

## What Doesn't Work (And Why)

| Shortcut | Expected | Actual | Why Broken |
|----------|----------|--------|------------|
| `Tab` | Show autocomplete | Crashes | `setShowAutocomplete` not in callback scope |
| `Up/Down` | Navigate autocomplete | Crashes | `setSelectedIndex` not in callback scope |
| `Escape` | Close autocomplete | Crashes | `setShowAutocomplete` not in callback scope |
| `Ctrl+C` | Interrupt/Exit | Does nothing | `process.emit('SIGINT')` doesn't work in Ink |
| `Enter` | Submit | Works | ✅ Only thing that works |
| `Backspace` | Delete before cursor | Works | ✅ (by accident) |
| `Delete` | Delete at cursor | Acts like Backspace | Ink reports 0x7f as `key.delete` |
| `Ctrl+Backspace` | Delete word backward | Doesn't work | Logic never tested, likely broken |
| `Ctrl+Delete` | Delete word forward | Works | ✅ |
| `Ctrl+A` | Move to line start | Doesn't work | Logic exists but not working |
| `Ctrl+E` | Move to line end | Doesn't work | Logic exists but not working |
| `Ctrl+W` | Delete word backward | Doesn't work | Logic exists but not working |
| `Ctrl+K` | Delete to line end | Doesn't work | Logic exists but not working |
| `Ctrl+U` | Delete entire line | Doesn't work | Logic exists but not working |
| `Ctrl+Left/Right` | Word navigation | Works | ✅ |
| `Home/End` | Line start/end | Never worked | Ink doesn't parse these keys |

**Success Rate**: 4/17 shortcuts work (23%) 💀

---

## Root Causes

### 1. **Scope Confusion**
ReadlineTextInput callbacks try to call `setShowAutocomplete()` which exists in InputBox:

```tsx
// ReadlineTextInput.tsx (line 475)
<ReadlineTextInput
  onEscape={() => {
    setShowAutocomplete(false);  // ❌ NOT IN SCOPE!
  }}
/>
```

### 2. **Multiple useInput Hooks Conflict**
When both ChatApp's `useKeyboardInput` and ReadlineTextInput's `useInput` are active:
- Both see the same keypress
- Both try to handle it
- Race condition / undefined behavior

### 3. **Ink's Backspace/Delete Bug**
Ink reports backspace (0x7f) as `key.delete`, making them indistinguishable:

```ts
// When user presses Backspace:
key.delete === true  // ❌ Wrong!
input === ''

// When user presses Delete:
key.delete === true  // ✅ Correct
input === '\x1b[3~' (escape sequence)
```

### 4. **Ctrl+A/E/W/K/U Never Tested**
The logic exists in ReadlineTextInput but **was never actually tested**. Ctrl+A sends `\x01`, Ctrl+E sends `\x05`, etc. The code checks for these but cursor doesn't update properly.

### 5. **Process.emit('SIGINT') Doesn't Work in Ink**
Ink manages its own process lifecycle. You can't just emit SIGINT:

```ts
process.emit('SIGINT' as any);  // ❌ Doesn't work
```

Need to use Ink's cleanup or call exit handler directly.

---

## Proposed Solution: Simplified 2-Layer Architecture

### Layer 1: ink-text-input (Basic Input)
**Use the default ink-text-input** for basic functionality:
- Typing
- Backspace/Delete (works correctly in ink-text-input)
- Left/Right arrows
- Enter

**Why go back?**
- It works
- Handles backspace correctly
- No custom cursor tracking needed
- Battle-tested

### Layer 2: InputBox useInput (Readline Shortcuts)
**Add ONE useInput hook in InputBox** for all shortcuts:
- Readline shortcuts (Ctrl+A/E/W/K/U, Ctrl+Arrow)
- Autocomplete (Tab, Up/Down)
- Global (Escape, Ctrl+C)

**Why in InputBox?**
- Has access to ALL state (`value`, `setShowAutocomplete`, `selectedIndex`)
- Can manipulate value directly
- Single useInput, no conflicts
- Can call parent callbacks (`onSubmit`, etc.)

### Layer 3: KeyboardEventBus (Global Actions)
**Keep KeyboardEventBus** for truly global shortcuts that don't depend on input:
- Ctrl+L (clear screen)
- Ctrl+Z/Y (undo/redo)
- ? (help)
- Leader key sequences

**Coordination**:
- KeyboardEventBus only active when input **NOT focused**
- When InputBox has focus, its useInput takes precedence
- Use `isInputFocused` context flag

---

## Implementation Plan

### Step 1: Revert to ink-text-input
```tsx
// InputBox.tsx
import TextInput from 'ink-text-input';

<TextInput
  value={value}
  onChange={onChange}
  onSubmit={onSubmit}
  focus={true}
/>
```

### Step 2: Add Single useInput Hook in InputBox
```tsx
// InputBox.tsx
useInput((input, key) => {
  // Readline shortcuts
  if (key.ctrl && input === '\x01') { // Ctrl+A
    // Move cursor to start (manipulate value)
  }

  // Autocomplete
  if (key.tab) {
    setShowAutocomplete(!showAutocomplete);
  }

  // Navigation
  if (key.upArrow && showAutocomplete) {
    setSelectedIndex(prev => ...);
  }

  // Global
  if (key.escape) {
    if (showAutocomplete) {
      setShowAutocomplete(false);
    } else {
      // Trigger interrupt via parent callback
      onInterrupt?.();
    }
  }
}, { isActive: true });
```

### Step 3: Update KeyboardEventBus Context
```ts
// Only active when input NOT focused
useKeyboardInput({
  isActive: !isInputFocused
});
```

### Step 4: Implement Readline Shortcuts Properly

For Ctrl+A/E (move cursor):
```ts
// Problem: TextInput doesn't expose cursor position
// Solution: Manipulate value string to "fake" cursor movement

// Ctrl+A - add marker at start, TextInput will move cursor there
if (key.ctrl && input === '\x01') {
  // Can't actually move cursor in TextInput
  // User should just press Left repeatedly or use mouse
  // OR: Accept that Home/End/Ctrl+A/E don't work
}
```

**REALIZATION**: We **CAN'T** implement Ctrl+A/E without controlling cursor!

ink-text-input doesn't expose cursor position setter.

### Alternative: Fork ink-text-input

Or accept limitations and document:
- **Supported**: Ctrl+Left/Right (word nav), Ctrl+W/Delete, Ctrl+U/K
- **Not supported**: Ctrl+A/E (use Left/Right), Home/End

---

## Simplified Realistic Plan

### What We CAN Do Without Forking

| Feature | Implementation | Complexity |
|---------|----------------|------------|
| Ctrl+Left/Right | Detect in useInput, manipulate value | Medium |
| Ctrl+Backspace | Detect, delete word from value | Easy |
| Ctrl+Delete | Detect, delete word from value | Easy |
| Ctrl+W | Same as Ctrl+Backspace | Easy |
| Ctrl+K | Delete from cursor to end | Hard (no cursor pos) |
| Ctrl+U | Clear entire value | Easy |
| Tab | Show/hide autocomplete | Easy |
| Up/Down | Navigate autocomplete | Easy |
| Escape | Close autocomplete or interrupt | Easy |
| Ctrl+C | Trigger interrupt callback | Easy |

### What We CAN'T Do (ink-text-input Limitations)

| Feature | Why Impossible | Workaround |
|---------|---------------|------------|
| Home/End | Ink doesn't parse | Use Left/Right or Ctrl+A/E |
| Ctrl+A/E | No cursor position control | Use Left/Right repeatedly |
| Ctrl+K | No cursor position | Can only clear all (Ctrl+U) |

---

## Recommended Implementation

### 1. Revert ReadlineTextInput → ink-text-input
### 2. Add useInput in InputBox for ALL shortcuts
### 3. Keep KeyboardEventBus for global (non-input) actions
### 4. Document limitations (Home/End/Ctrl+A/E)

---

## File Changes Required

1. **Delete**: `src/shared/ui/ReadlineTextInput.tsx`
2. **Revert**: `src/features/chat/components/InputBox.tsx`
   - Import `ink-text-input`
   - Add `useInput` hook with all shortcuts
3. **Update**: `src/features/chat/components/ChatApp.tsx`
   - Re-enable `useKeyboardInput` with context check
4. **Update**: `src/shared/keyboard/KeyboardEventBus.ts`
   - Add `isInputFocused` context checks
5. **Update**: `src/features/chat/components/ChatInterface.tsx`
   - Set `isInputFocused` context appropriately

---

## Success Criteria

After implementation:
- ✅ Tab shows/hides autocomplete
- ✅ Up/Down navigate autocomplete
- ✅ Enter submits message
- ✅ Escape closes autocomplete or interrupts
- ✅ Ctrl+C interrupts/exits
- ✅ Backspace and Delete work correctly
- ✅ Ctrl+Backspace/Delete delete words
- ✅ Ctrl+Left/Right jump words
- ✅ Ctrl+W deletes word backward
- ✅ Ctrl+U clears line
- ✅ No crashes, no undefined errors
- ✅ Global shortcuts (Ctrl+L, ?, etc.) work when input not focused

---

## Next Steps

**Option A: Implement Simplified Plan**
- Effort: 2-3 hours
- Result: 80% of features work, some limitations
- Trade-off: No Home/End/Ctrl+A/E

**Option B: Fork ink-text-input**
- Effort: 6-8 hours
- Result: 100% of features work
- Trade-off: Maintain fork

**Option C: Use Different Input Library**
- Effort: 4-6 hours (research + implement)
- Result: Unknown
- Trade-off: May not exist

**Recommendation**: **Option A** (Simplified Plan)

Accept that Ctrl+A/E don't work, document it, ship it.
Users can use Left/Right arrows or mouse.
Claude Code probably has the same limitation (they don't document Ctrl+A/E).

---

**Status**: Analysis complete
**Decision needed**: Which option?
