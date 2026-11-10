// 글 맨 위의 --- 로 둘러싼 메타데이터를 읽는다.
// 지원 범위: `key: value` 한 줄 형식, 따옴표 문자열, [a, b] 형태의 배열.

function parseValue(raw) {
  const value = raw.trim();

  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => parseValue(item))
      .filter((item) => item !== '');
  }

  const quoted = value.match(/^(["'])(.*)\1$/);
  return quoted ? quoted[2] : value;
}

/**
 * @param {string} text 마크다운 파일 전체
 * @returns {{ data: Record<string, string | string[]>, content: string }}
 */
export function parseFrontmatter(text) {
  const source = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = source.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!match) return { data: {}, content: source };

  const data = {};
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([\w-]+)[ \t]*:[ \t]*(.*)$/);
    if (pair) data[pair[1]] = parseValue(pair[2]);
  }

  return { data, content: source.slice(match[0].length) };
}
