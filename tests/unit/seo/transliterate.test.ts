import { describe, it, expect } from 'vitest'
import { cyrillicToLatin } from '@/lib/seo/transliterate'

describe('cyrillicToLatin', () => {
  it('transliterates common Russian city names', () => {
    expect(cyrillicToLatin('Москва')).toBe('moskva')
    expect(cyrillicToLatin('Казань')).toBe('kazan')
    expect(cyrillicToLatin('Санкт-Петербург')).toBe('sankt-peterburg')
    expect(cyrillicToLatin('Краснодар')).toBe('krasnodar')
    expect(cyrillicToLatin('Душанбе')).toBe('dushanbe')
    expect(cyrillicToLatin('Ташкент')).toBe('tashkent')
  })

  it('transliterates country names', () => {
    expect(cyrillicToLatin('Россия')).toBe('rossiya')
    expect(cyrillicToLatin('Узбекистан')).toBe('uzbekistan')
    expect(cyrillicToLatin('Казахстан')).toBe('kazakhstan')
    expect(cyrillicToLatin('Таджикистан')).toBe('tadzhikistan')
  })

  it('passes through already-latin text unchanged', () => {
    expect(cyrillicToLatin('Moscow')).toBe('moscow')
    expect(cyrillicToLatin('hello')).toBe('hello')
  })

  it('replaces spaces with hyphens', () => {
    expect(cyrillicToLatin('Нижний Новгород')).toBe('nizhniy-novgorod')
  })

  it('removes special characters', () => {
    expect(cyrillicToLatin("къол'а, тїп!")).toBe('kola-tyip')
  })

  it('handles empty string', () => {
    expect(cyrillicToLatin('')).toBe('')
  })

  it('handles mixed cyrillic and latin', () => {
    expect(cyrillicToLatin('Москва City')).toBe('moskva-city')
  })

  it('lowercases output', () => {
    expect(cyrillicToLatin('МОСКВА')).toBe('moskva')
    expect(cyrillicToLatin('MOSCOW')).toBe('moscow')
  })
})
