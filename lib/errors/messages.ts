import ruMessages from '@/messages/ru.json'
import enMessages from '@/messages/en.json'

const messages: Record<string, Record<string, string>> = {
  ru: ruMessages.errors,
  en: enMessages.errors,
}

export function getErrorMessage(code: string, locale: 'ru' | 'en' = 'ru'): string {
  const msg =
    (messages[locale] as Record<string, string> | undefined)?.[code] ??
    (messages.ru as Record<string, string>)?.[code]
  return msg ?? code
}
