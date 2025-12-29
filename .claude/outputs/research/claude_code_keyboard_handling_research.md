# Claude Code Keyboard Handling Research

## Executive Summary

Claude Code uses **the same stack as Mimir** (React + Ink + ink-text-input) but supports OS text editing shortcuts we're missing. They likely implemented a custom TextInput component or heavily modified ink-text-input.

**Key Finding**: No public package exists that adds readline support to Ink. Claude Code's solution is proprietary.

---

## Tech Stack Comparison

| Component | Claude Code | Mimir |
|-----------|-------------|-------|
| **UI Framework** | React + Ink | React + Ink ✅ |
| **Text Input** | Custom/Modified | ink-text-input v6.0.0 |
| **Renderer** | Custom (rewrote Ink renderer) | Standard Ink renderer |
| **Distribution** | Bundled monolith (~7.6MB) | Source code |
| **Build Tool** | Bun | tsup/yarn |

---

## Supported Keyboard Shortcuts in Claude Code

According to [egghead.io](https://egghead.io/the-essential-claude-code-shortcuts~dgsee):

### Text Navigation (Emacs/Readline style)
- `Ctrl+A` - Jump to beginning of line
- `Ctrl+E` - Jump to end of line
- `Option+F` (Mac) - Jump forward one word
- `Option+B` (Mac) - Jump back one word

### Editing
- `Ctrl+W` - Delete word backward

### Command History
- `Up/Down arrows` - Navigate command history

### Control
- `Escape` (double tap) - Clear input or rewind conversation
- `Ctrl+C` (double tap) - Hard exit

---

## Known Issues in Claude Code

### 1. IME Input Lag ([Issue #3045](https://github.com/anthropics/claude-code/issues/3045))

**Problem**: 200-500ms latency for Japanese/Chinese/Korean input

**Root Cause**: React Ink's TextInput doesn't properly handle IME composition events

**Why they can't fix it**:
- Distributed as single bundled file (cli.js ~7.6MB)
- Heavily minified/obfuscated code
- No dependencies in package.json (all embedded)
- Can't patch at runtime

**Workaround**: Users compose text externally and paste

### 2. Interrupt Signal Not Working ([Issue #3455](https://github.com/anthropics/claude-code/issues/3455))

**Problem**: Ctrl+C and Escape show feedback but don't stop agent

**Status**: Known bug, not yet fixed

---

## How They Likely Implemented Readline Support

### Evidence
1. **Rewrote Renderer**: They replaced Ink's renderer for "fine-grained incremental updates"
   - Source: [Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)

2. **No Public Fork**: No fork of ink-text-input with readline support exists

3. **Bundled Distribution**: All code is internal, can't inspect implementation

### Hypothesis
Claude Code likely has a **custom TextInput component** that:
- Extends or replaces `ink-text-input`
- Manually handles Ctrl+A/E/W and Option+F/B
- Tracks cursor position internally
- Implements readline-style editing logic

**Why no open source?**:
- Proprietary advantage
- Part of their custom renderer rewrite
- Tightly coupled to their architecture

---

## ink-text-input v6.0.0 Limitations

Based on source code inspection:

### Supported Keys
✅ Left/Right arrows (character navigation)
✅ Backspace, Delete
✅ Enter (submit)
✅ Tab, Shift+Tab (passed through)

### NOT Supported
❌ Home, End (come as escape sequences `\x1b[H`, `\x1b[F`)
❌ Ctrl+Left/Right (word navigation)
❌ Ctrl+A, Ctrl+E (line start/end)
❌ Ctrl+W, Ctrl+K (word/line deletion)
❌ Ctrl+Backspace, Ctrl+Delete
❌ Option+F/B (Mac word navigation)
❌ IME composition (Asian languages)

---

## Our Implementation vs Claude Code

### What We Did Right ✅
- React + Ink architecture (same as Claude Code)
- Keyboard event bus (centralized handling)
- Action-based routing (semantic actions)
- Context-aware filtering (autocomplete, agent state)

### What We're Missing ❌
- OS text editing shortcuts (Home, End, Ctrl+Arrow)
- Readline/Emacs keybindings (Ctrl+A/E/W)
- Custom TextInput component

### Why Our "Inverted Logic" Didn't Work
The issue isn't in our event bus logic—it's that **ink-text-input doesn't support these keys natively**.

Even with perfect passthrough:
```typescript
// Our code
if (!action) {
  return; // Passthrough to TextInput
}
```

TextInput still receives the input, but:
1. For Home/End: Treats escape sequences as literal text
2. For Ctrl+A/E/W: Ignores them (not in its handler)

---

## Recommendations

### Option 1: Build Custom TextInput Component (Claude Code's approach)

**Effort**: High (2-3 days)
**Maintenance**: Medium
**Result**: Full control, all shortcuts work

**Implementation**:
```typescript
// src/shared/ui/ReadlineTextInput.tsx
import { useInput } from 'ink';

export function ReadlineTextInput({ value, onChange, onSubmit }) {
  const [cursor, setCursor] = useState(value.length);

  useInput((input, key) => {
    // Detect escape sequences
    if (input === '\x1b[H') { // Home
      setCursor(0);
      return;
    }
    if (input === '\x1b[F') { // End
      setCursor(value.length);
      return;
    }
    if (key.ctrl && input === '\x01') { // Ctrl+A
      setCursor(0);
      return;
    }
    if (key.ctrl && input === '\x05') { // Ctrl+E
      setCursor(value.length);
      return;
    }
    // ... implement word navigation, deletion, etc.
  }, { isActive: true });

  // Render with custom cursor logic
  return <Text>{renderWithCursor(value, cursor)}</Text>;
}
```

**Pros**:
- Full readline support (Ctrl+A/E/W, Option+F/B, Home/End)
- We control cursor and editing logic
- Can add IME support later
- Can add command history (Up/Down)

**Cons**:
- Significant implementation effort
- Need to reimplement all TextInput features
- Cursor rendering tricky (need to use chalk.inverse for visual cursor)

---

### Option 2: Fork ink-text-input and Extend

**Effort**: Medium (1-2 days)
**Maintenance**: High (need to merge upstream)
**Result**: Cleaner than custom, but tied to upstream

**Steps**:
1. Fork [vadimdemedes/ink-text-input](https://github.com/vadimdemedes/ink-text-input)
2. Add escape sequence handling (Home/End)
3. Add Ctrl+A/E/W support
4. Publish as `@codedir/ink-text-input-enhanced`
5. Use in Mimir

**Pros**:
- Builds on existing battle-tested code
- Can contribute back to upstream
- Easier to maintain than full custom

**Cons**:
- Still significant effort
- Need to maintain fork
- Upstream might not accept PRs (vadimdemedes is selective)

---

### Option 3: Document Limitation + Partial Workaround

**Effort**: Low (few hours)
**Maintenance**: None
**Result**: Limited but honest

**Implementation**:
1. Document that Home/End/Ctrl+Arrow aren't supported (ink-text-input limitation)
2. Recommend Left/Right arrows for now
3. Add tooltip on first run: "Tip: Use Left/Right arrows for navigation"
4. Implement what we can:
   - Command history (Up/Down) ✅ Can do
   - Clear input (Ctrl+U) ✅ Can intercept this

**Pros**:
- Quick to implement
- No complex code to maintain
- Users understand the limitation

**Cons**:
- Inferior UX vs Claude Code
- Users coming from Claude Code will be frustrated

---

### Option 4: Use Different TUI Framework

**Effort**: Very High (1-2 weeks)
**Maintenance**: High
**Result**: Potentially better, but risky

**Alternatives to Ink**:
- **blessed** / **blessed-contrib** - Lower level, full terminal control
- **prompts** - Simple but limited
- **inquirer** - Good for Q&A flows, not chat
- **@clack/prompts** - Modern, nice API, but no long-running chat support

**Why stay with Ink**:
- React component model is developer-friendly
- Large ecosystem (ink-spinner, ink-table, etc.)
- Claude Code proves it works at scale
- Rewrite would take weeks

---

## Recommended Action Plan

### Phase 1: Quick Fix (1-2 hours)
1. **Document the limitation** in setup wizard
2. **Add keyboard shortcuts cheat sheet**: `/keybinds` command
3. **Implement what ink-text-input supports**:
   - Command history (Up/Down arrows)
   - Ctrl+U to clear input
   - Ctrl+C/Escape for interrupt

### Phase 2: Custom TextInput (1-2 days)
1. **Build `ReadlineTextInput` component** with:
   - Home/End support (escape sequence detection)
   - Ctrl+A/E (line start/end)
   - Ctrl+W (delete word backward)
   - Option+F/B on Mac (word navigation)
   - Ctrl+Left/Right on Windows/Linux (word navigation)

2. **Replace `TextInput` in InputBox**:
   ```typescript
   // src/features/chat/components/InputBox.tsx
   import { ReadlineTextInput } from '@/shared/ui/ReadlineTextInput.js';

   // Replace:
   <TextInput value={value} onChange={onChange} />
   // With:
   <ReadlineTextInput value={value} onChange={onChange} />
   ```

3. **Test thoroughly**:
   - Windows (Ctrl+Arrow)
   - Mac (Option+Arrow, Cmd+Arrow)
   - Linux (Ctrl+Arrow)

### Phase 3: Command History (few hours)
- Implement Up/Down arrow history navigation
- Store in `.mimir/history.txt`
- Searchable with Ctrl+R (optional)

---

## References

**Research Sources**:
- [How Claude Code is Built - Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
- [Claude Code IME Issue #3045](https://github.com/anthropics/claude-code/issues/3045)
- [Claude Code Keyboard Shortcuts - egghead.io](https://egghead.io/the-essential-claude-code-shortcuts~dgsee)
- [Digging into Claude Code Source](https://daveschumaker.net/digging-into-the-claude-code-source-saved-by-sublime-text/)
- [ink-text-input GitHub](https://github.com/vadimdemedes/ink-text-input)

**Related Issues**:
- [Ink Issue #555 - IME and Raw Mode](https://github.com/vadimdemedes/ink/issues/555)
- [Claude Code Issue #3455 - Interrupt Not Working](https://github.com/anthropics/claude-code/issues/3455)

---

## Conclusion

**Claude Code supports readline shortcuts because they built a custom TextInput component.**

There's no magic package—they invested engineering time to build it properly.

**For Mimir**, we have three realistic options:
1. **Quick**: Document limitation, ship as-is
2. **Medium**: Build custom ReadlineTextInput (2 days)
3. **Long**: Fork ink-text-input (1-2 days + ongoing maintenance)

**Recommendation**: **Option 2 (Custom ReadlineTextInput)**
- Matches our "platform-agnostic, configurable" philosophy
- Gives us full control for future enhancements (IME, history)
- 2 days is acceptable for significantly better UX
- We can iterate and improve over time

---

**Next Steps**:
1. Get user approval on approach (Option 1, 2, or 3)
2. If Option 2: Create `src/shared/ui/ReadlineTextInput.tsx`
3. Implement readline keybindings one by one
4. Test across platforms
5. Update documentation

**Status**: ⏳ Awaiting decision
**Blocker**: Need user to choose path forward
