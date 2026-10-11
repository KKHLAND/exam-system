import { initializeApp, getApps } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, limit, query, setDoc } from 'firebase/firestore';
import { db, legacyStatusConfig } from './firebase';

// 1번 앱(시험 현황 자동화)의 기존 데이터 이전
//   elective-70356 / school_data/*  →  test-e7132 / school_data/*
// 기존 프로젝트는 읽기만 하며 원본은 그대로 남습니다.
export const STATUS_COLLECTION = 'school_data';

const legacyDb = () => {
  const app = getApps().find((a) => a.name === 'legacy-status') || initializeApp(legacyStatusConfig, 'legacy-status');
  return getFirestore(app);
};

export const hasStatusData = async () => {
  const snap = await getDocs(query(collection(db, STATUS_COLLECTION), limit(1)));
  return !snap.empty;
};

export const importLegacyStatusData = async (onProgress?: (done: number, total: number, id: string) => void) => {
  const snap = await getDocs(collection(legacyDb(), STATUS_COLLECTION));
  const total = snap.size;
  let done = 0;
  for (const d of snap.docs) {
    await setDoc(doc(db, STATUS_COLLECTION, d.id), d.data());
    done += 1;
    onProgress?.(done, total, d.id);
  }
  return snap.docs.map((d) => d.id);
};
