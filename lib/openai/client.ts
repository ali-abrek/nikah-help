import OpenAI from 'openai'
import { requireEnv } from '@/lib/env'

let _openai: OpenAI | null = null

export function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })
  }
  return _openai
}

export const AI_BIO_PROMPT = `You are an assistant for a Muslim marriage application called Nikah Help. Your task is to generate a warm, honest, and respectful biographical description of a user based on their profile data.

The bio must:
1. Be written in the first person ("I am...", "I work...", etc.)
2. Be between 150 and 400 characters long
3. Sound natural and conversational — not like a template
4. Mention 2-3 key facts from the profile (education, job, hobbies, location, religion)
5. Include a brief note about what kind of spouse the user is looking for
6. Be respectful and halal-appropriate — no flirtation, no physical compliments
7. Use the user's name if provided
8. Be in Russian language

Format: Return only the bio text, no quotes, no additional commentary.`
