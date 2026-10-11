import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

// 관리자 판별: Firestore exam_admins/{이메일} 문서가 있으면 관리자.
// 실제 접근 통제는 firestore.rules가 담당하며, 여기서는 화면 표시 여부만 결정합니다.
export type AuthState = { ready: boolean; user: User | null; isAdmin: boolean };

let state: AuthState = { ready: false, user: null, isAdmin: false };
const listeners = new Set<(s: AuthState) => void>();

const emit = (next: AuthState) => {
  state = next;
  listeners.forEach((fn) => fn(state));
};

// 기본 관리자: exam_admins 문서 없이도 관리자 (firestore.rules의 isExamAdmin()과 같게 유지)
export const DEFAULT_ADMINS = ['kkhland@gmail.com'];

const checkAdmin = async (user: User | null) => {
  if (!user?.email) return false;
  if (user.emailVerified && DEFAULT_ADMINS.includes(user.email.toLowerCase())) return true;
  try {
    const snap = await getDoc(doc(db, 'exam_admins', user.email.toLowerCase()));
    return snap.exists();
  } catch {
    return false;
  }
};

onAuthStateChanged(auth, async (user) => {
  const isAdmin = await checkAdmin(user);
  emit({ ready: true, user, isAdmin });
});

export const getAuthState = () => state;

export const subscribeAuth = (fn: (s: AuthState) => void) => {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
};

// 첫 인증 상태가 확정될 때까지 대기
export const whenAuthReady = () =>
  new Promise<AuthState>((resolve) => {
    if (state.ready) return resolve(state);
    const off = subscribeAuth((s) => {
      if (s.ready) {
        off();
        resolve(s);
      }
    });
  });

export const loginAdmin = async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  const isAdmin = await checkAdmin(cred.user);
  emit({ ready: true, user: cred.user, isAdmin });
  if (!isAdmin) {
    alert(`${cred.user.email} 계정은 관리자로 등록되어 있지 않습니다.\n관리자 등록이 필요하면 시스템 관리자에게 문의하세요.`);
    await signOut(auth);
  }
  return isAdmin;
};

export const logoutAdmin = () => signOut(auth);
