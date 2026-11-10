import { initTheme } from './theme.js';
import { onRouteChange, postHref } from './router.js';
import { parseFrontmatter } from './frontmatter.js';
import { renderMarkdown } from './markdown.js';

const SITE_TITLE = document.title;
const POSTS_DIR = 'posts/';

const app = document.getElementById('app');

let indexPromise = null;
let renderToken = 0;
let isFirstRender = true;

const dateFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

// ---------- 데이터 ----------

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${url})`);
  return response.text();
}

function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetchText(`${POSTS_DIR}index.json`)
      .then((text) => JSON.parse(text))
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }
  return indexPromise;
}

// ---------- DOM 도우미 ----------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function dateElement(date) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  const label = Number.isNaN(parsed.getTime()) ? String(date) : dateFormat.format(parsed);
  return el('time', { datetime: date, text: label });
}

function tagList(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  return el(
    'ul',
    { class: 'tag-list', 'aria-label': '태그' },
    ...tags.map((tag) => el('li', { class: 'tag', text: tag })),
  );
}

function statusView(message, { withHomeLink = true } = {}) {
  const nodes = [el('p', { class: 'status', text: message })];
  if (withHomeLink) {
    nodes.push(el('p', { class: 'status' }, el('a', { href: '#/', text: '← 목록으로 돌아가기' })));
  }
  return nodes;
}

// ---------- 화면 ----------

async function buildHomeView() {
  const posts = await loadIndex();
  const sorted = [...posts].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const heading = el('h1', { class: 'page-title', text: '최근 글' });
  if (sorted.length === 0) {
    return { title: null, nodes: [heading, el('p', { class: 'status', text: '아직 작성된 글이 없습니다.' })] };
  }

  const items = sorted.map((post) => {
    const meta = el('div', { class: 'post-meta' }, dateElement(post.date), tagList(post.tags));
    return el(
      'li',
      { class: 'post-card' },
      el('h2', { class: 'post-card__title' }, el('a', { href: postHref(post.slug), text: post.title || post.slug })),
      post.summary ? el('p', { class: 'post-card__summary', text: post.summary }) : null,
      meta,
    );
  });

  return { title: null, nodes: [heading, el('ul', { class: 'post-list' }, ...items)] };
}

async function buildPostView(slug) {
  const posts = await loadIndex();
  const entry = posts.find((post) => post.slug === slug);
  if (!entry) {
    return { title: '글을 찾을 수 없습니다', nodes: statusView('요청한 글을 찾을 수 없습니다.') };
  }

  const raw = await fetchText(`${POSTS_DIR}${encodeURIComponent(slug)}.md`);
  const { data, content } = parseFrontmatter(raw);
  const meta = { ...entry, ...data };
  const title = meta.title || slug;

  const header = el(
    'header',
    { class: 'post__header' },
    el('h1', { class: 'post__title', text: title }),
    el('div', { class: 'post-meta' }, dateElement(meta.date), tagList(meta.tags)),
  );
  const body = el('div', { class: 'prose' });
  body.innerHTML = renderMarkdown(content, { baseUrl: POSTS_DIR });

  const back = el('a', { class: 'back-link', href: '#/' }, el('span', { 'aria-hidden': 'true', text: '←' }), '목록으로');
  return { title, nodes: [back, el('article', { class: 'post' }, header, body)] };
}

async function render(route) {
  const token = ++renderToken;
  app.setAttribute('aria-busy', 'true');

  let view;
  try {
    view = route.name === 'post' ? await buildPostView(route.slug) : await buildHomeView();
  } catch (error) {
    console.error(error);
    view = { title: '오류', nodes: statusView('글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.') };
  }

  // 더 새로운 이동이 시작됐다면 이 결과는 버린다.
  if (token !== renderToken) return;

  app.replaceChildren(...view.nodes);
  app.removeAttribute('aria-busy');
  document.title = view.title ? `${view.title} · ${SITE_TITLE}` : SITE_TITLE;

  if (!isFirstRender) {
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }
  isFirstRender = false;
}

// ---------- 시작 ----------

initTheme(document.getElementById('theme-toggle'));
document.getElementById('year').textContent = new Date().getFullYear();
onRouteChange(render);
