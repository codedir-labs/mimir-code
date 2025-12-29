/**
 * Custom error classes
 */

export class MimirError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MimirError';
  }
}

export class ConfigurationError extends MimirError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ProviderError extends MimirError {
  constructor(
    message: string,
    public readonly provider?: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ToolExecutionError extends MimirError {
  constructor(
    message: string,
    public readonly toolName?: string
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class PermissionDeniedError extends MimirError {
  constructor(
    message: string,
    public readonly command?: string
  ) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

export class DockerError extends MimirError {
  constructor(message: string) {
    super(message);
    this.name = 'DockerError';
  }
}

export class NetworkError extends MimirError {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends MimirError {
  constructor(
    message: string,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}
