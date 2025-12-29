# Testing Guide for Paste Handling Implementation

## 📊 Implementation Status: 60% Complete

**Completed Phases:** 1-3 + 4.1
**Ready for Testing:** Foundation, utilities, UI components
**Pending Integration:** ChatInterface wiring (Phase 4.2+)

---

## 🧪 What Can Be Tested Now

### ✅ Unit Tests (160+ tests)

All foundation code has comprehensive unit tests. Run them to verify:

```bash
# Run all unit tests
yarn test:unit

# Or run specific test files
yarn test:unit tests/unit/features/chat/utils/AttachmentManager.test.ts
yarn test:unit tests/unit/shared/utils/bracketedPaste.test.ts
yarn test:unit tests/unit/clipboard/ClipboardAdapter.test.ts
yarn test:unit tests/unit/features/chat/components/AttachmentItem.test.tsx
yarn test:unit tests/unit/features/chat/components/AttachmentsArea.test.tsx
```

**Expected Results:**
- ✅ 20+ tests for AttachmentManager (add, remove, expand, etc.)
- ✅ 40+ tests for bracketed paste utilities
- ✅ 25+ tests for ClipboardAdapter (mocked, all platforms)
- ✅ 20+ tests for AttachmentItem rendering
- ✅ 25+ tests for AttachmentsArea rendering

---

## 📦 Individual Component Testing

### 1. AttachmentManager

**Test File:** `src/features/chat/utils/AttachmentManager.ts`

**Manual Testing:**
```typescript
// In a test file or REPL
import { AttachmentManager } from './src/features/chat/utils/AttachmentManager.js';

const manager = new AttachmentManager();

// Test adding text attachment
const metadata = {
  isBracketedPaste: true,
  detectMethod: 'bracketed' as const,
  originalLength: 100,
};
const textAttachment = manager.addTextAttachment('Hello\nWorld', metadata);
console.log(textAttachment.label); // "[Pasted text #1]"
console.log(textAttachment.metadata.lines); // 2

// Test adding image attachment
const imageBuffer = Buffer.from('fake-image-data');
const imageAttachment = manager.addImageAttachment(imageBuffer, 'png');
console.log(imageAttachment.label); // "[Image #1]"

// Test expansion for API
const expanded = manager.expandForAPI('Main message');
console.log(expanded.content); // Array with text + attachments
```

**What to Verify:**
- ✅ Sequential numbering per type
- ✅ UUID generation for IDs
- ✅ Metadata calculation (lines, chars, size)
- ✅ API expansion includes all attachments

---

### 2. Bracketed Paste Detection

**Test File:** `src/shared/utils/bracketedPaste.ts`

**Manual Testing:**
```typescript
import {
  detectBracketedPaste,
  shouldCreateAttachment,
  getPasteStats,
} from './src/shared/utils/bracketedPaste.js';

// Test bracketed paste detection
const input = '\x1b[200~Hello World\x1b[201~';
const result = detectBracketedPaste(input);
console.log(result.isPaste); // true
console.log(result.content); // "Hello World"

// Test threshold logic
console.log(shouldCreateAttachment('x'.repeat(501))); // true (>500 chars)
console.log(shouldCreateAttachment('x'.repeat(499))); // false
console.log(shouldCreateAttachment(Array(11).fill('line').join('\n'))); // true (>10 lines)

// Test stats
const stats = getPasteStats('Line 1\nLine 2\nLine 3');
console.log(stats.lines); // 3
console.log(stats.words); // 6
```

**What to Verify:**
- ✅ Bracketed paste markers are detected
- ✅ Content is extracted correctly
- ✅ Threshold logic works (>500 chars OR >10 lines)
- ✅ Statistics calculation is accurate

---

### 3. ClipboardAdapter

**Test File:** `packages/mimir-agents-runtime/src/clipboard/ClipboardAdapter.ts`

**⚠️ Note:** Unit tests use mocked IProcessExecutor. Real clipboard testing requires platform-specific setup.

**Manual Testing (requires real executor):**
```typescript
import { ClipboardAdapter } from './packages/mimir-agents-runtime/src/clipboard/ClipboardAdapter.js';
import { ProcessExecutorAdapter } from './packages/mimir-agents-runtime/src/platform/ProcessExecutorAdapter.js';

const executor = new ProcessExecutorAdapter();
const adapter = new ClipboardAdapter(executor);

// Test reading clipboard (platform-specific)
try {
  const content = await adapter.readClipboard();
  console.log('Type:', content.type); // 'text' or 'image'
  console.log('Format:', content.format); // 'plain', 'png', etc.
  console.log('Data length:', content.data.length);
} catch (error) {
  console.error('Clipboard error:', error.message);
}
```

**Platform Requirements:**
- **macOS:** `pbpaste` and `osascript` (built-in)
- **Windows:** PowerShell (built-in)
- **Linux:** `xclip` (X11) or `wl-paste` (Wayland)

**What to Verify:**
- ✅ Text clipboard reads correctly
- ✅ Image clipboard reads as base64 buffer
- ✅ Appropriate error messages for missing tools

---

### 4. UI Components

**Test Files:**
- `src/features/chat/components/AttachmentItem.tsx`
- `src/features/chat/components/AttachmentsArea.tsx`

**Manual Testing (requires Ink render):**

Create a test component:

```tsx
// test-attachments.tsx
import React from 'react';
import { render } from 'ink';
import { AttachmentsArea } from './src/features/chat/components/AttachmentsArea.js';
import type { Attachment } from './src/features/chat/types/attachment.js';

const attachments = new Map<string, Attachment>();

// Add test attachments
attachments.set('1', {
  id: '1',
  type: 'text',
  label: '[Pasted text #1]',
  content: 'Sample pasted content with\nmultiple lines',
  metadata: {
    lines: 2,
    chars: 41,
    format: 'plain',
    size: 41,
    source: 'paste',
  },
  createdAt: new Date(),
});

attachments.set('2', {
  id: '2',
  type: 'image',
  label: '[Image #1]',
  content: Buffer.from('fake-image-data'),
  metadata: {
    format: 'png',
    size: 15,
    source: 'clipboard',
  },
  createdAt: new Date(),
});

const keyBindings = {
  navigateLeft: ['arrowleft'],
  navigateRight: ['arrowright'],
  removeAttachment: ['delete', 'backspace'],
  // ... other required bindings
};

const TestApp = () => (
  <AttachmentsArea
    attachments={attachments}
    selectedAttachmentId="1"
    theme="mimir"
    keyBindings={keyBindings as any}
    onRemove={(id) => console.log('Remove:', id)}
  />
);

render(<TestApp />);
```

Run with: `tsx test-attachments.tsx`

**What to Verify:**
- ✅ Attachments render with correct icons (📝 text, 🖼 image)
- ✅ Labels display correctly
- ✅ File sizes formatted (1.0 KB, etc.)
- ✅ Selected item has ▶ indicator
- ✅ Theme colors applied (no hardcoded colors)
- ✅ Scroll indicators for >3 items
- ✅ Footer shows keyboard shortcuts

---

## 🚫 What CANNOT Be Tested Yet

These require Phase 4.2+ integration:

### Not Ready:
- ❌ **Full paste workflow** (paste → attachment → send)
- ❌ **Keyboard navigation** (arrow keys to select attachments)
- ❌ **Attachment removal** (delete key)
- ❌ **Multi-part message sending** (text + images to LLM)
- ❌ **ChatInterface integration** (wiring all pieces together)
- ❌ **End-to-end tests** (integration tests require full pipeline)

### Why Not Ready:
ChatInterface (Phase 4.2) hasn't been modified yet to:
- Manage attachment state
- Handle paste events from InputBox
- Wire up keyboard navigation
- Render AttachmentsArea
- Expand attachments before API call

---

## 🔧 Build/Compile Testing

### TypeScript Compilation
```bash
# Check if code compiles
yarn typecheck

# Build all packages
yarn build
```

**Expected Issues:**
- May have missing dependencies (normal for incomplete integration)
- InputBox modifications should compile cleanly
- New types/utilities should have no errors

### Linting
```bash
yarn lint
```

**Fix any style issues:**
```bash
yarn lint:fix
```

---

## 📝 Test Results Checklist

Before continuing to Phase 4.2, verify:

- [ ] All unit tests pass (160+ tests)
- [ ] AttachmentManager correctly manages attachments
- [ ] Bracketed paste detection works
- [ ] ClipboardAdapter unit tests pass (mocked)
- [ ] UI components render correctly
- [ ] InputBox modifications compile without errors
- [ ] No TypeScript errors in new code
- [ ] Linting passes

---

## 🐛 Known Limitations (Expected)

These are normal for 60% completion:

1. **No End-to-End Flow:** Can't test full paste workflow yet (needs Phase 4.2)
2. **InputBox Paste Callback:** onPaste fires but nothing consumes it yet
3. **UI Components Isolated:** AttachmentsArea can render but not integrated
4. **No Keyboard Actions:** Navigation keys not wired up yet
5. **No API Integration:** Can't send multi-part messages yet

---

## 📊 Test Coverage Report

Run coverage to see what's tested:

```bash
yarn test:coverage
```

**Expected Coverage:**
- AttachmentManager: ~95%
- Bracketed paste utils: ~90%
- ClipboardAdapter: ~85%
- UI components: ~80%
- Overall: ~85%+

---

## 🎯 Next Steps After Testing

Once you've verified the tests pass and components work in isolation:

1. **Report any issues found**
2. **Review the implementation approach**
3. **Proceed to Phase 4.2:** ChatInterface integration
4. **Wire everything together**
5. **Test the complete workflow**

---

## 💡 Quick Test Commands

```bash
# Run all unit tests
yarn test:unit

# Run specific test suites
yarn test:unit AttachmentManager
yarn test:unit bracketedPaste
yarn test:unit ClipboardAdapter
yarn test:unit AttachmentItem
yarn test:unit AttachmentsArea

# Check TypeScript
yarn typecheck

# Lint check
yarn lint

# Coverage report
yarn test:coverage
```

---

## 📞 Reporting Issues

If you find issues during testing, note:
1. **Which test file failed**
2. **Error message**
3. **Expected vs actual behavior**
4. **Environment (OS, Node version, terminal)**

This will help debug and fix before continuing to Phase 4.2.
