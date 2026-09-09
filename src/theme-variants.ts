'use strict';

/**
 * Light/dark counterparts of a theme, by name.
 *
 * Every shipped theme comes as a pair that differs only in one word:
 * one-dark-ui / one-light-ui, chevron-dark-syntax / chevron-light-syntax.
 * Following the OS appearance therefore needs no second setting: the user
 * keeps choosing a family in core.themes, and the variant is swapped to match
 * `nativeTheme.shouldUseDarkColors`. A theme with no counterpart installed is
 * left alone.
 *
 * docs/reference/os-integration.md
 */

const WORD = /(^|-)(dark|light)(?=-|$)/;

export type Appearance = 'dark' | 'light';

export interface AppearanceOptions {
  dark: boolean;
  exists: (name: string) => boolean;
}

/** The other half of the pair, or null when the name says no appearance. */
export function counterpart(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const match = WORD.exec(name);
  if (!match) return null;
  const swapped = match[2] === 'dark' ? 'light' : 'dark';
  return (
    name.slice(0, match.index) +
    match[1] +
    swapped +
    name.slice(match.index + match[0].length)
  );
}

export function appearanceOf(name: unknown): Appearance | null {
  const match = typeof name === 'string' ? WORD.exec(name) : null;
  return match ? (match[2] as Appearance) : null;
}

/**
 * The name to activate for `name` when the OS is dark (`dark: true`) or light.
 * `exists(name)` says whether a theme package by that name is installed.
 */
export function themeVariantForAppearance(
  name: string,
  { dark, exists }: AppearanceOptions
): string {
  const wanted: Appearance = dark ? 'dark' : 'light';
  if (appearanceOf(name) === wanted) return name;
  const other = counterpart(name);
  return other && exists(other) ? other : name;
}

export function themeNamesForAppearance(
  names: string[] | undefined,
  options: AppearanceOptions
): string[] {
  return (names || []).map(name => themeVariantForAppearance(name, options));
}
