import { MockFileSystem } from './tests/mocks/MockFileSystem.js';
import { LocalContextStorage } from './src/memory/storage/LocalContextStorage.js';

const fs = new MockFileSystem();
const storage = new LocalContextStorage(fs, '.mimir/context');

const id = await storage.createConversation({ title: 'Test Conversation' });
console.log('Created conversation ID:', id);

const paths = fs.getAllPaths();
console.log('All paths:', paths);

const expected = fs.join('.mimir/context/conversations', id);
console.log('Expected path:', expected);
console.log('Contains expected:', paths.includes(expected));
