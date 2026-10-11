import { CommonSubject, Elective } from './types.ts';

const ABBR_MAP: { [key: string]: string[] } = {
  // 2학년
  '인공지능 수학2': ['인수2', '인수'],
  '인공지능수학2': ['인수2', '인수'],
  '역학과 에너지': ['역학'],
  '역학과에너지': ['역학'],
  '화학 반응의 세계': ['화학'],
  '화학반응의세계': ['화학'],
  '세포와 물질대사': ['세포'],
  '세포와물질대사': ['세포'],
  '데이터 과학': ['데과'],
  '데이터과학': ['데과'],
  '사회와 문화': ['사문'],
  '사회와문화': ['사문'],
  '윤리와 사상2': ['윤사2', '윤사'],
  '윤리와사상2': ['윤사2', '윤사'],
  '독서 토론과 글쓰기': ['독서'],
  '독서토론과글쓰기': ['독서'],
  '한국지리 탐구': ['한지'],
  '한국지리탐구': ['한지'],
  '동아시아 역사 기행': ['동사'],
  '동아시아역사기행': ['동사'],
  '중국어 회화': ['중회'],
  '중국어회화': ['중회'],
  '세계문화와 영어': ['세영'],
  '세계문화와영어': ['세영'],
  '일본어 회화': ['일회'],
  '일본어회화': ['일회'],
  '행성 우주 과학': ['행성'],
  '행성우주과학': ['행성'],
  '심화체육전공실기': ['심체', '체심'],

  // 3학년
  '화법과 작문': ['화작'],
  '화법과작문': ['화작'],
  '독서': ['독서'],
  '고전 읽기': ['고전'],
  '고전읽기': ['고전'],
  '미적분': ['미적'],
  '확률과 통계': ['확통'],
  '확률과통계': ['확통'],
  '영어 독해와 작문': ['영독'],
  '영어독해와작문': ['영독'],
  '윤리와 사상': ['윤사'],
  '윤리와사상': ['윤사'],
  '정치와 법': ['정법'],
  '정치와법': ['정법'],
  '사회·문화': ['사문'],
  '사회문화': ['사문'],
  '여행지리': ['여지'],
  '세계지리': ['세지'],
  '물리학Ⅱ': ['물Ⅱ', '물2'],
  '물리학2': ['물Ⅱ', '물2'],
  '화학Ⅱ': ['화Ⅱ', '화2'],
  '화학2': ['화Ⅱ', '화2'],
  '생명과학Ⅱ': ['생Ⅱ', '생2'],
  '생명과학2': ['생Ⅱ', '생2'],
  '지구과학Ⅱ': ['지Ⅱ', '지2'],
  '지구과학2': ['지Ⅱ', '지2'],
  '생활과 과학': ['생활'],
  '생활과과학': ['생활'],
  '환경': ['환경'],
  '운동과 건강': ['운건'],
  '운동과건강': ['운건'],
  '인공지능 기초': ['인지'],
  '인공지능기초': ['인지'],
  '일본어Ⅱ': ['일Ⅱ', '일2'],
  '일본어2': ['일Ⅱ', '일2'],
  '중국어Ⅱ': ['중Ⅱ', '중2'],
  '중국어2': ['중Ⅱ', '중2'],
  '창의경영': ['창경', '창독'],
  '실용 경제': ['실경'],
  '실용경제': ['실경'],
  '교육학': ['교육']
};

const NON_EXAM_KEYWORDS = [
  '체육', '실기', '운동', '창독', '창체', '시창', '청음', '평면조형', '음악이론', '미술전공'
];

export function isNonExamSubject(name: string): boolean {
  const clean = String(name || '').replace(/\s+/g, '');
  return NON_EXAM_KEYWORDS.some(k => clean.includes(k));
}

export function autoAssignTeachersFromTimetable(
  timetableStr: string,
  grade: string,
  currentCommons: CommonSubject[],
  currentElectives: Elective[]
): { commons: CommonSubject[]; electives: Elective[]; count: number } {
  if (!timetableStr) {
    return { commons: currentCommons, electives: currentElectives, count: 0 };
  }

  const lines = timetableStr.split('\n').filter(l => l.trim().length > 0);
  let assignedCount = 0;

  // Block map: `${code}_${subjKey}` -> teacher
  const blockTeacherMap: { [key: string]: string } = {};
  // Class map: `${room}_${subjKey}` -> teacher
  const classTeacherMap: { [key: string]: string } = {};

  for (let i = 2; i < lines.length; i += 2) {
    const tRow = lines[i].split(',');
    const sRow = lines[i + 1] ? lines[i + 1].split(',') : [];
    const teacher = tRow[0]?.trim();
    if (!teacher) continue;

    for (let c = 1; c < tRow.length; c++) {
      const room = tRow[c]?.trim();
      const subj = sRow[c]?.trim();
      if (!subj) continue;

      // Check block pattern e.g. "A인수2", "D화학"
      const blockMatch = subj.match(/^([A-J])(.+)$/);
      if (blockMatch) {
        const blk = blockMatch[1];
        const rawS = blockMatch[2];
        blockTeacherMap[`${blk}_${rawS}`] = teacher;
      }

      // Check room pattern e.g. "201", "202"
      if (room && /^\d{3}$/.test(room)) {
        classTeacherMap[`${room}_${subj}`] = teacher;
      }
    }
  }

  // 1. Assign to Commons (Grade 1 & 2 have commons; Grade 3 has none)
  const updatedCommons = currentCommons.map(com => {
    const newTeachers = { ...com.teachers };
    for (let cl = 1; cl <= 12; cl++) {
      const roomStr = `${grade}${String(cl).padStart(2, '0')}`;
      for (const [key, teacher] of Object.entries(classTeacherMap)) {
        if (key.startsWith(`${roomStr}_`)) {
          const sName = key.slice(4);
          const cSubj = com.subject;
          if (
            // Grade 1 Commons
            (cSubj.includes('공통국어') && (sName.includes('공국') || sName.includes('국어'))) ||
            (cSubj.includes('공통수학') && (sName.includes('공수') || sName.includes('수학'))) ||
            (cSubj.includes('공통영어') && (sName.includes('공영') || sName.includes('영어'))) ||
            (cSubj.includes('통합사회') && (sName.includes('통사') || sName.includes('사회'))) ||
            (cSubj.includes('통합과학') && (sName.includes('통과') || sName.includes('과학'))) ||
            (cSubj.includes('한국사') && (sName.includes('한사') || sName.includes('한국사'))) ||
            // Grade 2 Commons
            (cSubj.includes('화법') && (sName.includes('화언') || sName.includes('화법'))) ||
            (cSubj.includes('미적분') && sName.includes('미적')) ||
            (cSubj.includes('영어') && (sName.includes('영어') || sName.includes('영Ⅱ') || sName.includes('영어II') || sName.includes('영2'))) ||
            (cSubj.includes('대수') && sName.includes('수학')) ||
            (cSubj.includes('문학') && sName.includes('국어'))
          ) {
            newTeachers[roomStr] = teacher;
            assignedCount++;
          }
        }
      }
    }
    return { ...com, teachers: newTeachers };
  });

  // 2. Assign to Electives
  const updatedElectives = currentElectives.map(e => {
    const newTeachers = { ...e.teachers };
    const abbrs = ABBR_MAP[e.subject] || [e.subject];

    e.codes.forEach(code => {
      let matched = '';
      for (const abbr of abbrs) {
        if (blockTeacherMap[`${code}_${abbr}`]) {
          matched = blockTeacherMap[`${code}_${abbr}`];
          break;
        }
      }
      if (!matched) {
        for (const [k, t] of Object.entries(blockTeacherMap)) {
          if (k.startsWith(`${code}_`) && (e.subject.includes(k.slice(2)) || k.slice(2).includes(e.subject.slice(0, 2)))) {
            matched = t;
            break;
          }
        }
      }
      if (matched) {
        newTeachers[code] = matched;
        assignedCount++;
      }
    });

    return { ...e, teachers: newTeachers };
  });

  return { commons: updatedCommons, electives: updatedElectives, count: assignedCount };
}
