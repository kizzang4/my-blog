// 다크 모드. 처음에는 시스템 설정을 따르고, 사용자가 고르면 그 값을 저장한다.
// 첫 화면의 테마는 index.html 안의 인라인 스크립트가 먼저 정해 둔다.

const STORAGE_KEY = 'theme';
const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장이 막힌 환경에서는 이번 방문에만 적용한다.
  }
}

function applyTheme(theme, button) {
  root.dataset.theme = theme;

  const label = theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환';
  button.setAttribute('aria-label', label);
  button.title = label;

  // 모바일 브라우저 주소창 색을 배경색과 맞춘다.
  const background = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}

export function initTheme(button) {
  const initial = root.dataset.theme || readStoredTheme() || (systemDark.matches ? 'dark' : 'light');
  applyTheme(initial, button);

  button.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, button);
    storeTheme(next);
  });

  // 저장된 선택이 없을 때만 시스템 설정 변경을 따라간다.
  systemDark.addEventListener('change', (event) => {
    if (!readStoredTheme()) applyTheme(event.matches ? 'dark' : 'light', button);
  });
}
