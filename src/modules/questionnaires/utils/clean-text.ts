/**
 * Text preprocessing for multilingual student feedback.
 * Handles Cebuano, Tagalog, English, and code-switching.
 *
 * Ported from topic-modeling.faculytics/src/preprocess.py
 */

const EXCEL_ARTIFACT_RE = /^#(NAME|VALUE|REF|DIV\/0|NULL|NUM|N\/A)\??$/i;
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
const LAUGHTER_RE =
  /\b(ha){2,}\b|\b(he){2,}\b|\b(hi){2,}\b|\blol+\b|\blmao+\b|\brofl+\b/gi;
const REPEATED_CHAR_RE = /(.)\1{2,}/g;
const PUNCTUATION_SPAM_RE = /([!?.]){3,}/g;
const BROKEN_EMOJI_RE = /\ufffd+/g;
const KEYBOARD_MASH_RE = /^[asdfghjklqwertyuiopzxcvbnm]{5,}$/i;
const WHITESPACE_RE = /\s+/g;

/**
 * Clean a single feedback text entry.
 *
 * @returns Cleaned text, or `null` if the entry should be excluded from analysis.
 */
export function cleanText(text: string): string | null {
  let t = text.trim();

  if (!t) return null;

  // Drop Excel artifacts
  if (EXCEL_ARTIFACT_RE.test(t)) return null;

  // Strip URLs
  t = t.replace(URL_RE, '');

  // Strip broken emoji (U+FFFD replacement character)
  t = t.replace(BROKEN_EMOJI_RE, '');

  // Strip laughter noise
  t = t.replace(LAUGHTER_RE, '');

  // Reduce repeated characters (3+ → 1)
  t = t.replace(REPEATED_CHAR_RE, '$1');

  // Reduce punctuation spam (3+ → single)
  t = t.replace(PUNCTUATION_SPAM_RE, '$1');

  // Normalize whitespace
  t = t.replace(WHITESPACE_RE, ' ').trim();

  if (!t) return null;

  // Drop pure gibberish (keyboard mash detection)
  const noSpace = t.replace(/ /g, '').toLowerCase();
  if (noSpace.length >= 5 && KEYBOARD_MASH_RE.test(noSpace)) {
    const vowels = [...noSpace].filter((c) => 'aeiou'.includes(c)).length;
    if (vowels / noSpace.length < 0.15) return null;
  }

  // Drop entries with fewer than 3 words after cleaning
  if (t.split(/\s+/).length < 3) return null;

  return t;
}
