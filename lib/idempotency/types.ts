export interface IdempotencyOptions {
  required?: boolean
  ttl?: number
  timeout?: number
}

export interface StoredResponse {
  status: number
  body: string
  headers: Record<string, string>
}
