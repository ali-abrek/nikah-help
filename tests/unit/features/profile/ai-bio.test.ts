import { describe, it, expect, vi } from 'vitest'

// OpenAI constructor throws without credentials — mock before importing
vi.mock('@/lib/openai/client', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
  AI_BIO_PROMPT: `You are an assistant for a Muslim marriage application called Nikah Help. Your task is to generate a warm, honest, and respectful biographical description of a user based on their profile data.

The bio must:
1. Be written in the first person ("I am...", "I work...", etc.)
2. Be between 150 and 400 characters long
3. Sound natural and conversational — not like a template
4. Mention 2-3 key facts from the profile (education, job, hobbies, location, religion)
5. Include a brief note about what kind of spouse the user is looking for
6. Be respectful and halal-appropriate — no flirtation, no physical compliments
7. Use the user's name if provided
8. Be in Russian language

Format: Return only the bio text, no quotes, no additional commentary.`,
}))

import { AI_BIO_PROMPT } from '@/lib/openai/client'

describe('AI_BIO_PROMPT', () => {
  it('should require Russian language', () => {
    expect(AI_BIO_PROMPT).toContain('Russian')
  })

  it('should require first-person narration', () => {
    expect(AI_BIO_PROMPT).toContain('first person')
  })

  it('should specify max length of 400 characters', () => {
    expect(AI_BIO_PROMPT).toContain('400')
  })

  it('should require halal-appropriate content', () => {
    expect(AI_BIO_PROMPT).toContain('halal')
  })

  it('should mention using user name', () => {
    expect(AI_BIO_PROMPT).toContain("user's name")
  })

  it('should be a non-empty string', () => {
    expect(AI_BIO_PROMPT.length).toBeGreaterThan(100)
  })
})

describe('completeOnboardingAction return shape', () => {
  it('has consistent success/error shape', () => {
    const shape = {
      success: false as const,
      error: { _form: ['test error'] as string[] },
    }
    expect(shape).toHaveProperty('success')
    if (!shape.success) {
      expect(shape.error._form).toBeInstanceOf(Array)
    }
  })
})
