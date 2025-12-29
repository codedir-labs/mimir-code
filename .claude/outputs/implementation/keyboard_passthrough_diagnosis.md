# Keyboard Passthrough Issue - Root Cause Analysis

## Problem Statement

User reports: "in input box im unable to click home and edit on home etc."

OS text editing shortcuts (Home, End, Ctrl+Arrow, Ctrl+Backspace) don't work in Mimir's InputBox.

## Investigation Summary

### Key Findings

1. **`ink-text-input` v6.0.0 doesn't support Home/End/Ctrl+Arrow natively**
   - Only supports: Left/Right arrows, Backspace, Delete, Enter
   - Home/End keys come through as terminal escape sequences (`\x1b[H`, `\x1b[F`)
   - TextInput treats escape sequences as literal text (inserts them)

2. **Multiple `useInput` hooks CAN coexist** (per Ink docs)
   - When multiple hooks have `isActive: true`, they ALL see the input
   - Early `return` doesn't block other hooks from processing

3. **Our top-level `useKeyboardInput` might be interfering**
   - Registered in `ChatApp.tsx` line 48 with `isActive: true`
   - Processes ALL input before TextInput sees it
   - Even with "inverted logic" (return early for unconfigured keys), might cause issues

### Critical Question: Does Multiple `useInput` Actually Work?

**Need to verify**: When two `useInput` hooks are both active, can TextInput still function?

**Test created**: `test-keyboard-passthrough.tsx`
- Simulates our architecture (top-level hook + TextInput)
- Will prove if multiple hooks work or if one blocks the other

## Root Cause Hypothesis

**Hypothesis A**: Multiple `useInput` hooks DON'T actually coexist properly
- First active hook consumes input exclusively
- Even with early return, TextInput never sees the event
- **Solution**: Conditionally disable top-level hook when typing

**Hypothesis B**: Multiple hooks work, but Home/End aren't supported by TextInput
- TextInput sees the input but doesn't know how to handle escape sequences
- **Solution**: Implement Home/End support in InputBox wrapper

**Hypothesis C**: Terminal doesn't send Home/End to Node.js process
- Some terminals intercept these keys for their own scrolling
- **Solution**: Document limitation, suggest alternatives

## Next Steps

### 1. Run the Minimal Repro Test

```bash
tsx test-keyboard-passthrough.tsx
```

**Test scenarios**:
- Type letters → Should work
- Use Left/Right arrows → Should work
- Try Home/End → Check if they work
- Check console log → See if top-level hook sees the input

**Expected outcomes**:
- **If typing works**: Multiple hooks coexist fine → Hypothesis B or C
- **If typing doesn't work**: Multiple hooks conflict → Hypothesis A

### 2. Based on Test Results

#### If Hypothesis A (hooks conflict):
- **Fix**: Make `useKeyboardInput` selectively active
  ```typescript
  //ChatApp.tsx
  const { eventBus } = useKeyboard();
  const isTyping = eventBus.getContext().isInputFocused;

  // Only active when NOT typing (let TextInput handle input)
  useKeyboardInput({ isActive: !isTyping });
  ```
- **Trade-off**: Can't intercept keys while typing (Ctrl+C, Ctrl+L won't work in input)
- **Alternative**: Move keyboard handling into ChatInterface with more granular control

#### If Hypothesis B (TextInput limitations):
- **Fix**: Wrap TextInput with custom Home/End handler
  - Use `useInput` in InputBox
  - Detect escape sequences
  - Manipulate value string directly
  - **Problem**: Can't control TextInput's internal cursor
  - **Real solution**: Fork `ink-text-input` to add Home/End support

#### If Hypothesis C (terminal limitations):
- **Fix**: Document the limitation
- **Workaround**: Recommend using Left/Right arrows for now
- **Future**: Consider using a different input library or terminal detection

## Files Involved

**Core issue**:
- `src/features/chat/components/ChatApp.tsx:48` - Top-level `useKeyboardInput`
- `src/shared/keyboard/useKeyboardInput.ts:170-191` - Inverted logic implementation
- `node_modules/ink-text-input/build/index.js` - TextInput source (no Home/End support)

**Test files**:
- `test-keyboard-passthrough.tsx` - Minimal repro
- `tests/integration/keyboard-passthrough-debug.spec.ts` - Integration tests

**Attempted fixes** (may need revision):
- `src/shared/keyboard/useKeyboardInput.ts` - Extended key detection (has `home`/`end` in InkKey but Ink doesn't provide them)
- `src/shared/keyboard/KeyboardEventBus.ts` - Context-aware filtering
- `src/shared/ui/EnhancedTextInput.tsx` - Wrapper attempt (won't work due to cursor control issues)

## Recommended Immediate Action

1. **Run test-keyboard-passthrough.tsx** to confirm hypothesis
2. **Report findings** - Does typing work with multiple hooks?
3. **If typing doesn't work**: Apply Hypothesis A fix (conditional `isActive`)
4. **If typing works but Home/End don't**: Apply Hypothesis B fix (fork ink-text-input or document limitation)

## Long-Term Solution

Regardless of hypothesis, **`ink-text-input` needs Home/End support**.

**Options**:
1. Fork `ink-text-input` and add:
   - Escape sequence detection for Home/End
   - Ctrl+Arrow word navigation
   - Ctrl+Backspace word deletion
   - Export cursor position for external control

2. Use a different library (if one exists)

3. Build custom TextInput component from scratch

4. Document limitation and provide keyboard shortcut cheat sheet

---

**Status**: ⏳ Awaiting test-keyboard-passthrough.tsx results
**Blocker**: Need to confirm if multiple `useInput` hooks actually coexist
**Next**: Run test, update this document with findings
