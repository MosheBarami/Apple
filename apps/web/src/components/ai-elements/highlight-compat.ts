// Local stand-in for the part of `shiki` that AI Elements' CodeBlock uses: its language and token
// types, and a tokenizer that returns lines of tokens.
//
// The tokens come from lib/highlight.ts, the app's own scanner for the six languages the product
// actually emits (Luau, Lua, TypeScript, JavaScript, JSON, plain text). Two properties carry over
// from it and are why it is used instead of a grammar engine:
//   * the tokens rejoin to the source byte for byte (tests/code-presentation.test.mjs), so what is
//     highlighted is exactly the code that gets copied and run;
//   * they are plain data, rendered by the component as React children — no HTML string is ever
//     produced, so there is nothing to escape and nothing that could be interpreted as markup.
// Colour comes from a class per token kind (`tok tok--kw`, …) whose values are the app's
// `--syntax-*` tokens in both themes, rather than from a theme baked into inline styles.
//
// AND SHIKI'S `diff` LANGUAGE. AI Elements has no diff component; the upstream way to show a
// unified diff is CodeBlock with `language="diff"`, which shiki's diff grammar colours line by line
// (inserted, deleted, hunk header). The same is done here, from the line's first character, so an
// added line and a removed one stay distinguishable by more than colour — the sigil is kept — and
// in both themes (the colours are --good / --bad, which system.css defines for each).
import type { CodeLanguage } from '../../lib/generative-ui/schema.ts';
import { normaliseLanguage, tokenize, type TokenKind } from '../../lib/highlight';

/** The languages this app can highlight. Anything else is shown as plain text, never guessed at. */
export type BundledLanguage = CodeLanguage | 'diff';

/** What a line of a unified diff is, as shiki's diff grammar scopes it. */
export type DiffTokenKind = 'ins' | 'del' | 'hunk';

export interface ThemedToken {
  content: string;
  /** The scanner's classification; `plain` carries no colour of its own. */
  kind?: TokenKind | DiffTokenKind;
  color?: string;
  bgColor?: string;
  fontStyle?: number;
  htmlStyle?: Record<string, string>;
}

export interface TokensResult {
  tokens: ThemedToken[][];
  fg?: string;
  bg?: string;
}

/**
 * The source as lines of tokens. A token that spans a newline (a block comment, a long string) is
 * split at it, so each line holds only its own text and the lines rejoin with "\n" to the source.
 */
export function codeToTokens(code: string, language: string): TokensResult {
  if (language === 'diff') return diffToTokens(code);
  const lines: ThemedToken[][] = [[]];
  for (const token of tokenize(code, normaliseLanguage(language))) {
    const pieces = token.text.split('\n');
    pieces.forEach((piece, index) => {
      if (index > 0) lines.push([]);
      if (piece !== '') lines[lines.length - 1]!.push({ content: piece, kind: token.kind });
    });
  }
  return { tokens: lines };
}

/**
 * One token per line of a unified diff, classified by its first character: `+` inserted, `-`
 * deleted, `@@` a hunk header, anything else context (no colour). The text is the line itself,
 * sigil included, so the lines still rejoin with "\n" to the source byte for byte.
 */
function diffToTokens(code: string): TokensResult {
  return {
    tokens: code.split('\n').map((line): ThemedToken[] => {
      if (line === '') return [];
      const kind: DiffTokenKind | undefined = line.startsWith('@@')
        ? 'hunk'
        : line.startsWith('+')
          ? 'ins'
          : line.startsWith('-')
            ? 'del'
            : undefined;
      return [{ content: line, kind }];
    }),
  };
}
