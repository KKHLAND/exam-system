// 응시현황표·자리배치표 데이터 어댑터
// 예전에는 exams/{학년도}_{학기}_{고사} 문서에 따로 저장했지만, 통합 후에는
// 시험 시간표와 같은 timetable_config 학년별 문서를 읽고 씁니다(examStore).
// main.js가 쓰는 함수 이름·반환 형식은 그대로 유지합니다.
import {
  GRADES,
  deleteGradeDoc,
  loadActive,
  loadGradeDoc,
  saveActive,
  saveGradeRows,
  toExamKey,
  toExamLabel,
} from "../shared/examStore";

const withTimeout = (promise, timeoutMs = 10000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("파이어베이스 서버 응답 시간 초과 (10초). 네트워크 상태를 확인해주세요.")), timeoutMs),
    ),
  ]);

const pick = (row, keys) => {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

// 시간표 행(엑셀 헤더 기준) → 응시현황표 학생 객체
const rowToStudent = (row) => {
  const studentId = pick(row, ["학번"]);
  const name = pick(row, ["이름", "성명"]);
  const date = pick(row, ["날짜"]);
  const period = pick(row, ["교시"]);
  const subjectBase = pick(row, ["과목"]);
  const code = pick(row, ["코드"]);
  const room = pick(row, ["고사실", "시험장소", "시험 장소"]);
  const proctor = pick(row, ["지도교사", "감독교사", "감독"]);
  if (!studentId || !name || !date || !period || !subjectBase || !room) return null;
  return {
    studentId,
    name,
    date,
    period,
    subject: `${subjectBase} ${code}`.trim(),
    grade: parseInt(studentId[0], 10),
    class: parseInt(studentId.substring(1, 3), 10),
    number: parseInt(studentId.substring(3, 5), 10),
    room,
    proctor,
  };
};

// 응시현황표 학생 객체 → 시간표 행. 과목명이 바뀌지 않았으면 원래의 과목/코드 분리를 유지
const studentToRow = (student, prevRow = {}) => {
  const prevSubject = `${prevRow["과목"] || ""} ${prevRow["코드"] || ""}`.trim();
  const keepSplit = prevRow["과목"] && student.subject === prevSubject;
  return {
    ...prevRow,
    학번: String(student.studentId),
    이름: student.name,
    날짜: student.date,
    교시: String(student.period),
    과목: keepSplit ? prevRow["과목"] : student.subject,
    코드: keepSplit ? prevRow["코드"] || "" : "",
    고사실: student.room || "",
    지도교사: student.proctor || "",
  };
};

const sortKey = (a, b) => {
  if (a.grade !== b.grade) return (a.grade || 0) - (b.grade || 0);
  if (a.class !== b.class) return (a.class || 0) - (b.class || 0);
  if (a.number !== b.number) return (a.number || 0) - (b.number || 0);
  if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
  return String(a.period).localeCompare(String(b.period));
};

const metaOf = (year, semester, examType, grade) => ({ year, semester, examType: toExamKey(examType), grade: String(grade) });

// 전 학년 학생 목록과 원본 위치(학년 문서·행 번호)를 함께 반환
const loadAll = async (year, semester, examType) => {
  const docs = {};
  const list = [];
  const results = await Promise.all(
    GRADES.map((g) => withTimeout(loadGradeDoc(metaOf(year, semester, examType, g)))),
  );
  // 학년 순서대로 쌓아 정렬 결과(=화면의 행 번호)가 매번 같도록 유지
  GRADES.forEach((g, i) => {
    docs[g] = results[i] ? results[i].rows : [];
    docs[g].forEach((row, rowIdx) => {
      const s = rowToStudent(row);
      if (s) list.push({ student: s, src: { grade: g, rowIdx } });
    });
  });
  list.sort((a, b) => sortKey(a.student, b.student));
  return { docs, list };
};

export const fetchExamData = async (year, semester, examType) => {
  try {
    const { list } = await loadAll(year, semester, examType);
    return list.length > 0 ? list.map((x) => x.student) : null;
  } catch (e) {
    throw new Error("데이터 로딩 실패: " + e.message);
  }
};

const saveGrade = (year, semester, examType, grade, rows, fileName) =>
  withTimeout(saveGradeRows(metaOf(year, semester, examType, grade), rows, fileName), 20000);

export const saveExamData = async (year, semester, examType, students) =>
  saveExamDataWithGrade(year, semester, examType, "all", students, "overwrite_all");

export const fetchSettings = async () => {
  try {
    const active = await withTimeout(loadActive(), 6000);
    if (!active) return null;
    const def = active.defaultMetadata || active.metadata;
    return {
      schoolLogo: active.logoSrc || null,
      defaultAcademicInfo: def
        ? { year: def.year, semester: def.semester, examType: toExamLabel(def.examType), grade: def.grade }
        : null,
    };
  } catch (e) {
    console.error("Failed to fetch settings:", e);
    return null;
  }
};

export const saveLogoSetting = async (base64Logo) => {
  try {
    await withTimeout(saveActive({ logoSrc: base64Logo || "" }));
  } catch (e) {
    throw new Error("로고 저장 실패: " + e.message);
  }
};

export const saveDefaultAcademicInfo = async ({ year, semester, examType, grade }) => {
  try {
    const meta = { year: String(year), semester: String(semester), examType: toExamKey(examType), grade: String(grade) };
    await withTimeout(saveActive({ defaultMetadata: meta, metadata: meta }));
  } catch (e) {
    throw new Error("기본 학사 정보 저장 실패: " + e.message);
  }
};

export const deleteExamData = async (year, semester, examType) => {
  try {
    for (const g of GRADES) await withTimeout(deleteGradeDoc(metaOf(year, semester, examType, g)));
    return true;
  } catch (e) {
    throw new Error("시험 데이터 전체 삭제 실패: " + e.message);
  }
};

export const deleteExamGradeData = async (year, semester, examType, grade) => {
  try {
    const { docs } = await loadAll(year, semester, examType);
    const deletedCount = (docs[String(grade)] || []).length;
    await withTimeout(deleteGradeDoc(metaOf(year, semester, examType, grade)));
    const remainingCount = GRADES.filter((g) => g !== String(grade)).reduce((n, g) => n + docs[g].length, 0);
    return { remainingCount, deletedCount };
  } catch (e) {
    throw new Error(`${grade}학년 데이터 삭제 실패: ` + e.message);
  }
};

export const saveExamDataWithGrade = async (
  year,
  semester,
  examType,
  gradeOption,
  newStudents,
  uploadMode = "overwrite_grade",
) => {
  try {
    const { docs } = await loadAll(year, semester, examType);
    const incoming = gradeOption === "all"
      ? newStudents
      : newStudents.filter((s) => String(s.grade) === String(gradeOption));
    const byGrade = {};
    incoming.forEach((s) => {
      (byGrade[String(s.grade)] ||= []).push(studentToRow(s));
    });

    // 저장 대상 학년 결정
    //  overwrite_grade: 올린 학년만 교체 / merge: 기존에 덧붙임 / overwrite_all: 올리지 않은 학년은 삭제
    const targets = uploadMode === "overwrite_all" ? GRADES : Object.keys(byGrade);
    for (const g of targets) {
      const rows = uploadMode === "merge" ? [...docs[g], ...(byGrade[g] || [])] : byGrade[g] || [];
      await saveGrade(year, semester, examType, g, rows, "응시현황표 페이지 업로드");
      docs[g] = rows;
    }

    const totalCount = GRADES.reduce((n, g) => n + docs[g].length, 0);
    const currentGradeCount = gradeOption === "all" ? incoming.length : (docs[String(gradeOption)] || []).length;
    return {
      totalCount,
      currentGradeCount,
      retainedOtherGradesCount: Math.max(0, totalCount - currentGradeCount),
      mode: uploadMode,
    };
  } catch (e) {
    throw new Error("데이터 저장 실패: " + e.message);
  }
};

export const addStudentRecord = async (year, semester, examType, newStudent) => {
  try {
    const g = String(newStudent.grade || String(newStudent.studentId)[0]);
    const { docs } = await loadAll(year, semester, examType);
    await saveGrade(year, semester, examType, g, [...(docs[g] || []), studentToRow(newStudent)]);
    return fetchExamData(year, semester, examType);
  } catch (e) {
    throw new Error("학생 추가 실패: " + e.message);
  }
};

export const updateStudentRecord = async (year, semester, examType, index, updatedStudent) => {
  try {
    const { docs, list } = await loadAll(year, semester, examType);
    const target = list[index];
    if (!target) throw new Error("유효하지 않은 데이터 인덱스입니다.");
    const { grade: fromGrade, rowIdx } = target.src;
    const toGrade = String(updatedStudent.grade || String(updatedStudent.studentId)[0]);
    const newRow = studentToRow(updatedStudent, docs[fromGrade][rowIdx]);
    if (toGrade === fromGrade) {
      const rows = [...docs[fromGrade]];
      rows[rowIdx] = newRow;
      await saveGrade(year, semester, examType, fromGrade, rows);
    } else {
      // 학년이 바뀐 경우 해당 학년 문서로 이동
      await saveGrade(year, semester, examType, toGrade, [...(docs[toGrade] || []), newRow]);
      await saveGrade(year, semester, examType, fromGrade, docs[fromGrade].filter((_, i) => i !== rowIdx));
    }
    return fetchExamData(year, semester, examType);
  } catch (e) {
    throw new Error("학생 정보 수정 실패: " + e.message);
  }
};

export const deleteStudentRecord = async (year, semester, examType, index) => {
  try {
    const { docs, list } = await loadAll(year, semester, examType);
    const target = list[index];
    if (!target) throw new Error("유효하지 않은 데이터 인덱스입니다.");
    const { grade, rowIdx } = target.src;
    await saveGrade(year, semester, examType, grade, docs[grade].filter((_, i) => i !== rowIdx));
    return fetchExamData(year, semester, examType);
  } catch (e) {
    throw new Error("학생 레코드 삭제 실패: " + e.message);
  }
};
