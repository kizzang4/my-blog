// 해시 기반 라우터. #/ 는 목록, #/post/<slug> 는 글 상세.

export function parseRoute(hash = location.hash) {
  const path = hash.replace(/^#\/?/, '');
  const match = path.match(/^post\/([^/?#]+)/);

  if (match) {
    try {
      return { name: 'post', slug: decodeURIComponent(match[1]) };
    } catch {
      return { name: 'post', slug: '' };
    }
  }
  return { name: 'home' };
}

export const postHref = (slug) => `#/post/${encodeURIComponent(slug)}`;

/** 처음 한 번 실행하고, 이후 주소가 바뀔 때마다 handler를 호출한다. */
export function onRouteChange(handler) {
  const run = () => handler(parseRoute());
  window.addEventListener('hashchange', run);
  run();
}
