export interface ErrorResponse {
  code: string
  message: string
  details?: Record<string, string>
  trace_id: string
  status: number
}
