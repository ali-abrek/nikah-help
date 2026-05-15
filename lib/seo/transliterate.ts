const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',  б: 'b',  в: 'v',  г: 'g',  д: 'd',
  е: 'e',  ё: 'yo', ж: 'zh', з: 'z',  и: 'i',
  й: 'y',  к: 'k',  л: 'l',  м: 'm',  н: 'n',
  о: 'o',  п: 'p',  р: 'r',  с: 's',  т: 't',
  у: 'u',  ф: 'f',  х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e',  ю: 'yu', я: 'ya',
  ҳ: 'h',  ӯ: 'u',  ҷ: 'j',  қ: 'k',  ғ: 'g',
  ї: 'yi', є: 'ie', і: 'i', ґ: 'g', '\'': '',
}

/**
 * Deterministic Cyrillic-to-Latin transliteration for SEO slugs.
 * Used identically on both frontend (for client-side URL construction)
 * and backend (for canonical URL generation).
 */
export function cyrillicToLatin(input: string): string {
  let result = ''
  const lower = input.toLowerCase()
  for (const ch of lower) {
    result += CYRILLIC_TO_LATIN[ch] ?? ch
  }
  // Collapse to only [a-z0-9] plus hyphens
  result = result.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return result
}
