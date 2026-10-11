import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../shared/firebase';
import LegacyImport from './LegacyImport';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { Meta, Student, Elective, CommonSubject, RosterRecord } from './types.ts';
import { autoAssignTeachersFromTimetable, isNonExamSubject } from './timetableHelper.ts';

const PERIODS = [1, 2, 3, 4, 5];

const COMMON_DEFAULTS: { [grade: string]: { [term: string]: string[] } } = {
  '1': {
    '1': ['공통국어1', '공통수학1', '공통영어1', '통합사회1', '통합과학1', '한국사1'],
    '2': ['공통국어2', '공통수학2', '공통영어2', '통합사회2', '통합과학2', '한국사2']
  },
  '2': {
    '1': ['대수', '문학', '영어Ⅰ'],
    '2': ['화법과 언어', '미적분Ⅰ', '영어Ⅱ']
  },
  '3': {
    '1': [],
    '2': []
  }
};

const WD = ['일', '월', '화', '수', '목', '금', '토'];

const norm = (s: any) => (s == null ? '' : String(s)).replace(/\s+/g, '');

function codeToRoom(code: string, grade: string, subjectName?: string): string {
  const c = String(code || '').trim();
  const cUpper = c.toUpperCase();
  const sNorm = norm(subjectName);

  if (grade === '1') {
    if (cUpper === 'A' || c === '101') return '1학년 1반';
    if (cUpper === 'B' || c === '102') return '1학년 2반';
    if (cUpper === 'C' || c === '103') return '1학년 3반';
    if (cUpper === 'D' || c === '104') return '1학년 4반';
    if (cUpper === 'E' || c === '105') return '1학년 5반';
    if (c === '106') return '1학년 6반';
    if (c === '107') return '1학년 7반';
    if (c === '108') return '1학년 8반';
  }

  if (grade === '2') {
    if (cUpper === 'A' || c === '201') return '2학년 1반';
    if (cUpper === 'B' || c === '202') return '2학년 2반';
    if (cUpper === 'C' || c === '203') return '2학년 3반';
    if (cUpper === 'D' || c === '204') return '2학년 4반';
    if (cUpper === 'E' || c === '205') return '2학년 5반';
    if (c === '206') return '2학년 6반';
    if (c === '207') return '2학년 7반';
    if (c === '208') return '2학년 8반';
  }

  if (grade === '3') {
    if (cUpper === 'A') return '3학년 1반';
    if (cUpper === 'B') return '3학년 2반';
    if (cUpper === 'C') return '3학년 3반';
    if (cUpper === 'D') return '3학년 4반';
    if (cUpper === 'E') return '3학년 5반';
    if (cUpper === 'F') return '3학년 6반';
    if (cUpper === 'G') return '3학년 7반';
    if (cUpper === 'H') return '3학년 8반';
    if (cUpper === 'I') return '개방형603';
    if (cUpper === 'J') {
      if (sNorm.includes('확률과통계') || sNorm.includes('확통')) {
        return '3학년 7반';
      }
      return '3학년 4반';
    }
  }

  if (/^[A-Z]$/i.test(c)) {
    return `${grade}학년 ${cUpper.charCodeAt(0) - 64}반`;
  }
  if (/^\d+$/.test(c)) {
    const n = String(c).slice(-1);
    return `${grade}학년 ${n}반`;
  }
  return `${grade}학년`;
}

function fmtDate(d: string): string {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const da = String(dt.getDate()).padStart(2, '0');
  return `${y}/${m}/${da}(${WD[dt.getDay()]})`;
}

// Crisp Vector SVG School Crest fallback
const LogoFallback = () => (
  <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
    {/* Outer Green Ring */}
    <circle cx="50" cy="50" r="47" fill="#ffffff" stroke="#16a34a" strokeWidth="4" />
    
    {/* Inside Swirl (Taegeuk Wavy Pattern in Red, White, Blue) */}
    <path d="M 50 12 A 38 38 0 0 0 12 50 C 12 62 25 72 50 67 C 33 60 28 35 50 12 Z" fill="#ef4444" />
    <path d="M 50 88 A 38 38 0 0 0 88 50 C 88 38 75 28 50 33 C 67 40 72 65 50 88 Z" fill="#2563eb" />
    <path d="M 50 12 C 30 30 30 70 50 88" stroke="#ffffff" strokeWidth="2" />
    
    {/* Center Apricot/Plum Blossom */}
    <g transform="translate(50, 50) scale(1.1)">
      {/* 5 Petals */}
      <circle cx="0" cy="-8" r="5.5" fill="#ffffff" stroke="#d97706" strokeWidth="1" />
      <circle cx="7.6" cy="-2.5" r="5.5" fill="#ffffff" stroke="#d97706" strokeWidth="1" />
      <circle cx="4.7" cy="6.5" r="5.5" fill="#ffffff" stroke="#d97706" strokeWidth="1" />
      <circle cx="-4.7" cy="6.5" r="5.5" fill="#ffffff" stroke="#d97706" strokeWidth="1" />
      <circle cx="-7.6" cy="-2.5" r="5.5" fill="#ffffff" stroke="#d97706" strokeWidth="1" />
      <circle cx="0" cy="0" r="6" fill="#ffffff" />
      {/* Character "元" */}
      <text x="0" y="3.5" fill="#1e3a8a" fontSize="9" fontWeight="950" textAnchor="middle">元</text>
    </g>

    {/* Text along circle paths */}
    <path id="textPathTop" d="M 19 50 A 31 31 0 0 1 81 50" fill="none" />
    <path id="textPathBottom" d="M 81 50 A 31 31 0 0 1 19 50" fill="none" />

    <text fontSize="5.2" fontWeight="900" fill="#1e293b" letterSpacing="0.2px">
      <textPath href="#textPathTop" startOffset="50%" textAnchor="middle">
        WON MOOK HIGH SCHOOL
      </textPath>
    </text>
    <text fontSize="5.2" fontWeight="900" fill="#1e293b" letterSpacing="0.4px">
      <textPath href="#textPathBottom" startOffset="50%" textAnchor="middle">
        SEOUL KOREA
      </textPath>
    </text>
  </svg>
);

export default function App() {
  const [fsLevel, setFsLevel] = useState(15);
  const [darkMode, setDarkMode] = useState(false);

  // STEP 1 State
  const [year, setYear] = useState('2026');
  const [term, setTerm] = useState('2');
  const [examType, setExamType] = useState('중간고사');
  const [grade, setGrade] = useState('2');

  const [students, setStudents] = useState<Student[]>([]);
  const [electives, setElectives] = useState<Elective[]>([]);
  const [commons, setCommons] = useState<CommonSubject[]>([]);

  // Feedback states
  const [uploadStatus, setUploadStatus] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const [timetableStatus, setTimetableStatus] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  // 통합 앱: 이 페이지는 관리자 로그인 후에만 열리므로 항상 관리자 모드
  const isAdmin = true;
  const [dbOverview, setDbOverview] = useState<{ g1Count: number; g2Count: number; g3Count: number; hasData: boolean } | null>(null);

  // Check DB data counts for target year/term to assure users that data is safe
  const fetchDbOverview = async (targetYear: string, targetTerm: string) => {
    try {
      const [configSnap, allGradesSnap] = await Promise.all([
        getDoc(doc(db, 'school_data', `grade_data_${targetYear}_${targetTerm}`)),
        getDoc(doc(db, 'school_data', 'all_grades'))
      ]);
      const cData = configSnap.exists() ? configSnap.data() : {};
      const aData = allGradesSnap.exists() ? allGradesSnap.data() : {};

      const g1Count = cData?.grade1?.length || aData?.[`grade1_${targetTerm}`]?.length || aData?.grade1?.length || 0;
      const g2Count = cData?.grade2?.length || aData?.[`grade2_${targetTerm}`]?.length || aData?.grade2?.length || 0;
      const g3Count = cData?.grade3?.length || aData?.[`grade3_${targetTerm}`]?.length || aData?.grade3?.length || 0;

      setDbOverview({ g1Count, g2Count, g3Count, hasData: g1Count > 0 || g2Count > 0 || g3Count > 0 });
    } catch (e) {
      console.warn('DB overview check error:', e);
    }
  };

  // Default Settings State (stored in Firestore settings doc)
  const [currentDefault, setCurrentDefault] = useState<{
    year: string;
    term: string;
    examType: string;
    grade: string;
  } | null>(null);
  const [defaultSaveSuccess, setDefaultSaveSuccess] = useState(false);
  
  const [showPreview, setShowPreview] = useState(false);
  const [roster, setRoster] = useState<RosterRecord[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // Font Size logic
  useEffect(() => {
    document.documentElement.style.setProperty('--fs', `${fsLevel}px`);
  }, [fsLevel]);

  // Dark Mode logic
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Initial load from Firebase on mount: fetch system default settings, then load data
  useEffect(() => {
    async function initSettingsAndData() {
      let initYear = '2026';
      let initTerm = '2';
      let initExamType = '중간고사';
      let initGrade = '2';

      try {
        const cached = localStorage.getItem('school_default_settings');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.year) initYear = parsed.year;
            if (parsed.term) initTerm = parsed.term;
            if (parsed.examType) initExamType = parsed.examType;
            if (parsed.grade) initGrade = parsed.grade;
          } catch (e) {
            console.warn(e);
          }
        }

        const settingsSnap = await getDoc(doc(db, 'school_data', 'settings'));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          if (data.activeYear) initYear = String(data.activeYear);
          if (data.activeSemester) initTerm = String(data.activeSemester);
          if (data.activeExamType) initExamType = String(data.activeExamType);
          if (data.activeGrade) initGrade = String(data.activeGrade);
        }

        const resolved = { year: initYear, term: initTerm, examType: initExamType, grade: initGrade };
        setCurrentDefault(resolved);
        localStorage.setItem('school_default_settings', JSON.stringify(resolved));

        setYear(initYear);
        setTerm(initTerm);
        setExamType(initExamType);
        setGrade(initGrade);

        // Fetch DB data counts to display to the user immediately
        fetchDbOverview(initYear, initTerm);
      } catch (err) {
        console.warn('Failed to load settings:', err);
      }
    }

    initSettingsAndData();
  }, []);

  // Save Current Selection as Default (Admin mode)
  const handleSaveDefaultSettings = async () => {
    try {
      setDefaultSaveSuccess(false);
      const settingsRef = doc(db, 'school_data', 'settings');
      await setDoc(settingsRef, {
        activeYear: year,
        activeSemester: term,
        activeExamType: examType,
        activeGrade: grade,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const newDefault = { year, term, examType, grade };
      setCurrentDefault(newDefault);
      localStorage.setItem('school_default_settings', JSON.stringify(newDefault));
      
      setDefaultSaveSuccess(true);
      setTimeout(() => setDefaultSaveSuccess(false), 5000);
    } catch (err: any) {
      console.error(err);
      alert('기본값 저장 실패: ' + err.message);
    }
  };

  // Handle year change
  const handleYearChange = (newYear: string) => {
    setYear(newYear);
    fetchDbOverview(newYear, term);
    if (isDataLoaded) {
      handleLoadFromFirebase(newYear, term, grade);
    }
  };

  // Handle grade change dynamically updating defaults and electives
  const handleGradeChange = (newGrade: string) => {
    setGrade(newGrade);
    if (isDataLoaded) {
      handleLoadFromFirebase(year, term, newGrade);
    }
  };

  // Handle term change dynamically updating defaults and loading data
  const handleTermChange = (newTerm: string) => {
    setTerm(newTerm);
    fetchDbOverview(year, newTerm);
    if (isDataLoaded) {
      handleLoadFromFirebase(year, newTerm, grade);
    }
  };

  // Drag and drop handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileParsing(e.dataTransfer.files[0]);
    }
  };

  const onFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileParsing(e.target.files[0]);
    }
  };

  // Download Sample XLSX for each grade
  const handleDownloadSample = (sampleGrade: string) => {
    let filename = '';
    let data: any[][] = [];

    if (sampleGrade === '1') {
      const g1Subjects = (grade === '1' && commons.length > 0 && commons.some(c => c.subject))
        ? commons.map(c => c.subject).filter(Boolean)
        : (COMMON_DEFAULTS['1']?.[term] || (term === '1'
            ? ['공통국어1', '공통수학1', '공통영어1', '통합사회1', '통합과학1', '한국사1']
            : ['공통국어2', '공통수학2', '공통영어2', '통합사회2', '통합과학2', '한국사2']));

      filename = `${year}학년도_${term}학기_1학년_공통과목명렬표_샘플양식.xlsx`;
      data = [
        ['순번', '학번', '이름', ...g1Subjects, '비고'],
        [1, 10101, '강민준', ...g1Subjects.map(() => '공통'), '1학년 1반'],
        [2, 10102, '김서연', ...g1Subjects.map(() => '공통'), '1학년 1반'],
        [3, 10103, '박도윤', ...g1Subjects.map(() => '공통'), '1학년 1반'],
        [4, 10104, '이지우', ...g1Subjects.map(() => '공통'), '1학년 1반'],
        [5, 10105, '최하은', ...g1Subjects.map(() => '공통'), '1학년 1반'],
        [6, 10201, '정시우', ...g1Subjects.map(() => '공통'), '1학년 2반'],
        [7, 10202, '한지민', ...g1Subjects.map(() => '공통'), '1학년 2반'],
        [8, 10203, '윤채원', ...g1Subjects.map(() => '공통'), '1학년 2반'],
        [9, 10204, '조은우', ...g1Subjects.map(() => '공통'), '1학년 2반'],
        [10, 10301, '송유준', ...g1Subjects.map(() => '공통'), '1학년 3반'],
        [11, 10302, '임다은', ...g1Subjects.map(() => '공통'), '1학년 3반'],
        [12, 10303, '황서준', ...g1Subjects.map(() => '공통'), '1학년 3반']
      ];
    } else if (sampleGrade === '2') {
      filename = `${year}학년도_2학년_선택과목명렬표_샘플양식.xlsx`;
      data = [
        ['순번', '학번', '이름', '인공지능 수학2', '역학과 에너지', '화학 반응의 세계', '세포와 물질대사', '데이터 과학', '사회와 문화', '윤리와 사상2', '독서 토론과 글쓰기', '한국지리 탐구', '동아시아 역사 기행', '중국어 회화', '세계 문화와 영어', '일본어 회화'],
        [1, 20101, '김민수', 'A', '', 'A', '', '', 'A', '', '', '', '', '', 'A', ''],
        [2, 20102, '이영희', '', 'A', '', 'A', '', '', 'A', '', 'D', '', '', '', 'A'],
        [3, 20103, '박서준', 'B', '', '', 'C', 'B', '', '', 'A', '', 'B', '', '', ''],
        [4, 20201, '최유진', '', 'D', 'B', '', '', 'B', 'B', '', '', '', '', 'D', ''],
        [5, 20202, '정태우', 'D', '', 'D', 'E', '', '', '', 'B', 'E', '', '', '', 'B'],
        [6, 20301, '강하늘', '', 'E', 'E', '', 'C', 'C', 'C', '', '', 'C', '', '', 'C']
      ];
    } else {
      filename = `${year}학년도_3학년_선택과목명렬표_샘플양식.xlsx`;
      data = [
        ['순번', '학번', '이름', '영어 독해와 작문', '운동과 건강', '확률과 통계', '미적분', '물리학Ⅱ', '화학Ⅱ', '생명과학Ⅱ', '생활과 과학', '화법과 작문', '독서', '환경', '윤리와 사상'],
        [1, 30101, '구동현', 'A', 'A', 'B', '', '', 'I', 'A', 'A', '', '', 'B', 'A'],
        [2, 30102, '권서희', 'B', 'B', 'C', 'D', '', '', '', '', 'G', 'I', '', 'D'],
        [3, 30103, '김도현', 'C', 'C', 'D', 'E', 'B', '', '', '', '', '', 'C', ''],
        [4, 30201, '문예은', 'D', 'D', 'E', 'F', '', 'J', '', 'D', 'H', 'J', '', ''],
        [5, 30202, '박지훈', 'E', 'E', 'F', '', 'F', '', 'H', 'G', '', '', 'F', 'G'],
        [6, 30301, '신동욱', 'F', 'F', 'I', '', '', '', '', 'H', 'I', '', 'G', 'H'],
        [7, 30302, '오민서', 'G', 'I', 'J', '', '', '', '', 'I', 'J', '', 'H', '']
      ];
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${sampleGrade}학년명렬표`);
    XLSX.writeFile(wb, filename);
  };

  // Core XLSX File parsing
  const handleFileParsing = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const bytes = new Uint8Array(e.target.result);
        const wb = XLSX.read(bytes, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        if (rows.length < 2) {
          throw new Error('올바르지 않은 명단 형식 또는 빈 오리진 시트입니다.');
        }

        // Auto-detect header row
        let headerRowIndex = 0;
        for (let r = 0; r < Math.min(6, rows.length); r++) {
          const rowStr = (rows[r] || []).map((c: any) => String(c || '').trim()).join(' ');
          if (rowStr.includes('학번') || rowStr.includes('성명') || rowStr.includes('이름')) {
            headerRowIndex = r;
            break;
          }
        }
        const header = rows[headerRowIndex] || [];

        // Auto-detect hakbun and name columns
        let hakIdx = header.findIndex((c: any) => /학번|학생번호/i.test(String(c || '')));
        let nameIdx = header.findIndex((c: any) => /성명|이름|학생명/i.test(String(c || '')));

        if (hakIdx === -1) {
          hakIdx = header.length > 2 ? 1 : 0;
        }
        if (nameIdx === -1) {
          nameIdx = hakIdx === 0 ? 1 : 2;
        }

        const ignoreColNames = new Set(['연번', '순번', '번호', '학번', '성명', '이름', '학생명', '비고', '학적', '성별']);
        const subjCols: { idx: number; name: string; raw: any }[] = [];
        for (let i = 0; i < header.length; i++) {
          if (i === hakIdx || i === nameIdx) continue;
          const colName = String(header[i] || '').trim();
          if (colName && !ignoreColNames.has(norm(colName))) {
            subjCols.push({ idx: i, name: norm(colName), raw: header[i] });
          }
        }

        const parsedStudents: Student[] = [];
        const codeSets: { [key: string]: Set<string> } = {};
        subjCols.forEach(s => {
          codeSets[s.name] = new Set<string>();
        });

        for (let r = headerRowIndex + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row[hakIdx] == null) continue;
          const hak = String(row[hakIdx]).trim();
          const name = row[nameIdx] != null ? String(row[nameIdx]).trim() : '';
          if (!hak || !name) continue;

          const sel: { [key: string]: string } = {};

          subjCols.forEach(s => {
            const v = row[s.idx];
            if (v != null && String(v).trim() !== '') {
              const valTrimmed = String(v).trim();
              sel[s.name] = valTrimmed;
              codeSets[s.name].add(valTrimmed);
            }
          });

          // Only skip zero-subject students if this is an elective-based file (not grade 1)
          const isG1Hak = String(hak).startsWith('1');
          if (subjCols.length > 0 && Object.keys(sel).length === 0 && !isG1Hak && grade !== '1') continue;
          parsedStudents.push({ hak, name, sel });
        }

        // Auto-detect grade from uploaded student numbers
        let detectedGrade = grade;
        if (parsedStudents.length > 0) {
          const firstHak = String(parsedStudents[0].hak).trim();
          if (firstHak.startsWith('1')) detectedGrade = '1';
          else if (firstHak.startsWith('2')) detectedGrade = '2';
          else if (firstHak.startsWith('3')) detectedGrade = '3';
        }

        if (detectedGrade !== grade) {
          setGrade(detectedGrade);
        }

        // Fetch existing configuration from Firestore to safely merge without losing dates, periods, teachers, or rooms
        let existingCommonsFromDb: CommonSubject[] = [];
        let existingElectivesFromDb: Elective[] = [];
        try {
          const configRef = doc(db, 'school_data', `grade_data_${year}_${term}`);
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            const data = configSnap.data();
            existingCommonsFromDb = data[`commons_grade${detectedGrade}`] || (data.meta?.grade === detectedGrade ? data.commons : null) || [];
            existingElectivesFromDb = data[`electives_grade${detectedGrade}`] || (data.meta?.grade === detectedGrade ? data.electives : null) || [];
          }
          // If empty or missing dates/teachers in primary doc, check backup doc
          const hasCommonsInfo = existingCommonsFromDb && existingCommonsFromDb.some(c => c.date || c.period || Object.keys(c.teachers || {}).length > 0);
          if (!hasCommonsInfo) {
            const backupSnap = await getDoc(doc(db, 'school_data', `backup_${year}_${term}`));
            if (backupSnap.exists()) {
              const bData = backupSnap.data();
              const bCommons = bData[`commons_grade${detectedGrade}`] || (bData.meta?.grade === detectedGrade ? bData.commons : null);
              if (bCommons && Array.isArray(bCommons) && bCommons.length > 0) {
                existingCommonsFromDb = bCommons;
              }
              if (!existingElectivesFromDb || existingElectivesFromDb.length === 0) {
                existingElectivesFromDb = bData[`electives_grade${detectedGrade}`] || (bData.meta?.grade === detectedGrade ? bData.electives : null) || [];
              }
            }
          }
        } catch (fetchErr) {
          console.warn('Could not fetch existing config for merge:', fetchErr);
        }

        // Map existing electives (from DB first, fallback to state if grade matches)
        const existingElectivesMap = new Map<string, any>();
        if (existingElectivesFromDb && existingElectivesFromDb.length > 0) {
          existingElectivesFromDb.forEach(e => existingElectivesMap.set(norm(e.subject), e));
        } else if (detectedGrade === grade) {
          electives.forEach(e => existingElectivesMap.set(norm(e.subject), e));
        }

        const parsedElectives: Elective[] = detectedGrade === '1' 
          ? [] 
          : subjCols.map(s => {
          const codes = Array.from(codeSets[s.name]).sort();
          const existing = existingElectivesMap.get(norm(s.name));
          const rooms: { [key: string]: string } = {};
          const teachers: { [key: string]: string } = {};

          codes.forEach(c => {
            rooms[c] = (existing?.rooms && existing.rooms[c]) ? existing.rooms[c] : codeToRoom(c, detectedGrade, s.name);
            teachers[c] = (existing?.teachers && existing.teachers[c]) ? existing.teachers[c] : '';
          });

          return {
            subject: s.name,
            raw: s.raw,
            codes,
            date: existing?.date || '',
            period: existing?.period || '',
            hasExam: existing?.hasExam !== undefined ? existing.hasExam : (!isNonExamSubject(s.name) && codes.length > 0),
            rooms,
            teachers
          };
        }).filter(e => e.codes.length > 0);

        setStudents(parsedStudents);
        setElectives(parsedElectives);
        
        // Preserve and merge commons for detectedGrade so dates, periods, and teachers are NEVER wiped
        let mergedCommons: CommonSubject[] = [];
        if (detectedGrade === '3') {
          setCommons([]);
        } else {
          const existingCommonsMap = new Map<string, CommonSubject>();
          if (existingCommonsFromDb && existingCommonsFromDb.length > 0) {
            existingCommonsFromDb.forEach(c => existingCommonsMap.set(norm(c.subject), c));
          } else if (detectedGrade === grade) {
            commons.forEach(c => existingCommonsMap.set(norm(c.subject), c));
          }

          let subjectList: string[] = [];
          if (detectedGrade === '1' && subjCols.length > 0) {
            // Extract common subjects directly from uploaded 1st grade Excel columns
            subjectList = Array.from(new Set(subjCols.map(s => s.name.trim()).filter(Boolean)));
          } else {
            const defaults = COMMON_DEFAULTS[detectedGrade]?.[term] || [];
            subjectList = Array.from(new Set([
              ...defaults,
              ...(existingCommonsFromDb.map(c => c.subject).filter(Boolean))
            ]));
          }

          mergedCommons = subjectList.map(s => {
            const existing = existingCommonsMap.get(norm(s));
            return {
              subject: s,
              date: existing?.date || '',
              period: existing?.period || '',
              teachers: existing?.teachers ? { ...existing.teachers } : {}
            };
          });

          setCommons(mergedCommons);
        }

        // Auto-save uploaded students safely to their isolated grade in Firestore
        const formattedStudents = parsedStudents.map(st => ({
          hakbun: String(st.hak),
          name: String(st.name),
          selections: Object.entries(st.sel).map(([subject, block]) => ({ subject, block }))
        }));

        try {
          const configRef = doc(db, 'school_data', `grade_data_${year}_${term}`);
          const updatePayload: any = {
            [`grade${detectedGrade}`]: formattedStudents,
            [`grade${detectedGrade}Updated`]: new Date().toISOString()
          };
          if (detectedGrade === '1' && subjCols.length > 0) {
            updatePayload[`commons_grade1`] = mergedCommons;
          }
          await setDoc(configRef, updatePayload, { merge: true });

          await setDoc(doc(db, 'school_data', 'all_grades'), {
            [`grade${detectedGrade}_${term}`]: formattedStudents,
            [`grade${detectedGrade}_${term}Updated`]: new Date().toISOString(),
            [`grade${detectedGrade}`]: formattedStudents,
            [`grade${detectedGrade}Updated`]: new Date().toISOString()
          }, { merge: true });
        } catch (saveErr) {
          console.warn('Auto-save of uploaded grade failed:', saveErr);
        }

        const gradeNotice = detectedGrade === '1' 
          ? (subjCols.length > 0 ? ` (1학년 공통과목 ${mergedCommons.length}개 설정)` : ' (1학년 공통과목 자동 배정)') 
          : '';
        const switchNotice = detectedGrade !== grade ? ` [학번 분석을 통해 ${detectedGrade}학년으로 자동 분류되어 저장되었습니다]` : '';
        setUploadStatus({
          type: 'ok',
          text: `✅ ${file.name} 분석 완료 — 학생 ${parsedStudents.length}명, 선택과목 ${parsedElectives.length}개 추출${gradeNotice}${switchNotice}`
        });

        fetchDbOverview(year, term);

        // Clear general success status of preceding runs
        setRoster([]);
        setGenStatus(null);
        setIsDataLoaded(true);
      } catch (err: any) {
        setUploadStatus({
          type: 'warn',
          text: `⚠️ 분석 실패: ${err.message}`
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // UNIQUE CLASSES helper
  const uniqueClasses: string[] = students.length > 0 
    ? (Array.from(new Set(students.map(s => String(s.hak).slice(0, 3)))).sort() as string[])
    : ['1', '2', '3', '4', '5', '6', '7', '8'].map(c => `${grade}0${c}`);

  // COMMON MUTATORS
  const handleAddCommon = () => {
    setCommons([...commons, { subject: '', date: '', period: '', teachers: {} }]);
  };

  const handleDelCommon = (index: number) => {
    const updated = [...commons];
    updated.splice(index, 1);
    setCommons(updated);
  };

  const handleCommonSubjectChange = (index: number, val: string) => {
    const updated = [...commons];
    updated[index].subject = val;
    setCommons(updated);
  };

  const handleCommonDateChange = (index: number, val: string) => {
    const updated = [...commons];
    updated[index].date = val;
    setCommons(updated);
  };

  const handleCommonPeriodChange = (index: number, val: string) => {
    const updated = [...commons];
    updated[index].period = val;
    setCommons(updated);
  };

  const handleCommonTeacherChange = (index: number, classCode: string, val: string) => {
    const updated = [...commons];
    updated[index].teachers = {
      ...updated[index].teachers,
      [classCode]: val
    };
    setCommons(updated);
  };

  // ELECTIVE MUTATORS
  const handleElectiveHasChange = (index: number, val: boolean) => {
    const updated = [...electives];
    updated[index] = { ...updated[index], hasExam: val };
    setElectives(updated);
  };

  const handleElectiveDateChange = (index: number, val: string) => {
    const updated = [...electives];
    updated[index] = { ...updated[index], date: val };
    setElectives(updated);
  };

  const handleElectivePeriodChange = (index: number, val: string) => {
    const updated = [...electives];
    updated[index] = { ...updated[index], period: val };
    setElectives(updated);
  };

  const handleElectiveRoomChange = (index: number, code: string, val: string) => {
    const updated = [...electives];
    updated[index] = {
      ...updated[index],
      rooms: {
        ...updated[index].rooms,
        [code]: val
      }
    };
    setElectives(updated);
  };

  const handleElectiveTeacherChange = (index: number, code: string, val: string) => {
    const updated = [...electives];
    updated[index] = {
      ...updated[index],
      teachers: {
        ...updated[index].teachers,
        [code]: val
      }
    };
    setElectives(updated);
  };

  // CONFIGURATION METADATA FOR EXPORT/PREVIEW
  const configObject = {
    meta: { year, term, examType, grade },
    commons,
    electives,
    studentCount: students.length
  };

  // Save to Firebase with atomic merge and automatic safety backup
  const handleSaveToFirebase = async () => {
    try {
      setSaveStatus({ type: 'ok', text: '파이어베이스에 저장 중...' });
      
      const allGradesRef = doc(db, 'school_data', 'all_grades');
      
      // Format students to all_grades format
      const formattedStudents = students.map(st => {
        const selections = Object.entries(st.sel).map(([subject, block]) => ({
          subject,
          block
        }));
        return {
          hakbun: String(st.hak),
          name: st.name,
          selections
        };
      });
      
      const termGradeKey = `grade${grade}_${term}`;
      const legacyGradeKey = `grade${grade}`;
      
      if (formattedStudents.length > 0) {
        const allGradesUpdate: any = {
          [termGradeKey]: formattedStudents,
          [`${termGradeKey}Updated`]: new Date().toISOString()
        };
        if (term === '1') {
          allGradesUpdate[legacyGradeKey] = formattedStudents;
          allGradesUpdate[`${legacyGradeKey}Updated`] = new Date().toISOString();
        }
        await setDoc(allGradesRef, allGradesUpdate, { merge: true });
      }
      
      // Target document for this specific academic year and semester
      const configRef = doc(db, 'school_data', `grade_data_${year}_${term}`);
      
      // Safety auto-backup before write
      try {
        const existingSnap = await getDoc(configRef);
        if (existingSnap.exists()) {
          const backupRef = doc(db, 'school_data', `backup_${year}_${term}`);
          await setDoc(backupRef, {
            ...existingSnap.data(),
            backupTimestamp: new Date().toISOString()
          }, { merge: true });
        }
      } catch (backupErr) {
        console.warn('Backup warning (non-fatal):', backupErr);
      }

      const fullData: any = { 
        academicYear: year,
        semester: `${term}학기`,
        meta: { year, term, examType, grade },
        updatedAt: new Date().toISOString(),
        [`commons_grade${grade}`]: commons,
        [`electives_grade${grade}`]: electives
      };

      if (formattedStudents.length > 0) {
        fullData[`grade${grade}`] = formattedStudents;
        fullData[`grade${grade}Updated`] = new Date().toISOString();
      }
      await setDoc(configRef, fullData, { merge: true });

      if (formattedStudents.length > 0) {
        await setDoc(doc(db, 'school_data', 'all_grades'), {
          [`grade${grade}_${term}`]: formattedStudents,
          [`grade${grade}_${term}Updated`]: new Date().toISOString(),
          [`grade${grade}`]: formattedStudents,
          [`grade${grade}Updated`]: new Date().toISOString()
        }, { merge: true });
      }

      // Local storage backup as second layer
      try {
        localStorage.setItem(`school_backup_${year}_${term}_grade${grade}`, JSON.stringify({
          commons,
          electives,
          updatedAt: new Date().toISOString()
        }));
      } catch (e) {}
      
      setSaveStatus({
        type: 'ok',
        text: `✅ 파이어베이스에 ${year}학년도 ${term}학기 ${grade}학년 설정(공통·선택 과목 일시, 교시, 담당교사)을 안전하게 저장했습니다.`
      });
      // Refresh DB overview
      fetchDbOverview(year, term);
    } catch (err: any) {
      console.error(err);
      setSaveStatus({
        type: 'warn',
        text: `⚠️ 저장 실패: ${err.message}`
      });
    }
  };

  // Import teachers automatically from uploaded timetable in Firestore
  const handleImportTeachersFromTimetable = async () => {
    try {
      setTimetableStatus('시간표 데이터에서 담당교사를 분석하는 중...');
      const timetableSnap = await getDoc(doc(db, 'school_data', `${year}_${term}`));
      if (!timetableSnap.exists() || !timetableSnap.data()?.timetable) {
        alert(`${year}학년도 ${term}학기에 등록된 시간표 데이터가 없습니다.`);
        setTimetableStatus(null);
        return;
      }
      const timetableStr = timetableSnap.data().timetable;
      const res = autoAssignTeachersFromTimetable(timetableStr, grade, commons, electives);
      setCommons(res.commons);
      setElectives(res.electives);
      setTimetableStatus(`✅ 시간표에서 총 ${res.count}건의 담당교사 배정을 자동으로 불러왔습니다! [💾 파이어베이스에 설정 저장]을 눌러 저장해주세요.`);
      setTimeout(() => setTimetableStatus(null), 8000);
    } catch (err: any) {
      console.error(err);
      alert('시간표 교사 분석 실패: ' + err.message);
      setTimetableStatus(null);
    }
  };

  // Load from Firebase
  const handleLoadFromFirebase = async (targetYear = year, targetTerm = term, targetGrade = grade) => {
    setIsLoadingData(true);
    try {
      setUploadStatus({ type: 'ok', text: `${targetYear}학년도 ${targetTerm}학기 ${targetGrade}학년 데이터를 불러오는 중...` });
      
      // 1. Load configs from grade_data_${targetYear}_${targetTerm}
      let savedConfig: any = null;
      const configSnap = await getDoc(doc(db, 'school_data', `grade_data_${targetYear}_${targetTerm}`));
      if (configSnap.exists()) {
        savedConfig = configSnap.data();
        if (savedConfig.meta?.examType) {
          setExamType(savedConfig.meta.examType);
        }
      }
      
      // 2. Load students:
      // Priority 1: savedConfig?.[`grade${targetGrade}`] (contains cleanly formatted 2026-2 students with full spacing)
      // Priority 2: all_grades[`grade${targetGrade}_${targetTerm}`]
      // Priority 3: all_grades[`grade${targetGrade}`] (legacy fallback)
      let rawStudents: any[] = [];
      const docSnap = await getDoc(doc(db, 'school_data', 'all_grades'));
      const allGradesData = docSnap.exists() ? docSnap.data() : {};
      
      const termGradeKey = `grade${targetGrade}_${targetTerm}`;
      const legacyGradeKey = `grade${targetGrade}`;
      
      if (savedConfig && savedConfig[`grade${targetGrade}`] && savedConfig[`grade${targetGrade}`].length > 0) {
        rawStudents = savedConfig[`grade${targetGrade}`];
      } else if (allGradesData[termGradeKey] && allGradesData[termGradeKey].length > 0) {
        rawStudents = allGradesData[termGradeKey];
      } else if (allGradesData[legacyGradeKey] && allGradesData[legacyGradeKey].length > 0) {
        rawStudents = allGradesData[legacyGradeKey];
      }
      
      if (rawStudents.length > 0) {
        const parsedStudents: Student[] = [];
        const subjMap = new Map<string, { displayName: string; codes: Set<string> }>();
        
        rawStudents.forEach((raw: any) => {
          const hak = String(raw.hakbun || raw.hak || '').trim();
          const name = String(raw.name || raw.studentName || '').trim();
          if (!hak || !name) return;
          // Ensure student strictly belongs to targetGrade (10xxx for 1, 20xxx for 2, 30xxx for 3)
          if (!hak.startsWith(String(targetGrade))) return;

          const sel: { [key: string]: string } = {};
          if (raw.selections) {
            raw.selections.forEach((s: any) => {
              const displayName = String(s.subject || '').trim();
              const normKey = norm(displayName);
              const blockCode = String(s.block).trim();
              sel[displayName] = blockCode;
              
              if (!subjMap.has(normKey)) {
                subjMap.set(normKey, { displayName, codes: new Set() });
              }
              subjMap.get(normKey)!.codes.add(blockCode);
            });
          }
          parsedStudents.push({
            hak,
            name,
            sel
          });
        });
        
        // Merge saved electives with roster subjects so dates, periods, rooms, and teachers are never lost
        const savedGradeElectives: any[] = savedConfig?.[`electives_grade${targetGrade}`] || 
          (savedConfig?.meta?.grade === targetGrade ? savedConfig?.electives : null) || [];
          
        const savedElectivesMap = new Map<string, any>();
        if (Array.isArray(savedGradeElectives)) {
          savedGradeElectives.forEach((e: any) => {
            savedElectivesMap.set(norm(e.subject), e);
          });
        }

        const parsedElectives: Elective[] = Array.from(subjMap.values()).map(({ displayName, codes: codeSet }) => {
          const normKey = norm(displayName);
          const saved = savedElectivesMap.get(normKey);
          const codes = Array.from(codeSet).sort();
          const rooms: { [key: string]: string } = {};
          const teachers: { [key: string]: string } = {};
          
          codes.forEach(c => {
            rooms[c] = (saved?.rooms && saved.rooms[c]) ? saved.rooms[c] : codeToRoom(c, targetGrade, displayName);
            teachers[c] = (saved?.teachers && saved.teachers[c]) ? saved.teachers[c] : '';
          });
          
          return {
            subject: displayName,
            raw: displayName,
            codes,
            date: saved?.date || '',
            period: saved?.period || '',
            hasExam: saved?.hasExam !== undefined ? saved.hasExam : (!isNonExamSubject(displayName) && codes.length > 0),
            rooms,
            teachers
          };
        });
        
        setStudents(parsedStudents);
        setElectives(parsedElectives);
        
        // Initialize commons: 3학년은 공통과목이 없습니다
        if (targetGrade === '3') {
          setCommons([]);
        } else {
          let gradeCommons = savedConfig?.[`commons_grade${targetGrade}`] || 
            (savedConfig?.meta?.grade === targetGrade ? savedConfig?.commons : null);

          // If primary doc has no dates or teachers, fallback to backup
          const hasCommonsDetails = gradeCommons && Array.isArray(gradeCommons) && gradeCommons.some((c: any) => c.date || c.period || Object.keys(c.teachers || {}).length > 0);
          if (!hasCommonsDetails) {
            try {
              const backupSnap = await getDoc(doc(db, 'school_data', `backup_${targetYear}_${targetTerm}`));
              if (backupSnap.exists()) {
                const bData = backupSnap.data();
                const bCommons = bData[`commons_grade${targetGrade}`] || (bData.meta?.grade === targetGrade ? bData.commons : null);
                if (bCommons && Array.isArray(bCommons) && bCommons.length > 0) {
                  gradeCommons = bCommons;
                }
              }
            } catch (bErr) {}
          }

          if (gradeCommons && Array.isArray(gradeCommons) && gradeCommons.length > 0) {
            setCommons(gradeCommons);
          } else {
            const defaults = COMMON_DEFAULTS[targetGrade]?.[targetTerm] || [];
            const initialCommons: CommonSubject[] = defaults.map(s => ({
              subject: s,
              date: '',
              period: '',
              teachers: {}
            }));
            setCommons(initialCommons);
          }
        }
        
        setUploadStatus({
          type: 'ok',
          text: `✅ DB에서 ${targetYear}학년도 ${targetTerm}학기 ${targetGrade}학년 (${parsedStudents.length}명) 데이터를 불러왔습니다.`
        });
        setIsDataLoaded(true);
      } else {
        setStudents([]);
        setElectives([]);
        
        let gradeCommons: CommonSubject[] = [];
        if (targetGrade !== '3') {
          let savedGCommons = savedConfig?.[`commons_grade${targetGrade}`] || 
            (savedConfig?.meta?.grade === targetGrade ? savedConfig?.commons : null);

          // If primary doc has no dates or teachers, fallback to backup
          const hasCommonsDetails = savedGCommons && Array.isArray(savedGCommons) && savedGCommons.some((c: any) => c.date || c.period || Object.keys(c.teachers || {}).length > 0);
          if (!hasCommonsDetails) {
            try {
              const backupSnap = await getDoc(doc(db, 'school_data', `backup_${targetYear}_${targetTerm}`));
              if (backupSnap.exists()) {
                const bData = backupSnap.data();
                const bCommons = bData[`commons_grade${targetGrade}`] || (bData.meta?.grade === targetGrade ? bData.commons : null);
                if (bCommons && Array.isArray(bCommons) && bCommons.length > 0) {
                  savedGCommons = bCommons;
                }
              }
            } catch (bErr) {}
          }

          if (savedGCommons && Array.isArray(savedGCommons) && savedGCommons.length > 0) {
            gradeCommons = savedGCommons;
          } else {
            const defaults = COMMON_DEFAULTS[targetGrade]?.[targetTerm] || [];
            gradeCommons = defaults.map(s => ({
              subject: s,
              date: '',
              period: '',
              teachers: {}
            }));
          }
        }
        setCommons(gradeCommons);
        setIsDataLoaded(true);

        setUploadStatus({
          type: 'ok',
          text: `ℹ️ ${targetYear}학년도 ${targetTerm}학기 ${targetGrade}학년 과목 설정(${gradeCommons.length}개 공통과목)이 준비되었습니다. 아래에서 엑셀 명렬표를 업로드하시면 즉시 명렬표와 좌석표가 생성됩니다.`
        });
      }
    } catch (err: any) {
      console.error(err);
      setUploadStatus({
        type: 'warn',
        text: `⚠️ 불러오기 실패: ${err.message}`
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  // GENERATE THE ROSTER MAP RECORDS
  const handleGenerateRoster = () => {
    if (students.length === 0) {
      setGenStatus({
        type: 'warn',
        text: '⚠️ 먼저 선택과목 파일을 업로드하세요.'
      });
      return;
    }

    const matchedElectivesMap: { [key: string]: Elective } = {};
    electives.forEach(e => {
      if (e.hasExam) {
        matchedElectivesMap[norm(e.subject)] = e;
        matchedElectivesMap[e.subject] = e;
      }
    });

    const records: RosterRecord[] = [];
    
    // Filter students by selected grade
    const targetStudents = students.filter(st => String(st.hak).startsWith(String(grade)));

    if (targetStudents.length === 0) {
      setGenStatus({
        type: 'warn',
        text: `⚠️ ${grade}학년 학생 데이터가 없습니다.`
      });
      return;
    }

    // Loop through each loaded student registration record for the target grade
    targetStudents.forEach(st => {
      const clsCode = String(st.hak).slice(0, 3); // front 3 digits as class code, e.g. "201"
      const clsRoom = `${String(st.hak).slice(0, 1)}학년 ${clsCode.slice(-2).replace(/^0+/, '')}반`; // fix class room name logic

      // 1. Map Common subjects
      commons.forEach(com => {
        if (!com.subject) return;
        records.push({
          hak: st.hak,
          name: st.name,
          date: com.date,
          period: com.period,
          subject: com.subject,
          code: clsCode,
          room: clsRoom,
          teacher: (com.teachers && com.teachers[clsCode]) || ''
        });
      });

      // 2. Map Selected Elective subjects
      (Object.entries(st.sel) as [string, string][]).forEach(([subj, selCode]) => {
        const electiveObj = matchedElectivesMap[norm(subj)] || matchedElectivesMap[subj];
        if (!electiveObj) return; // Skip excluded / no-exam electives
        
        records.push({
          hak: st.hak,
          name: st.name,
          date: electiveObj.date,
          period: electiveObj.period,
          subject: electiveObj.subject || subj,
          code: selCode,
          room: electiveObj.rooms[selCode] || '',
          teacher: electiveObj.teachers[selCode] || ''
        });
      });
    });

    // Sort Roster Records: Student registration number -> Exam date -> Exam period
    records.sort((a, b) => {
      const hakDiff = String(a.hak).localeCompare(String(b.hak));
      if (hakDiff !== 0) return hakDiff;

      const dateDiff = String(a.date).localeCompare(String(b.date));
      if (dateDiff !== 0) return dateDiff;

      const perA = Number(a.period) || 0;
      const perB = Number(b.period) || 0;
      return perA - perB;
    });

    setRoster(records);

    const hasIncomplete = records.some(r => !r.date || !r.period);
    const uniqueStudentsInRoster = new Set(records.map(r => r.hak)).size;

    if (hasIncomplete) {
      setGenStatus({
        type: 'warn',
        text: `⚠️ 날짜·교시가 비어있는 항목이 총 ${records.filter(r => !r.date || !r.period).length}개 있습니다. 과목 설정을 확인하세요.`
      });
    } else {
      setGenStatus({
        type: 'ok',
        text: `✅ 명렬표 생성 완료 — 학생 ${uniqueStudentsInRoster}명, 총 ${records.length}건`
      });
    }
  };

  // EXCEL EXPORT HANDLER
  const handleExportXlsx = () => {
    if (roster.length === 0) return;
    
    // Excel Header Row and Records Array
    const aoa: any[][] = [
      ['순번', '학번', '이름', '날짜', '교시', '과목', '코드', '고사실', '지도교사']
    ];

    roster.forEach((r, idx) => {
      aoa.push([
        idx + 1,
        r.hak,
        r.name,
        fmtDate(r.date),
        r.period ? Number(r.period) : '',
        r.subject,
        r.code,
        r.room,
        r.teacher
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 8 },
      { wch: 10 },
      { wch: 16 },
      { wch: 6 },
      { wch: 15 },
      { wch: 6 },
      { wch: 12 },
      { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '명렬표');
    XLSX.writeFile(wb, `${year} ${term}학기 ${examType} 고사실별 명렬표(${grade}학년).xlsx`);
  };

  // PRINT CURRENT ROSTER
  const handlePrint = () => {
    window.print();
  };

  const hasIncompleteRecords = roster.some(r => !r.date || !r.period);

  return (
    <>
      <header className="top header-container">
        <div className="top-in">
          <div className="logo">
            <img 
              src="https://i.imgur.com/6ZCUaap.jpeg" 
              alt="원묵고등학교" 
              className="h-[38px] w-auto max-w-full rounded-md"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="top-tools">
            <div className="fs-ctrl">
              글꼴크기
              <button className="icon-btn" id="fsUp" onClick={() => setFsLevel(Math.min(19, fsLevel + 1))}>+</button>
              <button className="icon-btn" id="fsReset" onClick={() => setFsLevel(15)}>↺</button>
              <button className="icon-btn" id="fsDown" onClick={() => setFsLevel(Math.max(13, fsLevel - 1))}>−</button>
            </div>
            <button className="dark-btn" id="darkToggle" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? '☀ 라이트모드' : '🌙 다크모드'}
            </button>
          </div>
        </div>
      </header>

      <div className="wrap">
        <LegacyImport />
        {/* HERO */}
        <div className="hero">
          <div className="pills">
            <span className="pill-nav">⏱ 업무 자동화 도구</span>
            <span className="pill-data">DATA POWERED</span>
          </div>
          <h1 className="text-white">시험 현황 자동화 시스템</h1>
          <p>선택 과목 데이터를 분석하여 고사실별 명렬표를 빠르고 정확하게 생성합니다.</p>
          <div className="deco">📝</div>
        </div>

        {/* STEP 1: Basic Info & Data Sync */}
        <div className="card">
          <div className="card-head">
            <h2>
              <span className="num">1</span> 기본 학사 정보 &amp; 데이터 동기화
            </h2>
            <span className="scope">Scope Setting</span>
          </div>
          <div className="row mb-[18px]">
            <div className="field">
              <label>학년도</label>
              <input type="text" id="year" value={year} onChange={(e) => handleYearChange(e.target.value)} />
            </div>
            <div className="field">
              <label>학기</label>
              <select id="term" value={term} onChange={(e) => handleTermChange(e.target.value)}>
                <option value="1">1학기</option>
                <option value="2">2학기</option>
              </select>
            </div>
            <div className="field">
              <label>고사 구분</label>
              <select id="examType" value={examType} onChange={(e) => setExamType(e.target.value)}>
                <option value="중간고사">중간고사</option>
                <option value="기말고사">기말고사</option>
              </select>
            </div>
            <div className="field col-span-2 sm:col-span-1">
              <label className="font-semibold text-gray-700 dark:text-gray-300">학년 선택</label>
              <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                {(['1', '2', '3'] as const).map((g) => {
                  const isSelected = grade === g;
                  const count = dbOverview ? (g === '1' ? dbOverview.g1Count : g === '2' ? dbOverview.g2Count : dbOverview.g3Count) : null;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => handleGradeChange(g)}
                      className={`flex-1 py-1.5 px-2 rounded-md font-bold text-xs sm:text-sm flex flex-col items-center justify-center transition cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span>{g}학년</span>
                      {count !== null && count > 0 && (
                        <span className={`text-[10px] font-medium leading-none mt-0.5 ${isSelected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                          {count}명
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* DB Data Storage Status Box (Admin Only) */}
          {isAdmin && (
            <div className="mb-4 p-3.5 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 rounded-xl flex flex-wrap items-center justify-between gap-3 text-sm animate-fade-in">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base">📦</span>
                <span className="font-bold text-gray-900 dark:text-white">파이어베이스 DB 보관 상태 ({year}학년도 {term}학기):</span>
                {dbOverview ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${dbOverview.g1Count > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-200' : 'bg-gray-100 text-gray-600'}`}>
                      1학년: {dbOverview.g1Count}명
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${dbOverview.g2Count > 0 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-200' : 'bg-gray-100 text-gray-600'}`}>
                      2학년: {dbOverview.g2Count}명
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${dbOverview.g3Count > 0 ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/80 dark:text-purple-200' : 'bg-gray-100 text-gray-600'}`}>
                      3학년: {dbOverview.g3Count}명
                    </span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <span>✓</span> 데이터 보존 완료
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">DB 상태 확인 중...</span>
                )}
              </div>
              {isDataLoaded && (
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-1 rounded-md">
                  현재 화면 표시: {grade}학년 ({students.length}명)
                </span>
              )}
            </div>
          )}
          
          <div className="mt-2 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button 
                type="button"
                className="btn primary flex items-center gap-2 px-6 py-2.5 font-bold shadow-sm hover:shadow transition cursor-pointer"
                onClick={() => handleLoadFromFirebase(year, term, grade)}
                disabled={isLoadingData}
              >
                {isLoadingData ? (
                  <>
                    <span className="animate-spin inline-block mr-1">⏳</span>
                    데이터 불러오는 중...
                  </>
                ) : (
                  <>
                    <span>📥</span>
                    {year}학년도 {term}학기 {grade}학년 데이터 불러오기
                  </>
                )}
              </button>
              {isDataLoaded && (
                <div className="flex items-center gap-2 flex-wrap animate-fade-in">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <span>●</span> 데이터 연동 완료 ({year}년 {term}학기 {grade}학년: {students.length}명)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDataLoaded(false);
                      setRoster([]);
                      setGenStatus(null);
                    }}
                    className="btn ghost sm text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 py-1 px-2.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition"
                    title="조회 닫기 (첫 화면 상태로 복귀)"
                  >
                    ✕ 조회 닫기
                  </button>
                </div>
              )}
            </div>
            {!isDataLoaded && !isLoadingData && (
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <span>💡</span> 기본 학사 정보를 확인하신 후 <strong>[데이터 불러오기]</strong> 버튼을 누르면 시험 과목 및 시간표 화면이 열립니다.
              </p>
            )}
          </div>
          
          {isAdmin && (
            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6 animate-fade-in">
              <div className="bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚙️</span>
                    <h3 className="font-bold text-base text-gray-900 dark:text-white">
                      관리자 전용: 시스템 기본값(디폴트) 설정
                    </h3>
                  </div>
                  {currentDefault && (
                    <span className="text-xs text-indigo-700 dark:text-indigo-300 bg-white dark:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-700 px-3 py-1 rounded-full font-medium shadow-2xs">
                      현재 디폴트: <strong>{currentDefault.year}학년도 {currentDefault.term}학기 {currentDefault.examType} ({currentDefault.grade}학년)</strong>
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  선생님 및 학생들이 앱에 접속했을 때 가장 먼저 열리는 기본 학사 정보(학년도, 학기, 고사 구분, 학년)를 설정합니다.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <button 
                    type="button" 
                    className="btn bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition cursor-pointer"
                    onClick={() => handleSaveDefaultSettings()}
                  >
                    📌 현재 선택값({year}년 {term}학기 {examType} {grade}학년)을 기본값으로 저장
                  </button>
                  {defaultSaveSuccess && (
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-800 animate-fade-in flex items-center gap-1.5">
                      <span>✅</span> 시스템 기본값이 성공적으로 저장되었습니다!
                    </span>
                  )}
                </div>
              </div>

              <h3 className="font-bold mb-4 dark:text-white">관리자 전용: 엑셀 파일로 학생 명단 업데이트</h3>
              
              {/* Sample Download Section */}
              <div className="mb-5 p-4 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📋</span>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                      학년별 명렬표 엑셀 양식 다운로드 &amp; 업로드 가이드
                    </h4>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    버튼 클릭 시 해당 학년 엑셀 양식(.xlsx) 즉시 다운로드
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div className="p-3 bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-800/60 rounded-lg flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300 text-sm mb-1">
                        <span>🌱</span> 1학년 양식 (공통과목)
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">
                        <strong>[순번], [학번], [이름]</strong> 및 <strong>학기별 공통과목명 열</strong>이 포함된 표준 양식입니다. 학교의 개설 과목에 맞게 공통과목 열을 추가·수정하여 업로드하실 수 있습니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadSample('1')}
                      className="btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1.5 px-3 rounded shadow-xs w-full flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <span>📥</span> 1학년 ({term}학기) 샘플 양식 받기
                    </button>
                  </div>

                  <div className="p-3 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800/60 rounded-lg flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-blue-700 dark:text-blue-300 text-sm mb-1">
                        <span>📘</span> 2학년 양식 (선택과목)
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">
                        <strong>[순번], [학번], [이름]</strong> 및 각 선택과목별 <strong>분반코드(A, B, C...)</strong>가 기록된 표준 엑셀 양식입니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadSample('2')}
                      className="btn bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-3 rounded shadow-xs w-full flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <span>📥</span> 2학년 샘플 양식 받기
                    </button>
                  </div>

                  <div className="p-3 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800/60 rounded-lg flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-purple-700 dark:text-purple-300 text-sm mb-1">
                        <span>🎓</span> 3학년 양식 (선택과목)
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">
                        전체 선택과목으로 운영되며 과목별 <strong>분반코드(A, B, C...)</strong>가 기록된 표준 엑셀 양식입니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadSample('3')}
                      className="btn bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-1.5 px-3 rounded shadow-xs w-full flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <span>📥</span> 3학년 샘플 양식 받기
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 bg-white/70 dark:bg-gray-900/40 p-2.5 rounded-md border border-gray-200/60 dark:border-gray-700/60">
                  💡 <strong>나이스(NEIS) 연계 안내:</strong> 나이스에서 내려받은 학생 명렬표(순번/연번, 학번, 이름/성명 열 포함)를 바로 업로드하셔도 시스템이 헤더를 자동 인식하여 정상 등록됩니다.
                </div>
              </div>

              <div 
                className={`drop ${dragOver ? 'over' : ''}`} 
                id="drop"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <div id="dropText">
                  📂 {grade}학년 명렬표 파일을 클릭하거나 드래그하세요
                  <br />
                  <small className="text-gray-400">
                    {grade === '1' 
                      ? `예: ${year} 1학년 학생명렬표.xlsx (학번, 성명 열 포함) · 지원: .xlsx / .xls / .csv`
                      : `예: ${year} ${term}학기 선택과목(${grade}학년).xlsx · 지원: .xlsx / .xls / .csv`}
                  </small>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  id="file" 
                  accept=".xlsx,.xls,.csv" 
                  className="hidden" 
                  onChange={onFileSelectChange}
                />
              </div>
            </div>
          )}

          {uploadStatus && (
            <div id="uploadStatus">
              <div className={`status ${uploadStatus.type === 'ok' ? 'ok' : 'warn'}`}>
                {uploadStatus.text}
              </div>
            </div>
          )}
        </div>

        {/* STEP 2: Common subjects configuration */}
        {isDataLoaded && (
          <div className="card" id="commonCard">
            <div className="card-head">
              <h2>
                <span className="num">2</span> 공통과목 설정 <span className="pill-count" id="commonCount">{commons.length}과목</span>
              </h2>
              <span className="scope">Common</span>
            </div>
            <p className="hint">
              전교생이 자기 반에서 응시합니다. 코드·고사실은 학번에서 자동 배정됩니다. 과목별 날짜·교시와 반별 지도교사만 입력하세요.
            </p>
            <div id="commonArea">
              {commons.length === 0 ? (
                <div className="py-6 px-4 text-center bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 my-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {grade === '3' ? (
                      <>
                        📌 <strong>3학년은 공통과목이 없습니다.</strong>
                        <br />
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 inline-block">
                          모든 과목은 아래 <strong>Step 3 선택과목</strong>에서 고사실과 시험 일정이 배정됩니다.
                        </span>
                      </>
                    ) : (
                      <>
                        등록된 공통과목이 없습니다. 필요 시 아래 '+ 공통과목 추가' 버튼을 눌러 추가할 수 있습니다.
                      </>
                    )}
                  </p>
                </div>
              ) : (
                commons.map((com, ci) => (
                  <div className="subcard animate-fade-in" key={ci}>
                  <div className="row mb-[10px]">
                    <div className="field">
                      <label>과목명</label>
                      <input 
                        type="text" 
                        value={com.subject} 
                        onChange={(e) => handleCommonSubjectChange(ci, e.target.value)} 
                        className="cSubject !bg-gray-800 !text-white !font-bold border-gray-900"
                      />
                    </div>
                    <div className="field">
                      <label>날짜</label>
                      <input 
                        type="date" 
                        value={com.date} 
                        onChange={(e) => handleCommonDateChange(ci, e.target.value)} 
                        className="cDate"
                      />
                    </div>
                    <div className="field">
                      <label>교시</label>
                      <select 
                        value={com.period} 
                        onChange={(e) => handleCommonPeriodChange(ci, e.target.value)} 
                        className="cPeriod"
                      >
                        <option value="">-</option>
                        {PERIODS.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <button className="btn ghost sm delCommon" onClick={() => handleDelCommon(ci)}>
                      삭제
                    </button>
                  </div>
                  
                  {/* Proctor mapping cards for each unique class code */}
                  <div className="code-teacher">
                    {uniqueClasses.map((cl) => {
                      const classPartNum = cl.slice(-1);
                      return (
                        <div className="ct" key={cl}>
                          <b>{grade}학년 {classPartNum}반</b>
                          <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 font-bold text-[11px] border border-gray-200">
                            코드 {cl}
                          </span>
                          <input 
                            type="text" 
                            placeholder="지도교사" 
                            className="ctTeacher"
                            value={com.teachers[cl] || ''}
                            onChange={(e) => handleCommonTeacherChange(ci, cl, e.target.value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )))}
            </div>
            <div className="toolbar">
              <button className="btn ghost sm" id="addCommon" onClick={handleAddCommon}>
                + 공통과목 추가
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Elective subjects config */}
        {isDataLoaded && (
          <div className="card" id="electiveCard">
            <div className="card-head">
              <h2>
                <span className="num">3</span> 선택과목 설정 <span className="pill-count" id="electiveCount">{electives.length}과목</span>
              </h2>
              <span className="scope">Elective</span>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="hint !mb-0">
                <b>시험이 없는 과목은 '없음'으로 표시</b>하면 명렬표에서 제외됩니다(예: 수행평가 과목). 코드→고사실은 자동 기본값이며 수정할 수 있습니다.
              </p>
              {isAdmin && (
                <button
                  type="button"
                  className="btn bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
                  onClick={handleImportTeachersFromTimetable}
                  title="DB에 등록된 시간표에서 담당교사 배정을 자동으로 불러와 일괄 입력합니다."
                >
                  <span>📅</span> 시간표에서 담당교사 자동 가져오기
                </button>
              )}
            </div>
            {timetableStatus && (
              <div className="mb-3">
                <div className="status ok font-semibold flex items-center gap-2">
                  <span>🔔</span> {timetableStatus}
                </div>
              </div>
            )}
            {electives.length === 0 ? (
              <div className="py-8 px-4 text-center bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 my-2">
                <div className="text-3xl mb-2">📌</div>
                <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">
                  {grade === '1' ? '1학년은 전 과목 공통(6과목)으로 운영됩니다' : '등록된 선택과목이 없습니다'}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-300 max-w-lg mx-auto leading-relaxed">
                  {grade === '1' 
                    ? '1학년은 선택과목 분반 이동 없이 전원 본인 학급에서 응시하므로, 위의 [Step 2 공통과목 설정]에서 과목별 시험 날짜, 교시 및 학급별 지도교사를 설정하시면 됩니다.'
                    : '선택과목 엑셀 명렬표를 업로드하시면 각 과목과 분반 코드가 이곳에 자동으로 생성됩니다.'}
                </p>
              </div>
            ) : (
              <div id="electiveArea" className="overflow-x-auto">
                <table className="min-w-full">
                <thead>
                  <tr>
                    <th style={{ width: '150px' }}>과목</th>
                    <th style={{ width: '80px' }}>시험</th>
                    <th style={{ width: '150px' }}>날짜</th>
                    <th style={{ width: '70px' }}>교시</th>
                    <th>코드별 고사실 / 지도교사</th>
                  </tr>
                </thead>
                <tbody>
                  {electives.map((e, ei) => (
                    <tr key={ei}>
                      <td style={{ textAlign: 'left' }} className="whitespace-nowrap">
                        <span className="inline-block px-3 py-1.5 rounded-lg bg-gray-800 text-white font-extrabold text-[15.5px] border border-gray-900 shadow-sm whitespace-nowrap">
                          {e.subject}
                        </span>
                      </td>
                      <td>
                        <select 
                          className={`eHas !font-extrabold border shadow-sm transition-all duration-200 ${
                            e.hasExam 
                              ? '!bg-green-200 !text-green-800 border-green-400' 
                              : '!bg-red-100 !text-red-800 border-red-300'
                          }`}
                          value={e.hasExam ? '1' : '0'} 
                          onChange={(ev) => handleElectiveHasChange(ei, ev.target.value === '1')}
                        >
                          <option value="1" className="bg-white text-black font-normal">있음</option>
                          <option value="0" className="bg-white text-black font-normal">없음</option>
                        </select>
                      </td>
                      <td>
                        <input 
                          type="date" 
                          className="eDate" 
                          value={e.date} 
                          onChange={(ev) => handleElectiveDateChange(ei, ev.target.value)} 
                        />
                      </td>
                      <td>
                        <select 
                          className="ePeriod" 
                          value={e.period} 
                          onChange={(ev) => handleElectivePeriodChange(ei, ev.target.value)}
                        >
                          <option value="">-</option>
                          {PERIODS.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="code-teacher">
                          {e.codes.map(c => (
                            <div className="ct" key={c}>
                              <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-800 font-extrabold text-[12.5px] border border-gray-200 shadow-sm whitespace-nowrap">
                                코드 {c}
                              </span>
                              <input 
                                type="text" 
                                className="eRoom" 
                                placeholder="고사실" 
                                value={e.rooms[c] || ''} 
                                onChange={(ev) => handleElectiveRoomChange(ei, c, ev.target.value)}
                              />
                              <input 
                                type="text" 
                                className="eTeacher" 
                                placeholder="지도교사" 
                                value={e.teachers[c] || ''} 
                                onChange={(ev) => handleElectiveTeacherChange(ei, c, ev.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}

        {/* STEP 4: Configuration storage save/load */}
        {isAdmin && isDataLoaded && (
          <div className="card" id="saveCard">
          <div className="card-head">
            <h2>
              <span className="num">4</span> 설정 저장
            </h2>
            <span className="scope">Config</span>
          </div>
          <p className="hint">
            현재 설정을 파이어베이스에 저장하여 공동으로 사용할 수 있습니다.
          </p>
          <div className="toolbar flex flex-wrap gap-2">
            <button className="btn green" id="saveFirebase" onClick={handleSaveToFirebase}>
              💾 파이어베이스에 설정 저장
            </button>
            <button 
              type="button"
              className="btn bg-sky-600 hover:bg-sky-700 text-white font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer" 
              id="importTimetableTeachersBtn"
              onClick={handleImportTeachersFromTimetable}
              title="DB에 등록된 시간표 원본에서 담당교사 배정을 자동으로 읽어와 입력합니다."
            >
              📅 시간표에서 담당교사 자동 가져오기
            </button>
            <button 
              className="btn bg-indigo-600 hover:bg-indigo-700 text-white" 
              id="saveDefaultBtn" 
              onClick={() => handleSaveDefaultSettings()}
              title="현재 학년도/학기/고사/학년을 첫 접속 기본값으로 지정"
            >
              📌 이 설정을 디폴트로 지정
            </button>
            <button className="btn ghost" id="previewBtn" onClick={() => setShowPreview(!showPreview)}>
              🔍 설정 요약 미리보기
            </button>
          </div>
          {saveStatus && (
            <div id="saveStatus">
              <div className={`status ${saveStatus.type === 'ok' ? 'ok' : 'warn'}`}>
                {saveStatus.text}
              </div>
            </div>
          )}
          <pre id="preview" className={showPreview ? '' : 'hidden'}>
            {JSON.stringify(configObject, null, 2)}
          </pre>
        </div>
        )}

        {/* STEP 5: Roster generator output results */}
        {isDataLoaded && (
          <div className="card animate-fade-in" id="genCard">
            <div className="card-head">
              <h2>
                <span className="num">5</span> 고사실별 명렬표 생성 <span className="pill-count" id="genCount">{roster.length}건</span>
              </h2>
              <span className="scope">Output</span>
            </div>
            <p className="hint">
              설정을 바탕으로 고사실별 명렬표를 생성합니다. 생성된 엑셀(.xlsx)을 기존 시스템(응시현황표·자리배치표·시험 시간표 생성 앱)에 업로드하여 최종 문서를 만드세요.
            </p>
            <div className="toolbar">
              <button className="btn" id="genBtn" onClick={handleGenerateRoster}>
                📋 명렬표 생성
              </button>
              {roster.length > 0 && (
                <>
                  <button className="btn green" id="exportXlsx" onClick={handleExportXlsx}>
                    ⬇️ 엑셀(.xlsx) 내보내기
                  </button>
                  <button className="btn ghost" id="printRoster" onClick={handlePrint}>
                    🖨️ 인쇄
                  </button>
                </>
              )}
            </div>
            {genStatus && (
              <div id="genStatus">
                <div className={`status ${genStatus.type === 'ok' ? 'ok' : 'warn'}`}>
                  {genStatus.text}
                </div>
              </div>
            )}
            
            {/* Generated results grid display */}
            {roster.length > 0 && (
              <div id="genArea" style={{ marginTop: '14px', maxHeight: '520px', overflow: 'auto' }}>
                {hasIncompleteRecords && (
                  <div className="status warn mb-4">
                    ⚠️ 날짜·교시가 비어있는 항목이 있습니다. 과목 설정을 확인하세요.
                  </div>
                )}
                <table>
                  <thead>
                    <tr>
                      <th>순번</th>
                      <th>학번</th>
                      <th>이름</th>
                      <th>날짜</th>
                      <th>교시</th>
                      <th>과목</th>
                      <th>코드</th>
                      <th>고사실</th>
                      <th>지도교사</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((r, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{r.hak}</td>
                        <td>{r.name}</td>
                        <td>{fmtDate(r.date)}</td>
                        <td>{r.period || ''}</td>
                        <td style={{ textAlign: 'left' }}>{r.subject}</td>
                        <td>{r.code}</td>
                        <td>{r.room}</td>
                        <td style={{ textAlign: 'left' }}>{r.teacher}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PRINT-ONLY ROOT CONTAINER */}
      <div id="printRoot" className="print-only">
        {roster.length > 0 && (
          <div className="sheet">
            <h3>{year}학년도 {term}학기 {examType} 고사실별 명렬표 ({grade}학년)</h3>
            <table className="roster">
              <thead>
                <tr>
                  <th>순번</th>
                  <th>학번</th>
                  <th>이름</th>
                  <th>날짜</th>
                  <th>교시</th>
                  <th>과목</th>
                  <th>코드</th>
                  <th>고사실</th>
                  <th>지도교사</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td className="hl">{r.hak}</td>
                    <td className="hl">{r.name}</td>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.period || ''}</td>
                    <td>{r.subject}</td>
                    <td>{r.code}</td>
                    <td>{r.room}</td>
                    <td>{r.teacher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
