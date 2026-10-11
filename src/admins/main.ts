import { addAdmin, EMAIL_RE, listAdmins, removeAdmin, type AdminMember } from '../shared/admins';
import { DEFAULT_ADMINS, getAuthState } from '../shared/auth';
import { mountNav, requireAdmin } from '../shared/nav';

// 관리자 구성원 관리 (기본 관리자 전용)
const CSS = `
body{margin:0;background:#f4f6f9;color:#1e293b;font-family:'Pretendard','Noto Sans KR','Malgun Gothic',system-ui,sans-serif}
.am-wrap{max-width:760px;margin:32px auto;padding:0 16px}
.am-card{background:#fff;border:1px solid #dbe5f0;border-radius:16px;padding:24px;box-shadow:0 8px 30px rgba(15,47,87,.06);margin-bottom:20px}
.am-card h1{font-size:22px;margin:0 0 6px}
.am-card h2{font-size:16px;margin:0 0 14px}
.am-desc{color:#64748b;font-size:14px;line-height:1.6;margin:0}
.am-form{display:flex;gap:8px;flex-wrap:wrap}
.am-form input{flex:1 1 200px;min-width:0;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;font-size:14px}
.am-form input:focus{outline:2px solid #2f80d6;border-color:transparent}
.am-btn{background:#0f2f57;color:#fff;border:0;border-radius:10px;padding:10px 18px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.am-btn:disabled{opacity:.5;cursor:default}
.am-del{background:#fff;color:#be123c;border:1px solid #fecdd3;border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.am-del:hover{background:#fff1f2}
.am-msg{margin-top:10px;font-size:13px;font-weight:600;min-height:18px}
.am-msg.err{color:#be123c}.am-msg.ok{color:#047857}
.am-table{width:100%;border-collapse:collapse;font-size:14px}
.am-table th{text-align:left;color:#64748b;font-weight:600;font-size:12px;padding:8px;border-bottom:1px solid #e2e8f0}
.am-table td{padding:10px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.am-table td:last-child{text-align:right}
.am-sub{color:#94a3b8;font-size:12px}
.am-badge{display:inline-block;background:#e0edff;color:#0f2f57;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;margin-left:6px}
@media (max-width:560px){.am-table .am-hide{display:none}}
`;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmt = (d: Date | null) => (d ? d.toLocaleDateString('ko-KR') : '-');

const start = () => {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.getElementById('root')!;
  root.innerHTML = `
    <div class="am-wrap">
      <div class="am-card">
        <h1>관리자 구성원</h1>
        <p class="am-desc">여기에 등록한 구글 계정만 관리자 로그인이 됩니다. 관리자는 시험 데이터 등록·수정과 시험 현황 자동화, 응시현황표·자리배치표 메뉴를 사용할 수 있습니다.<br>구성원 추가·삭제는 기본 관리자만 할 수 있습니다.</p>
      </div>
      <div class="am-card">
        <h2>관리자 추가</h2>
        <form class="am-form" id="am-form">
          <input id="am-email" type="email" placeholder="구글 이메일 (예: teacher@gmail.com)" autocomplete="off" required />
          <input id="am-name" type="text" placeholder="이름 (예: 홍길동)" autocomplete="off" />
          <button class="am-btn" type="submit" id="am-add">추가</button>
        </form>
        <div class="am-msg" id="am-msg"></div>
      </div>
      <div class="am-card">
        <h2>등록된 관리자 <span class="am-sub" id="am-count"></span></h2>
        <table class="am-table">
          <thead><tr><th>이메일</th><th>이름</th><th class="am-hide">추가일</th><th></th></tr></thead>
          <tbody id="am-list"><tr><td colspan="4" class="am-sub">불러오는 중…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const form = root.querySelector<HTMLFormElement>('#am-form')!;
  const emailInput = root.querySelector<HTMLInputElement>('#am-email')!;
  const nameInput = root.querySelector<HTMLInputElement>('#am-name')!;
  const addBtn = root.querySelector<HTMLButtonElement>('#am-add')!;
  const msg = root.querySelector<HTMLDivElement>('#am-msg')!;
  const list = root.querySelector<HTMLTableSectionElement>('#am-list')!;
  const count = root.querySelector<HTMLSpanElement>('#am-count')!;
  let members: AdminMember[] = [];

  const setMsg = (text: string, kind: 'ok' | 'err' | '' = '') => {
    msg.textContent = text;
    msg.className = `am-msg ${kind}`;
  };

  const render = () => {
    const defaults = DEFAULT_ADMINS.map(
      (email) =>
        `<tr><td>${esc(email)}<span class="am-badge">기본 관리자</span></td><td class="am-sub">-</td><td class="am-hide am-sub">-</td><td></td></tr>`,
    );
    const rows = members
      .filter((m) => !DEFAULT_ADMINS.includes(m.email))
      .map(
        (m) =>
          `<tr><td>${esc(m.email)}</td><td>${esc(m.name) || '<span class="am-sub">-</span>'}</td><td class="am-hide am-sub">${fmt(m.addedAt)}</td><td><button class="am-del" data-email="${esc(m.email)}">삭제</button></td></tr>`,
      );
    list.innerHTML = [...defaults, ...rows].join('');
    count.textContent = `(${defaults.length + rows.length}명)`;
  };

  const load = async () => {
    try {
      members = await listAdmins();
      render();
    } catch (e: any) {
      list.innerHTML = `<tr><td colspan="4" class="am-msg err">목록을 불러오지 못했습니다: ${esc(e.message)}<br><span class="am-sub">Firestore 규칙이 최신(firestore.rules)으로 게시되었는지 확인하세요.</span></td></tr>`;
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const name = nameInput.value.trim();
    if (!EMAIL_RE.test(email)) return setMsg('이메일 형식이 올바르지 않습니다.', 'err');
    if (DEFAULT_ADMINS.includes(email) || members.some((m) => m.email === email))
      return setMsg('이미 등록된 관리자입니다.', 'err');
    addBtn.disabled = true;
    setMsg('추가하는 중…');
    try {
      await addAdmin(email, name, getAuthState().user?.email || '');
      form.reset();
      setMsg(`${email} 계정을 관리자로 추가했습니다.`, 'ok');
      await load();
    } catch (err: any) {
      setMsg('추가 실패: ' + err.message, 'err');
    } finally {
      addBtn.disabled = false;
    }
  });

  list.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-email]');
    if (!btn) return;
    const email = btn.dataset.email!;
    if (!confirm(`${email} 계정의 관리자 권한을 삭제할까요?\n삭제하면 바로 관리자 메뉴를 사용할 수 없습니다.`)) return;
    btn.disabled = true;
    try {
      await removeAdmin(email);
      setMsg(`${email} 계정을 관리자에서 삭제했습니다.`, 'ok');
      await load();
    } catch (err: any) {
      btn.disabled = false;
      setMsg('삭제 실패: ' + err.message, 'err');
    }
  });

  load();
};

mountNav('admins');
requireAdmin(document.getElementById('root')!, start, { superOnly: true });
