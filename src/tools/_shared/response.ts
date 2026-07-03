export interface ToolResponse<T> extends Record<string, unknown> {
  content: [{ type: 'text'; text: string }];
  structuredContent: T & Record<string, unknown>;
}

export function makeToolResponse<T>(payload: T): ToolResponse<T> {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as T & Record<string, unknown>,
  };
}
