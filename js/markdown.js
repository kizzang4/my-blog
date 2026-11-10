// 마크다운 → HTML 변환기. 블록 단위로 나눈 뒤 각 블록 안에서 인라인을 처리한다.
// 원문의 HTML은 해석하지 않고 모두 이스케이프한다.

const RE = {
  fence: /^ {0,3}(?:(`{3,})([^`]*)|(~{3,})(.*))$/,
  heading: /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  quote: /^ {0,3}>/,
  list: /^( *)([-*+]|\d{1,9}[.)])([ \t]+)(\S.*)$/,
  tableDelim: /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/,
};

const PLACEHOLDER = /\u0000(\d+)\u0000/g;

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text) => escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** 변환된 HTML 조각에서 태그를 떼어 내 대체 텍스트로 쓸 글자만 남긴다. */
const plainText = (html) => html
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

const expandTabs = (line) => line.replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, '    '));

/** javascript: 같은 위험한 스킴을 막는다. */
function sanitizeUrl(url) {
  const value = url.trim();
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !/^(https?|mailto|tel)$/i.test(scheme[1])) return '#';
  return value;
}

const isExternal = (url) => /^https?:\/\//i.test(url);

/** 본문 이미지의 상대 경로를 글 폴더 기준으로 바꾼다. */
function resolveImageSrc(src, baseUrl) {
  const url = sanitizeUrl(src);
  if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) return url;
  return baseUrl + url.replace(/^\.\//, '');
}

// ---------- 인라인 ----------

function renderInline(text, options) {
  const stash = [];
  const html = inline(text, stash, options);
  return restore(html, stash);
}

function restore(text, stash) {
  let out = text;
  while (/\u0000\d+\u0000/.test(out)) {
    out = out.replace(PLACEHOLDER, (_, index) => stash[Number(index)] ?? '');
  }
  return out;
}

function inline(text, stash, options) {
  // 이미 변환한 조각은 자리표시자로 바꿔 두고, 마지막에 되돌린다.
  const hold = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let out = text;

  // 코드 스팬이 가장 먼저. 안쪽 내용은 다른 문법을 해석하지 않는다.
  out = out.replace(/(?<!\\)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) =>
    hold(`<code>${escapeHtml(code.replace(/\n/g, ' ').trim())}</code>`));

  // 백슬래시 이스케이프
  out = out.replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, (_, ch) => hold(escapeHtml(ch)));

  // 이미지
  out = out.replace(/!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)/g, (_, alt, src, title) => {
    const attrs = [
      `src="${escapeAttr(resolveImageSrc(src, options.baseUrl))}"`,
      `alt="${escapeAttr(plainText(restore(alt, stash)))}"`,
      title ? `title="${escapeAttr(title)}"` : '',
      'loading="lazy"',
    ].filter(Boolean);
    return hold(`<img ${attrs.join(' ')}>`);
  });

  // 링크
  out = out.replace(/\[([^\]]+)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)/g, (_, label, href, title) => {
    const url = sanitizeUrl(href);
    const attrs = [
      `href="${escapeAttr(url)}"`,
      title ? `title="${escapeAttr(title)}"` : '',
      isExternal(url) ? 'target="_blank" rel="noopener noreferrer"' : '',
    ].filter(Boolean);
    return hold(`<a ${attrs.join(' ')}>${inline(label, stash, options)}</a>`);
  });

  out = escapeHtml(out);

  // 주소만 적은 링크
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<>"]*[^\s<>"'.,:;!?)\]])/g, (_, before, url) =>
    before + hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`));

  // 강조. 밑줄은 단어 중간(snake_case 등)에서는 동작하지 않게 한다.
  const edge = '[^\\p{L}\\p{N}_]';
  out = out
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(new RegExp(`(^|${edge})__(?=\\S)([\\s\\S]*?\\S)__(?![\\p{L}\\p{N}_])`, 'gu'), '$1<strong>$2</strong>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(new RegExp(`(^|${edge})_(?=\\S)([\\s\\S]*?\\S)_(?![\\p{L}\\p{N}_])`, 'gu'), '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');

  return out;
}

// ---------- 블록 ----------

function splitRow(row) {
  let cells = row.trim();
  if (cells.startsWith('|')) cells = cells.slice(1);
  if (cells.endsWith('|') && !cells.endsWith('\\|')) cells = cells.slice(0, -1);
  return cells.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function isTableStart(lines, index) {
  const header = lines[index];
  const delimiter = lines[index + 1];
  return Boolean(
    delimiter &&
    header.includes('|') &&
    delimiter.includes('|') &&
    RE.tableDelim.test(delimiter) &&
    splitRow(header).length === splitRow(delimiter).length,
  );
}

function startsBlock(line) {
  return RE.fence.test(line) || RE.heading.test(line) || RE.hr.test(line) || RE.quote.test(line);
}

/** 문단 도중에 새 블록이 시작되는지 확인한다. */
function interruptsParagraph(lines, index) {
  const line = lines[index];
  if (startsBlock(line)) return true;
  const item = expandTabs(line).match(RE.list);
  if (item && (!/^\d/.test(item[2]) || /^1[.)]$/.test(item[2]))) return true;
  return isTableStart(lines, index);
}

function renderFence(lines, start) {
  const open = lines[start].match(RE.fence);
  const fence = open[1] || open[3];
  const info = (open[2] ?? open[4] ?? '').trim().split(/\s+/)[0] || '';
  const lang = /^[\w+#.-]+$/.test(info) ? info : '';
  const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);

  const body = [];
  let i = start + 1;
  while (i < lines.length && !closing.test(lines[i])) {
    body.push(lines[i]);
    i += 1;
  }

  const className = lang ? ` class="language-${escapeAttr(lang)}"` : '';
  return {
    html: `<pre tabindex="0"><code${className}>${escapeHtml(body.join('\n'))}</code></pre>`,
    next: i + 1,
  };
}

function renderTable(lines, start, options) {
  const headers = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    return right ? 'right' : '';
  });

  const cell = (tag, text, index) => {
    const align = aligns[index] ? ` data-align="${aligns[index]}"` : '';
    return `<${tag}${align}>${renderInline(text, options)}</${tag}>`;
  };

  const head = headers.map((text, index) => cell('th', text, index)).join('');
  const rows = [];
  let i = start + 2;
  while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
    const cells = splitRow(lines[i]);
    rows.push(`<tr>${headers.map((_, index) => cell('td', cells[index] ?? '', index)).join('')}</tr>`);
    i += 1;
  }

  const body = rows.length ? `\n<tbody>\n${rows.join('\n')}\n</tbody>` : '';
  return {
    html: `<div class="table-wrap" tabindex="0"><table>\n<thead><tr>${head}</tr></thead>${body}\n</table></div>`,
    next: i,
  };
}

function renderListItem(itemLines, loose, options) {
  const task = itemLines[0].match(/^\[([ xX])\][ \t]+(.*)$/);
  const content = task ? [task[2], ...itemLines.slice(1)] : itemLines;
  const checkbox = task ? `<input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ` : '';
  const className = task ? ' class="task-item"' : '';
  return `<li${className}>${checkbox}${renderBlocks(content, options, !loose)}</li>`;
}

function renderList(lines, start, options) {
  const first = expandTabs(lines[start]).match(RE.list);
  const baseIndent = first[1].length;
  const ordered = /^\d/.test(first[2]);
  const sameList = (match) =>
    match && match[1].length === baseIndent && (ordered ? /^\d/.test(match[2]) : match[2] === first[2]);

  const items = [];
  let loose = false;
  let i = start;
  let done = false;

  while (i < lines.length && !done) {
    const match = expandTabs(lines[i]).match(RE.list);
    if (!sameList(match)) break;

    const contentIndent = match[1].length + match[2].length + Math.min(match[3].length, 4);
    const itemLines = [match[4]];
    i += 1;

    while (i < lines.length) {
      const line = expandTabs(lines[i]);

      if (!line.trim()) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j += 1;
        if (j >= lines.length) { i = j; done = true; break; }

        const after = expandTabs(lines[j]);
        const indent = after.match(/^ */)[0].length;
        if (indent > baseIndent) {
          // 빈 줄 뒤에도 같은 항목에 속하는 내용
          for (let k = i; k < j; k += 1) itemLines.push('');
          loose = true;
          i = j;
          continue;
        }
        if (sameList(after.match(RE.list))) {
          loose = true;
          i = j;
        } else {
          done = true;
        }
        break;
      }

      const indent = line.match(/^ */)[0].length;
      if (indent > baseIndent) {
        itemLines.push(line.slice(Math.min(indent, contentIndent)));
        i += 1;
        continue;
      }
      if (RE.list.test(line) || interruptsParagraph(lines, i)) break;

      // 들여쓰지 않고 이어 쓴 문장
      itemLines.push(line.trim());
      i += 1;
    }

    items.push(itemLines);
  }

  const tag = ordered ? 'ol' : 'ul';
  const startNumber = ordered ? parseInt(first[2], 10) : 1;
  const startAttr = ordered && startNumber !== 1 ? ` start="${startNumber}"` : '';
  const body = items.map((itemLines) => renderListItem(itemLines, loose, options)).join('\n');
  return { html: `<${tag}${startAttr}>\n${body}\n</${tag}>`, next: i };
}

function renderBlocks(lines, options, tight = false) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (RE.fence.test(line)) {
      const block = renderFence(lines, i);
      out.push(block.html);
      i = block.next;
      continue;
    }

    const heading = line.match(RE.heading);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim(), options)}</h${level}>`);
      i += 1;
      continue;
    }

    if (RE.hr.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    if (RE.quote.test(line)) {
      const inner = [];
      while (i < lines.length && lines[i].trim()) {
        if (RE.quote.test(lines[i])) inner.push(lines[i].replace(/^ {0,3}> ?/, ''));
        else if (!interruptsParagraph(lines, i)) inner.push(lines[i]);
        else break;
        i += 1;
      }
      out.push(`<blockquote>\n${renderBlocks(inner, options)}\n</blockquote>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      const block = renderTable(lines, i, options);
      out.push(block.html);
      i = block.next;
      continue;
    }

    if (RE.list.test(expandTabs(line))) {
      const block = renderList(lines, i, options);
      out.push(block.html);
      i = block.next;
      continue;
    }

    // 문단
    const buffer = [line.replace(/^\s+/, '')];
    i += 1;
    while (i < lines.length && lines[i].trim() && !interruptsParagraph(lines, i)) {
      buffer.push(lines[i].replace(/^\s+/, ''));
      i += 1;
    }
    buffer[buffer.length - 1] = buffer[buffer.length - 1].trimEnd();

    // 줄 끝 공백 두 칸이나 백슬래시는 강제 줄바꿈
    const html = renderInline(buffer.join('\n'), options).replace(/(?: {2,}|\\)\n/g, '<br>\n');
    out.push(tight ? html : `<p>${html}</p>`);
  }

  return out.join('\n');
}

/**
 * @param {string} source 마크다운 원문
 * @param {{ baseUrl?: string }} [options] baseUrl: 상대 경로 이미지 앞에 붙일 경로
 * @returns {string} HTML 문자열
 */
export function renderMarkdown(source, options = {}) {
  const text = String(source).replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
  return renderBlocks(text.split('\n'), { baseUrl: '', ...options });
}
