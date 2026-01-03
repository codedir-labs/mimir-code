/**
 * Repository for conversation data
 */

import { DatabaseManager } from '../Database.js';
import { v4 as uuidv4 } from 'uuid';

export interface Conversation {
  id: string;
  title?: string;
  created_at: number;
  updated_at: number;
  total_tokens: number;
  total_cost: number;
  provider?: string;
  model?: string;
  status: 'active' | 'archived' | 'deleted';
}

export interface CreateConversationInput {
  title?: string;
  provider?: string;
  model?: string;
}

export class ConversationRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new conversation
   */
  create(input: CreateConversationInput): Conversation {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    this.db.execute(
      `INSERT INTO conversations (id, title, provider, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.title || null, input.provider || null, input.model || null, now, now]
    );

    return this.findById(id)!;
  }

  /**
   * Find conversation by ID
   */
  findById(id: string): Conversation | null {
    return this.db.queryOne<Conversation>('SELECT * FROM conversations WHERE id = ?', [id]);
  }

  /**
   * Find all conversations (with pagination)
   */
  findAll(limit = 50, offset = 0): Conversation[] {
    return this.db.query<Conversation>(
      `SELECT * FROM conversations
       WHERE status != 'deleted'
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  /**
   * Update conversation
   */
  update(id: string, updates: Partial<Conversation>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.provider !== undefined) {
      fields.push('provider = ?');
      values.push(updates.provider);
    }
    if (updates.model !== undefined) {
      fields.push('model = ?');
      values.push(updates.model);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(id);
    this.db.execute(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  /**
   * Delete conversation (soft delete)
   */
  delete(id: string): void {
    this.db.execute(`UPDATE conversations SET status = 'deleted' WHERE id = ?`, [id]);
  }

  /**
   * Hard delete conversation and all related data
   */
  hardDelete(id: string): void {
    this.db.execute('DELETE FROM conversations WHERE id = ?', [id]);
  }

  /**
   * Archive conversation
   */
  archive(id: string): void {
    this.db.execute(`UPDATE conversations SET status = 'archived' WHERE id = ?`, [id]);
  }

  /**
   * Get conversation count
   */
  count(): number {
    const result = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM conversations WHERE status != 'deleted'`
    );
    return result?.count ?? 0;
  }

  /**
   * Search conversations by title
   */
  search(query: string, limit = 20): Conversation[] {
    return this.db.query<Conversation>(
      `SELECT * FROM conversations
       WHERE title LIKE ? AND status != 'deleted'
       ORDER BY updated_at DESC
       LIMIT ?`,
      [`%${query}%`, limit]
    );
  }
}
