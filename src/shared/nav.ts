import { loginAdmin, logoutAdmin, subscribeAuth, whenAuthReady, type AuthState } from './auth';

// 세 페이지 공통 상단바: 시스템 제목 + 메뉴 탭 + 관리자 로그인.
// 각 앱의 Tailwind/CSS와 섞이지 않도록 wmx- 접두사의 독립 스타일을 사용합니다.
type PageKey = 'timetable' | 'status' | 'docs' | 'admins';

const PAGES: { key: PageKey; href: string; label: string; adminOnly: boolean; superOnly?: boolean }[] = [
  { key: 'timetable', href: '/', label: '시험 시간표', adminOnly: false },
  { key: 'status', href: '/status/', label: '시험 현황 자동화', adminOnly: true },
  { key: 'docs', href: '/docs/', label: '응시현황표·자리배치표', adminOnly: true },
  { key: 'admins', href: '/admins/', label: '관리자 구성원', adminOnly: true, superOnly: true },
];

const CSS = `
.wmx-bar{position:relative;z-index:60;background:#0f2f57;color:#fff;font-family:'Pretendard','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;font-size:14px;line-height:1.4;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.wmx-in{max-width:1280px;margin:0 auto;padding:0 16px;display:flex;align-items:center;gap:16px;min-height:48px;flex-wrap:wrap}
.wmx-title{font-weight:800;letter-spacing:-.01em;white-space:nowrap;color:#fff;text-decoration:none;font-size:15px}
.wmx-tabs{display:flex;gap:4px;flex:1;flex-wrap:wrap}
.wmx-tab{color:#c9dbf3;text-decoration:none;padding:6px 12px;border-radius:8px;font-weight:600;white-space:nowrap}
.wmx-tab:hover{background:rgba(255,255,255,.1);color:#fff}
.wmx-tab.on{background:#fff;color:#0f2f57}
.wmx-tab .wmx-lock{font-size:11px;opacity:.7;margin-left:4px}
.wmx-user{display:flex;align-items:center;gap:8px;white-space:nowrap}
.wmx-email{color:#c9dbf3;font-size:12px}
.wmx-btn{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.45);border-radius:8px;padding:5px 12px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit}
.wmx-btn:hover{background:rgba(255,255,255,.12)}
.wmx-btn.primary{background:#fff;color:#0f2f57;border-color:#fff}
.wmx-gate{min-height:70vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Pretendard','Noto Sans KR','Malgun Gothic',system-ui,sans-serif}
.wmx-card{background:#fff;border:1px solid #dbe5f0;border-radius:16px;padding:32px;max-width:420px;width:100%;text-align:center;box-shadow:0 8px 30px rgba(15,47,87,.08);color:#1e293b}
.wmx-card h2{margin:0 0 8px;font-size:20px}
.wmx-card p{margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.6}
.wmx-card .wmx-btn{color:#0f2f57;border-color:#0f2f57;padding:9px 18px;font-size:14px;margin:0 4px}
.wmx-card .wmx-btn.primary{background:#0f2f57;color:#fff}
@media print{.wmx-bar,.wmx-gate{display:none!important}}
`;

const injectStyle = () => {
  if (document.getElementById('wmx-style')) return;
  const style = document.createElement('style');
  style.id = 'wmx-style';
  style.textContent = CSS;
  document.head.appendChild(style);
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const renderBar = (bar: HTMLElement, current: PageKey, s: AuthState) => {
  const tabs = PAGES.filter((p) => (!p.adminOnly || s.isAdmin) && (!p.superOnly || s.isSuperAdmin))
    .map(
      (p) =>
        `<a class="wmx-tab${p.key === current ? ' on' : ''}" href="${p.href}">${p.label}${p.adminOnly ? '<span class="wmx-lock">관리자</span>' : ''}</a>`,
    )
    .join('');
  const user = !s.ready
    ? ''
    : s.user && s.isAdmin
      ? `<span class="wmx-email">${escapeHtml(s.user.email || '')}</span><button class="wmx-btn" data-act="logout">로그아웃</button>`
      : '';
  bar.innerHTML = `<div class="wmx-in"><a class="wmx-title" href="/">원묵고 정기고사 관리 시스템</a><nav class="wmx-tabs">${tabs}</nav><div class="wmx-user">${user}</div></div>`;
};

export const mountNav = (current: PageKey) => {
  injectStyle();
  const bar = document.createElement('div');
  bar.className = 'wmx-bar';
  document.body.prepend(bar);
  bar.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
    if (act === 'login') {
      try {
        await loginAdmin();
      } catch (err: any) {
        if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
          alert('로그인 실패: ' + (err?.message || err));
        }
      }
    } else if (act === 'logout') {
      await logoutAdmin();
      // 관리자 전용 페이지에서 로그아웃하면 시간표 페이지로 이동
      if (PAGES.find((p) => p.key === current)?.adminOnly) location.href = '/';
    }
  });
  subscribeAuth((s) => renderBar(bar, current, s));
};

// 관리자 전용 페이지 보호: 관리자 확인 전까지 앱을 시작하지 않고 로그인 안내를 표시합니다.
// (화면 차단용이며, 데이터 보호는 firestore.rules가 담당)
export const requireAdmin = async (container: HTMLElement, start: () => void, opts: { superOnly?: boolean } = {}) => {
  injectStyle();
  const s = await whenAuthReady();
  if (opts.superOnly ? s.isSuperAdmin : s.isAdmin) {
    start();
    return;
  }
  container.style.display = 'none';
  const gate = document.createElement('div');
  gate.className = 'wmx-gate';
  gate.innerHTML = `<div class="wmx-card"><h2>관리자 전용 메뉴입니다</h2><p>${opts.superOnly ? '이 메뉴는 기본 관리자만 사용할 수 있습니다.' : '이 메뉴는 관리자 계정으로 로그인해야 사용할 수 있습니다.'}<br>일반 교사는 시험 시간표 메뉴를 이용해 주세요.</p><button class="wmx-btn primary" data-act="login">관리자 로그인</button><a class="wmx-btn" href="/" style="text-decoration:none;display:inline-block">시험 시간표로 이동</a></div>`;
  container.after(gate);
  gate.querySelector('[data-act="login"]')!.addEventListener('click', async () => {
    try {
      if (await loginAdmin()) location.reload();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') alert('로그인 실패: ' + (err?.message || err));
    }
  });
};
