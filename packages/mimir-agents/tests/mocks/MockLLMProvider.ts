/**
 * MockLLMProvider - Mock LLM provider for testing
 */

export interface LLMResponse {
  content: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}

export class MockLLMProvider {
  private responses: LLMResponse[] = [];
  private currentResponseIndex = 0;
  private chatCallCount = 0;

  /**
   * Queue responses for chat calls
   */
  queueResponse(response: LLMResponse): void {
    this.responses.push(response);
  }

  /**
   * Queue multiple responses
   */
  queueResponses(responses: LLMResponse[]): void {
    this.responses.push(...responses);
  }

  /**
   * Mock chat method
   */
  async chat(messages: any[], tools?: any[]): Promise<LLMResponse> {
    this.chatCallCount++;

    if (this.currentResponseIndex >= this.responses.length) {
      // Default response when no more queued responses
      return {
        content: 'Task completed: Mock task finished',
      };
    }

    const response = this.responses[this.currentResponseIndex]!;
    this.currentResponseIndex++;
    return response;
  }

  /**
   * Mock token counting
   */
  countTokens(text: string): number {
    // Simple approximation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Mock cost calculation
   */
  calculateCost(inputTokens: number, outputTokens: number): number {
    // Mock pricing: $0.001 per 1000 tokens
    return ((inputTokens + outputTokens) / 1000) * 0.001;
  }

  /**
   * Get number of chat calls made
   */
  getChatCallCount(): number {
    return this.chatCallCount;
  }

  /**
   * Reset mock state
   */
  reset(): void {
    this.responses = [];
    this.currentResponseIndex = 0;
    this.chatCallCount = 0;
  }
}
