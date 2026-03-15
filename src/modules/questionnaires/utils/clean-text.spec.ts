import { cleanText } from './clean-text';

describe('cleanText', () => {
  it('should return cleaned text for valid input', () => {
    expect(cleanText('This is a valid feedback comment')).toBe(
      'This is a valid feedback comment',
    );
  });

  it('should return null for empty string', () => {
    expect(cleanText('')).toBeNull();
    expect(cleanText('   ')).toBeNull();
  });

  it('should return null for Excel artifacts', () => {
    expect(cleanText('#NAME?')).toBeNull();
    expect(cleanText('#VALUE!')).toBeNull();
    expect(cleanText('#REF!')).toBeNull();
    expect(cleanText('#DIV/0!')).toBeNull();
    expect(cleanText('#NULL!')).toBeNull();
    expect(cleanText('#NUM!')).toBeNull();
    expect(cleanText('#N/A')).toBeNull();
  });

  it('should strip URLs', () => {
    expect(
      cleanText('Check this out https://example.com and this is good feedback'),
    ).toBe('Check this out and this is good feedback');
  });

  it('should strip broken emoji (U+FFFD)', () => {
    expect(cleanText('Good professor \ufffd\ufffd very nice')).toBe(
      'Good professor very nice',
    );
  });

  it('should strip laughter noise', () => {
    expect(cleanText('hahaha the professor is good lol')).toBe(
      'the professor is good',
    );
    expect(cleanText('hehehehe very funny lmao teacher')).toBe(
      'very funny teacher',
    );
  });

  it('should reduce repeated characters (3+ → 1)', () => {
    expect(cleanText('sooooo goooood the best professor')).toBe(
      'so god the best professor',
    );
  });

  it('should reduce punctuation spam (3+ → single)', () => {
    expect(cleanText('Great professor!!! Very good!!!')).toBe(
      'Great professor! Very good!',
    );
    expect(cleanText('What??? Why is this???')).toBe('What? Why is this?');
  });

  it('should normalize whitespace', () => {
    expect(cleanText('Too   many   spaces   in   here')).toBe(
      'Too many spaces in here',
    );
  });

  it('should return null for keyboard mash with low vowel ratio', () => {
    expect(cleanText('asdfghjkl qwerty zxcvbn')).toBeNull();
  });

  it('should keep valid short words that look like keyboard patterns but have vowels', () => {
    // "maayo kaayo siya" is Cebuano — high vowel ratio
    expect(cleanText('maayo kaayo siya')).toBe('maayo kaayo siya');
  });

  it('should return null for entries with fewer than 3 words', () => {
    expect(cleanText('ok good')).toBeNull();
    expect(cleanText('nice')).toBeNull();
  });

  it('should keep entries with exactly 3 words', () => {
    expect(cleanText('very good professor')).toBe('very good professor');
  });

  it('should handle combined cleaning operations', () => {
    expect(cleanText('hahaha this is sooooo good!!! https://example.com')).toBe(
      'this is so good!',
    );
    // ^ 4 words after cleaning — passes 3-word minimum
  });

  it('should return null when text becomes too short after cleaning', () => {
    expect(cleanText('hahaha lol lmao')).toBeNull();
  });
});
