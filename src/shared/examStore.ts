import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// 시험 데이터의 단일 원본: timetable_config 컬렉션 (2번 시간표 앱 형식)
//   timetable_config/data_{학년도}_{학기}_{midterm|final}_{학년}
//     metadata, parsedDataJson(행 배열: 학번·이름·날짜·교시·과목·코드·고사실·지도교사 …),
//     headerInputs, timeSlots, studentCount, rowCount, hasSourceCodes, hasSourceLocations …
//   timetable_config/active  → catalog(등록 목록), defaultMetadata, logoSrc
// 응시현황표·자리배치표 페이지도 이 데이터를 그대로 읽고 씁니다.

export const COLLECTION = 'timetable_config';
export const GRADES = ['1', '2', '3'];

export type Row = Record<string, string>;
export type ExamMeta = { year: string; semester: string; examType: string; grade: string };

// '중간고사' / '기말고사' / 'midterm' / 'final' → 'midterm' | 'final'
export const toExamKey = (examType: string) =>
  examType === 'midterm' || String(examType).includes('중간') ? 'midterm' : 'final';
export const toExamLabel = (examType: string) => (toExamKey(examType) === 'midterm' ? '중간고사' : '기말고사');

export const gradeDocId = (m: ExamMeta) =>
  `data_${m.year}_${m.semester}_${toExamKey(m.examType)}_${m.grade}`;

const nowText = () =>
  new Date().toLocaleDateString('ko-KR') +
  ' ' +
  new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

const slotDateValue = (date: string) => new Date(date.split('(')[0].replace(/\//g, '-')).getTime();

// 2번 앱(updateAdminParsedForTarget)과 같은 방식으로 교시 슬롯 계산
export const computeTimeSlots = (rows: Row[]) => {
  const keys = new Set<string>();
  rows.forEach((r) => {
    if (r.날짜 && String(r.교시 ?? '').trim()) keys.add(`${r.날짜}|${r.교시}`);
  });
  return Array.from(keys)
    .map((k) => {
      const [date, p] = k.split('|');
      const period = parseInt(p, 10);
      return !isNaN(period) && date ? { date, period } : null;
    })
    .filter((s): s is { date: string; period: number } => !!s)
    .sort((a, b) => slotDateValue(a.date) - slotDateValue(b.date) || a.period - b.period);
};

export const loadGradeDoc = async (m: ExamMeta) => {
  const snap = await getDoc(doc(db, COLLECTION, gradeDocId(m)));
  if (!snap.exists()) return null;
  const data = snap.data();
  let rows: Row[] = [];
  try {
    rows = JSON.parse(data.parsedDataJson || '[]');
  } catch {
    rows = [];
  }
  return { data, rows };
};

const updateCatalog = async (m: ExamMeta, item: Record<string, unknown> | null) => {
  const activeRef = doc(db, COLLECTION, 'active');
  const snap = await getDoc(activeRef);
  const catalog: any[] = (snap.exists() && Array.isArray(snap.data().catalog) ? snap.data().catalog : []).filter(
    (c: any) => c.id !== gradeDocId(m),
  );
  const next = item ? [item, ...catalog] : catalog;
  await setDoc(activeRef, { catalog: next, updatedAt: serverTimestamp() }, { merge: true });
};

// 학년 단위 저장: 기존 교시별 시간·비고(headerInputs)는 보존하고 슬롯·통계·카탈로그를 갱신
export const saveGradeRows = async (m: ExamMeta, rows: Row[], fileName?: string) => {
  const meta: ExamMeta = { year: String(m.year), semester: String(m.semester), examType: toExamKey(m.examType), grade: String(m.grade) };
  if (rows.length === 0) {
    await deleteGradeDoc(meta);
    return;
  }
  const existing = await loadGradeDoc(meta);
  const prevInputs: Record<string, any> = existing?.data.headerInputs || {};
  const timeSlots = computeTimeSlots(rows);
  const subjectsBySlot: Record<string, Set<string>> = {};
  rows.forEach((r) => {
    const key = `${r.날짜}|${r.교시}`;
    (subjectsBySlot[key] ||= new Set()).add(r.과목);
  });
  const headerInputs = timeSlots.reduce<Record<string, any>>((acc, s) => {
    const key = `${s.date}|${s.period}`;
    acc[key] = prevInputs[key] || {
      subject: Array.from(subjectsBySlot[key] || []).join(', ').replace(/\s*\(.*?\)\s*/g, '').trim(),
      time: '',
      code: '',
      location: '',
      notes: '',
    };
    return acc;
  }, {});
  const sample = rows.find((r) => r.학번) || rows[0];
  const studentCount = new Set(rows.map((r) => r.학번)).size;
  const id = gradeDocId(meta);
  const text = nowText();
  const name = fileName || existing?.data.fileName || '응시현황표 페이지에서 편집';

  await setDoc(doc(db, COLLECTION, id), {
    id,
    metadata: meta,
    parsedDataJson: JSON.stringify(rows),
    headerInputs,
    timeSlots,
    fileName: name,
    studentCount,
    rowCount: rows.length,
    hasSourceCodes: !!sample && String(sample['코드'] || '').trim() !== '',
    hasSourceLocations: !!sample && String(sample['고사실'] || '').trim() !== '',
    updatedAt: serverTimestamp(),
    updatedAtText: text,
  });
  await updateCatalog(meta, {
    id,
    year: meta.year,
    semester: meta.semester,
    examType: meta.examType,
    grade: meta.grade,
    studentCount,
    rowCount: rows.length,
    fileName: name,
    updatedAtText: text,
  });
};

export const deleteGradeDoc = async (m: ExamMeta) => {
  await deleteDoc(doc(db, COLLECTION, gradeDocId(m)));
  await updateCatalog(m, null);
};

// active 문서의 공통 설정(로고, 기본 학사 정보)
export const loadActive = async () => {
  const snap = await getDoc(doc(db, COLLECTION, 'active'));
  return snap.exists() ? snap.data() : null;
};

export const saveActive = (patch: Record<string, unknown>) =>
  setDoc(doc(db, COLLECTION, 'active'), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
