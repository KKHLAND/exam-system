import React, { useState, useCallback, useMemo, useEffect, Fragment } from 'react';
import { doc as fsDoc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db as firestore } from '../shared/firebase';
import { getAuthState, loginAdmin, logoutAdmin, subscribeAuth } from '../shared/auth';
// Papa(CSV), XLSX(엑셀)는 index.html의 CDN 전역 스크립트를 그대로 사용합니다.

// ==========================================
// 유틸리티 함수
// ==========================================
const getTimeSlotKey = (date, period) => `${date}|${period}`;

const isExamTypeMatch = (entry, selectedExamType, selectedSemester) => {
    if (!selectedExamType) return true;
    const examTypeKeys = ['구분', '고사구분', '고사', '시험구분', '시험명', '고사명', '시험', '유형', '시험유형', '고사 구분', '구 분'];
    let val = null;
    for (const key of examTypeKeys) {
        if (entry[key] !== undefined && entry[key] !== null) {
            const tempVal = String(entry[key]).trim();
            if (tempVal !== '') {
                val = tempVal;
                break;
            }
        }
    }

    if (val !== null && val !== '') {
        const isMid = selectedExamType === 'midterm';
        val = val.toLowerCase();

        const hasFinalKeyword = val.includes('기말') || val.includes('final') || val.includes('2차') || val.includes('2회') || val.includes('기말고사');
        const hasMidKeyword = val.includes('중간') || val.includes('mid') || val.includes('1차') || val.includes('1회') || val.includes('중간고사');

        if (isMid) {
            return !hasFinalKeyword;
        } else {
            return hasFinalKeyword || (!hasMidKeyword && val !== '');
        }
    }

    // 날짜의 '월' 정보에 의한 대비 검사
    if (entry.날짜) {
        let dateStr = String(entry.날짜).trim();
        const match = dateStr.match(/(?:^|\D)(0?[1-9]|1[0-2])(?:\/|-|월)/);
        if (match) {
            const month = parseInt(match[1], 10);
            const isMid = selectedExamType === 'midterm';
            const sem = selectedSemester || '1';

            if (sem === '1' || sem.includes('1')) {
                if (isMid) {
                    return month >= 3 && month <= 5;
                } else {
                    return month === 6 || month === 7;
                }
            } else {
                if (isMid) {
                    return month >= 8 && month <= 10;
                } else {
                    return month === 11 || month === 12 || month === 1 || month === 2;
                }
            }
        }
    }

    return true;
};

const filterDataByMetadata = (entry, meta) => {
    if (!meta) return true;
    
    // 1. 학년 필터 (가장 엄격하게 체크)
    if (meta.grade) {
        const gradeStr = String(meta.grade).trim();
        const sid = String(entry.학번 || '').trim();
        const matchesSid = sid.startsWith(gradeStr);
        
        let hasGradeCol = false;
        let matchesCol = false;
        const gradeCol = entry['학년'] || entry['학년구분'] || entry['학년 구분'] || entry['대상학년'];
        
        if (gradeCol !== undefined && gradeCol !== null && String(gradeCol).trim() !== '') {
            hasGradeCol = true;
            matchesCol = String(gradeCol).trim().includes(gradeStr);
        }
        
        // 학번이나 학년 컬럼 중 하나라도 있고, 그 값이 일치해야 함
        if (sid && hasGradeCol) {
            if (!matchesSid && !matchesCol) return false;
        } else if (sid) {
            if (!matchesSid) return false;
        } else if (hasGradeCol) {
            if (!matchesCol) return false;
        } else {
            // 학년 정보가 전혀 없는 행은 필터링이 활성화된 경우 배제합니다.
            return false;
        }
    }

    // 2. 학년도 필터
    if (meta.year) {
        const yearStr = String(meta.year).trim();
        let yearMatch = false;
        
        if (entry.날짜) {
            const formattedDate = formatUniformDate(entry.날짜, yearStr);
            if (formattedDate.startsWith(yearStr)) {
                yearMatch = true;
            }
        }
        
        const yearCol = entry['학년도'] || entry['연도'] || entry['시험연도'] || entry['대상연도'];
        if (yearCol !== undefined && yearCol !== null && String(yearCol).trim() !== '') {
            if (String(yearCol).trim().includes(yearStr)) {
                yearMatch = true;
            }
        }
        
        if (!yearMatch) return false;
    }

    // 3. 학기 필터
    if (meta.semester) {
        const semStr = String(meta.semester).trim();
        let semMatch = true;
        
        const semCol = entry['학기'] || entry['학기구분'] || entry['학기 구분'] || entry['대상학기'];
        if (semCol !== undefined && semCol !== null && String(semCol).trim() !== '') {
            const val = String(semCol).trim();
            semMatch = val.includes(semStr);
        } else if (entry.날짜) {
            let dateStr = String(entry.날짜).trim();
            const match = dateStr.match(/(?:^|\D)(0?[1-9]|1[0-2])(?:\/|-|월)/);
            if (match) {
                const month = parseInt(match[1], 10);
                if (semStr === '1' || semStr.includes('1')) {
                    semMatch = (month >= 3 && month <= 7);
                } else {
                    semMatch = (month >= 8 && month <= 12) || (month === 1) || (month === 2);
                }
            }
        }
        
        if (!semMatch) return false;
    }

    // 4. 고사 구분 필터
    if (meta.examType) {
        if (!isExamTypeMatch(entry, meta.examType, meta.semester)) {
            return false;
        }
    }

    return true;
};

const formatUniformDate = (rawDate, defaultYear) => {
    if (!rawDate) return '';
    let dateStr = String(rawDate).trim();
    let year = defaultYear, month = 1, day = 1, dow = '';
    if (/^\d{5}$/.test(dateStr)) {
        const serial = parseInt(dateStr, 10);
        const dateObj = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        year = dateObj.getUTCFullYear(); month = dateObj.getUTCMonth() + 1; day = dateObj.getUTCDate();
    } else {
        const dateRegex = /(?:(\d{4})[년.\-\/]\s*)?(\d{1,2})[월.\-\/]\s*(\d{1,2})[일]?/;
        const match = dateStr.match(dateRegex);
        if (match) { if (match[1]) year = match[1]; month = parseInt(match[2], 10); day = parseInt(match[3], 10); }
        else return dateStr;
    }
    const dowMatch = String(rawDate).match(/\(([가-힣a-zA-Z])\)/);
    if (dowMatch) { dow = dowMatch[1]; }
    else { const d = new Date(year, month - 1, day); dow = ['일','월','화','수','목','금','토'][d.getDay()]; }
    return `${year}/${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}(${dow})`;
};

// ── 통합 CSV 생성 ──
const generatePersonalTimetableCsv = (data, metadata, headerInputs) => {
    const studentSchedules = new Map();
    const timeSlotSet = new Set();
    const filteredData = data.filter(entry => filterDataByMetadata(entry, metadata));
    filteredData.forEach(entry => {
        if (!entry.학번 || !entry.이름 || !entry.날짜 || !entry.교시 || !entry.과목) return;
        if (isNaN(parseInt(entry.교시, 10))) return;
        if (!studentSchedules.has(entry.학번)) studentSchedules.set(entry.학번, { name: entry.이름, exams: {} });
        const studentData = studentSchedules.get(entry.학번);
        if (studentData) studentData.exams[getTimeSlotKey(entry.날짜, entry.교시)] = entry.과목;
        timeSlotSet.add(getTimeSlotKey(entry.날짜, entry.교시));
    });
    const sortedTimeSlots = Array.from(timeSlotSet).map(s => {
        const [date, period] = s.split('|');
        return { date, period: parseInt(period) };
    }).sort((a, b) => {
        const dateA = new Date(a.date.split('(')[0].replace(/\//g, '-'));
        const dateB = new Date(b.date.split('(')[0].replace(/\//g, '-'));
        return dateA - dateB || a.period - b.period;
    });
    const csvRows = [];
    const headerRow1 = ['날짜', ''];
    const dateColspans = {};
    sortedTimeSlots.forEach(slot => { dateColspans[slot.date] = (dateColspans[slot.date] || 0) + 1; });
    const processedDates = new Set();
    sortedTimeSlots.forEach(slot => {
        if (!processedDates.has(slot.date)) {
            headerRow1.push(slot.date);
            for (let i = 1; i < dateColspans[slot.date]; i++) headerRow1.push('');
            processedDates.add(slot.date);
        }
    });
    csvRows.push(headerRow1);
    const headerRow2 = ['과목', ''];
    sortedTimeSlots.forEach(slot => {
        // [수정] 이 타임슬롯에 배정된 '현재 학년' 학생들의 과목들만 추출합니다.
        const matchingEntries = filteredData.filter(e => {
            const entryPeriod = parseInt(e.교시, 10);
            return e.날짜 === slot.date && entryPeriod === slot.period;
        });
        
        const subjectsForThisSlot = new Set();
        matchingEntries.forEach(e => {
            if (e.과목) {
                // 부가 정보(괄호 등)를 제거한 순수 과목명 추출
                const cleanedSubject = e.과목.split('(')[0].trim();
                if (cleanedSubject) subjectsForThisSlot.add(cleanedSubject);
            }
        });
        
        const sortedSubj = Array.from(subjectsForThisSlot).sort();
        headerRow2.push(sortedSubj.join(', '));
    });
    csvRows.push(headerRow2);
    const headerRow3 = ['교시', ''];
    sortedTimeSlots.forEach(slot => headerRow3.push(String(slot.period)));
    csvRows.push(headerRow3);
    const headerRow4 = ['학번', '이름'];
    sortedTimeSlots.forEach(slot => { const key = getTimeSlotKey(slot.date, slot.period); headerRow4.push(headerInputs[key]?.time || ''); });
    csvRows.push(headerRow4);
    const sortedStudentIds = Array.from(studentSchedules.keys()).sort();
    sortedStudentIds.forEach(studentId => {
        const studentData = studentSchedules.get(studentId);
        if (!studentData) return;
        const row = [studentId, studentData.name];
        sortedTimeSlots.forEach(slot => { const key = getTimeSlotKey(slot.date, slot.period); row.push(studentData.exams[key] || ''); });
        csvRows.push(row);
    });
    const bom = '\uFEFF';
    const csvString = csvRows.map(row => row.map(cell => {
        const newCell = String(cell).replace(/"/g, '""');
        return (newCell.includes(',') || newCell.includes('"') || newCell.includes('\n')) ? `"${newCell}"` : newCell;
    }).join(',')).join('\n');
    return { csvString: bom + csvString, csvRows };
};

// ── 개인별 학생 데이터 생성 ──
const generateIndividualStudentData = (parsedData, headerInputs, metadata = {}) => {
    const studentMap = new Map();
    const filteredData = parsedData.filter(entry => filterDataByMetadata(entry, metadata));
    filteredData.forEach(entry => {
        if (!entry.학번 || !entry.이름 || !entry.날짜 || !entry.교시 || !entry.과목) return;
        const period = parseInt(entry.교시, 10);
        if (isNaN(period)) return;
        if (!studentMap.has(entry.학번)) {
            studentMap.set(entry.학번, { studentId: entry.학번, name: entry.이름, exams: [] });
        }
        const slotKey = getTimeSlotKey(entry.날짜, entry.교시);
        const slotInfo = headerInputs[slotKey] || {};
        // 소스 데이터의 코드/고사실 우선 사용, 없으면 수동 입력값 사용
        const srcCode = entry['코드'] !== undefined && entry['코드'] !== '' ? String(entry['코드']) : null;
        const srcLocation = entry['고사실'] || entry['시험장소'] || entry['시험 장소'] || null;
        studentMap.get(entry.학번).exams.push({
            date: entry.날짜,
            period,
            subject: entry.과목,
            code: srcCode !== null ? srcCode : (slotInfo.code || ''),
            location: srcLocation !== null ? srcLocation : (slotInfo.location || ''),
            time: slotInfo.time || '',
            notes: entry['비고'] || entry['비 고'] || slotInfo.notes || ''
        });
    });
    return Array.from(studentMap.values())
        .sort((a, b) => a.studentId.localeCompare(b.studentId, undefined, { numeric: true }))
        .map(student => ({
            ...student,
            exams: student.exams.sort((a, b) => {
                const daVal = new Date(a.date.split('(')[0].replace(/\//g, '-'));
                const dbVal = new Date(b.date.split('(')[0].replace(/\//g, '-'));
                return daVal - dbVal || a.period - b.period;
            })
        }));
};

// ── 개인 카드 HTML 생성 (인쇄 팝업용) ──
const buildStudentCardHtml = (student, meta, logo) => {
    const examLabel = meta.examType === 'midterm' ? '중간고사' : '기말고사';
    const rows = student.exams.map((exam, i) => {
        const isNewDate = i === 0 || exam.date !== student.exams[i-1].date;
        const dateSepTop = (i > 0 && isNewDate) ? 'border-top:1.5px solid #b0bec5!important;' : '';
        const cellBase = `border:1px solid #e2e8f0;padding:7px 8px;text-align:center;vertical-align:middle;${dateSepTop}`;
        return `
        <tr style="background:${i%2===0?'#ffffff':'#f8fafc'}">
            <td style="${cellBase}">
                ${isNewDate ? `<div style="font-weight:600;font-size:10pt;color:#0f172a;">${exam.date}</div>` : ''}
                ${isNewDate && exam.time ? `<div style="font-size:8.5pt;color:#64748b;margin-top:2px;">${exam.time}</div>` : ''}
            </td>
            <td style="${cellBase}font-weight:700;font-size:10.5pt;color:#1e3a8a;">${exam.period}교시</td>
            <td style="${cellBase}font-weight:600;font-size:10.2pt;color:#0f172a;white-space:nowrap;letter-spacing:-0.3px;">${exam.subject}</td>
            <td style="${cellBase}font-size:10pt;color:#475569;">${exam.code||''}</td>
            <td style="${cellBase}font-weight:500;font-size:10pt;color:#1e293b;">${exam.location||''}</td>
            <td style="${cellBase}font-size:10pt;color:#64748b;">${exam.notes||''}</td>
        </tr>`;
    }).join('');
    return `<div class="student-card">
        <div class="card-hdr">
            <div>
                <div class="card-yr">${meta.year}학년도 ${meta.semester}학기</div>
                <div class="card-title">${meta.grade}학년 ${examLabel} 개인별 시험 시간표</div>
            </div>
        </div>
        <div class="card-stu">
            <div class="stu-block">
                <span class="stu-lbl">학번</span>
                <span class="stu-id">${student.studentId}</span>
            </div>
            <div class="vsep"></div>
            <div class="stu-block">
                <span class="stu-lbl">성명</span>
                <span class="stu-name">${student.name}</span>
            </div>
            ${logo ? `<div style="margin-left:auto;"><img src="${logo}" style="height:32px;object-fit:contain;opacity:0.92;" /></div>` : ''}
        </div>
        <div class="card-tbl">
            <table>
                <thead><tr>
                    <th style="width:14%">일시</th>
                    <th style="width:8%">교시</th>
                    <th style="width:22%">과목</th>
                    <th style="width:12%">코드</th>
                    <th style="width:22%">고사실</th>
                    <th style="width:22%">비고</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
};

const buildIndividualPrintDoc = (students, meta, logo) => {
    const pairs = [];
    for (let i = 0; i < students.length; i += 2) pairs.push(students.slice(i, i + 2));
    const pagesHtml = pairs.map(pair => `
        <div class="card-page">
            <div class="card-page-inner">
                ${buildStudentCardHtml(pair[0], meta, logo)}
                ${pair[1] ? `<div class="cut-sep"><div class="cut-line"></div><span class="scissors">✂</span><div class="cut-line"></div></div>${buildStudentCardHtml(pair[1], meta, logo)}` : ''}
            </div>
        </div>`).join('');
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
    <title>개인별 시험 시간표</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
    <style>
        @page { size: A4 portrait; margin: 0; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
        html, body { margin:0; padding:0; background:white; font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif; }
        .card-page { 
            width: 210mm; 
            height: 297mm; 
            max-height: 297mm;
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
            align-items: center; 
            page-break-after: always; 
            break-after: page; 
            overflow: hidden;
            box-sizing: border-box;
            padding: 0;
            margin: 0 auto;
        }
        .card-page:last-child { page-break-after:avoid; break-after:avoid; }
        .card-page-inner {
            width: 190mm;
            height: 270mm;
            display: flex;
            flex-direction: column;
            transform: scale(0.9);
            transform-origin: center center;
        }
        .student-card { flex:1; display:flex; flex-direction:column; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card-hdr { background:linear-gradient(135deg,#2b6cb8 0%,#4a9bd9 100%); padding:9px 14px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
        .card-yr { color:#93c5fd; font-size:9pt; margin-bottom:2px; }
        .card-title { color:white; font-weight:700; font-size:13pt; }
        .card-stu { background:#eff6ff; padding:8px 14px; display:flex; align-items:center; gap:20px; border-bottom:1.5px solid #bfdbfe; flex-shrink:0; }
        .stu-block { display:flex; align-items:center; gap:10px; }
        .stu-lbl { font-size:8pt; font-weight:800; color:#2563eb; text-transform:uppercase; letter-spacing:0.08em; }
        .stu-id { font-size:14pt; font-weight:900; color:#0f172a; letter-spacing:0.1em; -webkit-text-stroke:0.2px #0f172a; }
        .stu-name { font-size:15pt; font-weight:900; color:#0f172a; -webkit-text-stroke:0.2px #0f172a; }
        .vsep { width:1.5px; height:24px; background:#bfdbfe; flex-shrink:0; }
        .card-tbl { flex:1; overflow:hidden; }
        table { width:100%; border-collapse:collapse; height:100%; }
        thead tr { background:#f1f5f9; }
        th { border:1px solid #e2e8f0; border-bottom:1.5px solid #b0bec5; padding:6px 5px; text-align:center; font-size:9.5pt; font-weight:700; color:#475569; }
        td { border:1px solid #e2e8f0; vertical-align:middle; }
        .cut-sep { height:7mm; flex-shrink:0; display:flex; align-items:center; gap:3mm; }
        .cut-line { flex:1; border-top:1.5px dashed #94a3b8; }
        .scissors { color:#94a3b8; font-size:9pt; transform:rotate(10deg); display:inline-block; }
    </style></head><body>${pagesHtml}</body></html>`;
};


// ==========================================
// UI 컴포넌트
// ==========================================

const Card = ({ children, className = '', title, badgeText, icon, theme = 'blue' }) => {
    const themeConfig = {
        blue:   { border: 'bg-blue-500',   icon: 'text-blue-500',   badge: 'text-blue-700 bg-blue-50 font-bold' },
        teal:   { border: 'bg-teal-400',   icon: 'text-teal-500',   badge: 'text-teal-700 bg-teal-50 font-bold' },
        indigo: { border: 'bg-indigo-500', icon: 'text-indigo-500', badge: 'text-indigo-700 bg-indigo-50 font-bold' },
        purple: { border: 'bg-purple-500', icon: 'text-purple-500', badge: 'text-purple-700 bg-purple-50 font-bold' },
        amber:  { border: 'bg-amber-400',  icon: 'text-amber-500',  badge: 'text-amber-700 bg-amber-50 font-bold' },
    };
    const t = themeConfig[theme] || themeConfig.blue;
    return (
        <div className={`bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden flex flex-col ${className}`}>
            <div className={`absolute top-0 left-0 right-0 h-1.5 ${t.border}`}></div>
            <div className="p-6 sm:p-8 flex-grow flex flex-col">
                {(title || badgeText) && (
                    <div className="flex justify-between items-start mb-5">
                        <div className="flex items-center gap-3">
                            {icon && <div className={t.icon}>{icon}</div>}
                            {title && <h3 className="text-xl font-bold text-slate-800">{title}</h3>}
                        </div>
                        {badgeText && <span className={`px-3 py-1 text-xs rounded-lg tracking-wider ${t.badge}`}>{badgeText}</span>}
                    </div>
                )}
                <div className="flex-grow">{children}</div>
            </div>
        </div>
    );
};

const InputBox = ({ label, type = "text", value, onChange, name }) => (
    <div className="bg-slate-50 p-4 rounded-2xl border border-transparent focus-within:border-blue-200 focus-within:ring-4 focus-within:ring-blue-50 transition-all">
        <label className="block text-sm font-semibold text-slate-500 mb-1">{label}</label>
        <input type={type} name={name} value={value} onChange={onChange} className="w-full bg-transparent border-none p-0 text-lg font-bold text-slate-800 focus:outline-none focus:ring-0 placeholder-slate-300" />
    </div>
);

const SelectBox = ({ label, value, onChange, name, options }) => (
    <div className="bg-slate-50 p-4 rounded-2xl border border-transparent focus-within:border-blue-200 focus-within:ring-4 focus-within:ring-blue-50 transition-all">
        <label className="block text-sm font-semibold text-slate-500 mb-1">{label}</label>
        <select name={name} value={value} onChange={onChange} className="w-full bg-transparent border-none p-0 text-base font-bold text-slate-800 focus:outline-none focus:ring-0 cursor-pointer">
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

// ── 시간표 슬롯 입력 테이블 ──
const SlotConfigSection = ({ timeSlots, headerInputs, onChange, hasSourceCodes, hasSourceLocations }) => {
    if (!timeSlots || timeSlots.length === 0) return null;
    const showCode = !hasSourceCodes;
    const showLoc = !hasSourceLocations;
    return (
        <Card title="시험 상세 정보 입력" badgeText="SLOT CONFIG" theme="amber"
            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
        >
            <p className="text-sm text-slate-500 mb-4 -mt-2">
                개인별 시간표에 표시될 각 교시의 시험 시간과 비고를 입력하세요.
                {(hasSourceCodes || hasSourceLocations) && (
                    <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-semibold">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {hasSourceCodes && '코드'}
                        {hasSourceCodes && hasSourceLocations && ' · '}
                        {hasSourceLocations && '고사실'}
                        {' '}정보는 업로드한 파일에서 자동으로 불러옵니다.
                    </span>
                )}
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b-2 border-slate-200">
                            <th className="py-3 px-4 text-left font-bold text-slate-600 whitespace-nowrap text-xs uppercase tracking-wider">날짜</th>
                            <th className="py-3 px-4 text-center font-bold text-slate-600 whitespace-nowrap text-xs uppercase tracking-wider">교시</th>
                            <th className="py-3 px-4 text-left font-bold text-slate-500 whitespace-nowrap text-xs uppercase tracking-wider">과목 (자동)</th>
                            <th className="py-3 px-4 text-left font-bold text-slate-600 whitespace-nowrap text-xs uppercase tracking-wider">시험 시간</th>
                            {showCode && <th className="py-3 px-4 text-left font-bold text-slate-600 whitespace-nowrap text-xs uppercase tracking-wider">코드</th>}
                            {showLoc  && <th className="py-3 px-4 text-left font-bold text-slate-600 whitespace-nowrap text-xs uppercase tracking-wider">고사실</th>}
                            <th className="py-3 px-4 text-left font-bold text-slate-600 whitespace-nowrap text-xs uppercase tracking-wider">비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        {timeSlots.map((slot, idx) => {
                            const key = getTimeSlotKey(slot.date, slot.period);
                            const info = headerInputs[key] || {};
                            const inputCls = "w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 transition-all placeholder-slate-300";
                            return (
                                <tr key={key} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                                    <td className="py-2.5 px-4 font-semibold text-slate-700 whitespace-nowrap text-sm">{slot.date}</td>
                                    <td className="py-2.5 px-4 text-center">
                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-bold text-sm">{slot.period}</span>
                                    </td>
                                    <td className="py-2.5 px-4 text-slate-400 text-xs max-w-[120px] truncate">{info.subject || '—'}</td>
                                    <td className="py-2.5 px-4 min-w-[130px]">
                                        <input type="text" value={info.time||''} onChange={e=>onChange(key,'time',e.target.value)} placeholder="예: 9:00~10:20" className={inputCls} />
                                    </td>
                                    {showCode && (
                                        <td className="py-2.5 px-4 min-w-[100px]">
                                            <input type="text" value={info.code||''} onChange={e=>onChange(key,'code',e.target.value)} placeholder="코드" className={inputCls} />
                                        </td>
                                    )}
                                    {showLoc && (
                                        <td className="py-2.5 px-4 min-w-[130px]">
                                            <input type="text" value={info.location||''} onChange={e=>onChange(key,'location',e.target.value)} placeholder="예: 3-1교실" className={inputCls} />
                                        </td>
                                    )}
                                    <td className="py-2.5 px-4 min-w-[110px]">
                                        <input type="text" value={info.notes||''} onChange={e=>onChange(key,'notes',e.target.value)} placeholder="비고" className={inputCls} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

// ── 개인 카드 화면 미리보기 컴포넌트 ──
const IndividualStudentCard = ({ student, metadata, logoSrc }) => {
    const examLabel = metadata.examType === 'midterm' ? '중간고사' : '기말고사';
    return (
        <div className="individual-card-screen">
            {/* 헤더 */}
            <div className="ic-header">
                <div>
                    <p className="text-blue-300 text-xs font-medium mb-0.5">{metadata.year}학년도 {metadata.semester}학기</p>
                    <p className="text-white font-bold text-sm leading-tight">{metadata.grade}학년 {examLabel} 개인별 시험 시간표</p>
                </div>
            </div>
            {/* 학생 정보 */}
            <div className="ic-student-info">
                <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-black text-blue-500 tracking-widest uppercase">학번</span>
                    <span className="font-black text-slate-800 text-base tracking-widest">{student.studentId}</span>
                </div>
                <div className="w-px h-6 bg-blue-200 flex-shrink-0"></div>
                <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-black text-blue-500 tracking-widest uppercase">성명</span>
                    <span className="font-black text-slate-800 text-lg">{student.name}</span>
                </div>
                {logoSrc && <div className="ml-auto"><img src={logoSrc} alt="logo" className="h-8 object-contain opacity-90" /></div>}
            </div>
            {/* 테이블 */}
            <div className="ic-table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>일시</th>
                            <th>교시</th>
                            <th>과목</th>
                            <th>코드</th>
                            <th>고사실</th>
                            <th>비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        {student.exams.map((exam, idx) => {
                            const isNewDate = idx === 0 || exam.date !== student.exams[idx-1].date;
                            const sepStyle = (idx > 0 && isNewDate) ? { borderTop: '1.5px solid #b0bec5' } : {};
                            return (
                                <tr key={idx}>
                                    <td className="py-2 px-2 text-center" style={sepStyle}>
                                        {isNewDate && <div className="font-semibold text-slate-800 text-xs">{exam.date}</div>}
                                        {isNewDate && exam.time && <div className="text-slate-500 text-[10px] mt-0.5">{exam.time}</div>}
                                    </td>
                                    <td className="py-2 px-2 text-center font-bold text-blue-800 text-xs" style={sepStyle}>{exam.period}교시</td>
                                    <td className="py-2 px-2 text-center font-semibold text-slate-800 text-xs break-keep" style={sepStyle}>{exam.subject}</td>
                                    <td className="py-2 px-2 text-center text-slate-500 text-xs" style={sepStyle}>{exam.code}</td>
                                    <td className="py-2 px-2 text-center text-slate-700 font-medium text-xs" style={sepStyle}>{exam.location}</td>
                                    <td className="py-2 px-2 text-center text-slate-400 text-xs" style={sepStyle}>{exam.notes}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ── 학급별 시험 시간표 테이블 ──
const TimetablePreviewTable = ({ data }) => {
    if (!data || data.length === 0) return null;
    const headerRows = data.slice(0, 4);
    const bodyRows = data.slice(4);
    const numberOfTimeSlots = data.length > 0 ? data[0].length - 2 : 0;
    const subjectsRow = headerRows[1] || [];
    const dateRow = headerRows[0] || [];
    
    // 타임슬롯 인덱스별 날짜 매핑 생성
    const colToDate = [];
    let curDate = '';
    dateRow.forEach((val, idx) => {
        if (idx < 2) {
            colToDate[idx] = null;
        } else {
            if (val && val.trim() !== '') curDate = val;
            colToDate[idx] = curDate;
        }
    });

    const bodyCell = "border border-slate-200 py-1.5 px-1.5 sm:px-2 text-center align-middle text-xs sm:text-sm break-keep print:whitespace-nowrap";
    const headerCell = "border border-slate-200 py-2 px-1.5 sm:px-2 text-center align-middle font-bold bg-slate-50 text-slate-700 text-xs sm:text-sm break-keep print:whitespace-nowrap";
    
    return (
        <div id="timetable-scroll-container" className="overflow-x-auto mt-4 rounded-xl border border-slate-200 print:border-none print:overflow-hidden print:h-full print:mt-0 print:rounded-none">
            <table className="w-full border-collapse table-auto print:table-fixed bg-white print:h-full">
                <colgroup>
                    <col style={{ width: '60px' }} /><col style={{ width: '80px' }} />
                    {Array.from({ length: numberOfTimeSlots }).map((_, i) => {
                        const subject = subjectsRow[i + 2] || '';
                        const subjectName = subject.split(',')[0].trim();
                        let w = 100;
                        if (subjectName.includes('사회문제탐구')) w = 110;
                        else if (subjectName.includes('영어독해와작문')) w = 140;
                        else if (subjectName.includes('세계시민과지리') || subjectName.includes('현대사회와윤리')) w = 150;
                        return <col key={i} style={{ width: `${w}px` }} />;
                    })}
                </colgroup>
                <thead>
                    {headerRows.map((row, rIndex) => (
                        <tr key={rIndex}>
                            {rIndex === 0 ? (
                                (() => {
                                    const cells = [];
                                    cells.push(<th key="h0-0" colSpan={2} className={headerCell}>{row[0]}</th>);
                                    let i = 2;
                                    while (i < row.length) {
                                        const cell = row[i]; let colspan = 1;
                                        while (i + colspan < row.length && !row[i + colspan]) colspan++;
                                        cells.push(<th key={i} colSpan={colspan} className={headerCell}>{cell}</th>);
                                        i += colspan;
                                    }
                                    return cells;
                                })()
                            ) : rIndex < 3 ? (
                                <>
                                    <th colSpan={2} className={headerCell}>{row[0]}</th>
                                    {row.slice(2).map((cell, cIndex) => (
                                        <th key={cIndex} className={headerCell}>
                                            {rIndex === 1 && cell.includes(',') ? cell.split(',').map((part, i) => (<Fragment key={i}>{i > 0 && <br />}{part.trim()}</Fragment>)) : cell}
                                        </th>
                                    ))}
                                </>
                            ) : (
                                row.map((cell, cIndex) => {
                                    if (cIndex >= 2) {
                                        const timeRegex = /(\d{1,2}:\d{2}~\d{1,2}:\d{2})/;
                                        const match = cell.match(timeRegex);
                                        if (match) {
                                            const timePart = match[0]; const restPart = cell.replace(timeRegex, '').trim();
                                            return (<th key={cIndex} className={headerCell}>{timePart}{restPart && <><br/><span className="text-slate-500 font-normal">{restPart}</span></>}</th>);
                                        }
                                    }
                                    return <th key={cIndex} className={headerCell}>{cell}</th>;
                                })
                            )}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {bodyRows.map((row, rIndex) => {
                        // 해당 학생의 날짜별 시험 존재 여부 확인
                        const dayHasExam = {};
                        row.forEach((cell, cIdx) => {
                            const date = colToDate[cIdx];
                            if (date) {
                                if (cell && String(cell).trim() !== '') {
                                    dayHasExam[date] = true;
                                }
                            }
                        });

                        return (
                            <tr key={rIndex} className="hover:bg-blue-50/50 transition-colors">
                                {row.map((cell, cIndex) => {
                                    const date = colToDate[cIndex];
                                    const isEmptyDay = date && !dayHasExam[date];
                                    const baseStyle = cIndex < 2 ? 'font-semibold bg-slate-50/50' : '';
                                    const highlightStyle = isEmptyDay ? 'bg-red-100 text-red-500 print:bg-red-100' : '';
                                    
                                    return (
                                        <td key={cIndex} 
                                            className={`${bodyCell} ${baseStyle} ${highlightStyle}`}
                                            style={isEmptyDay ? { backgroundColor: '#fee2e2' } : {}}
                                        >
                                            {cell}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};


// ── 원묵고등학교 로고 ──
const WonmookLogo = ({ logoSrc }) => (
    <a href="https://wonmook.sen.hs.kr/" target="_blank" rel="noopener noreferrer" className="seoul-logo flex items-center gap-2 px-1 text-inherit flex-shrink-0" aria-label="원묵고등학교">
        {logoSrc ? (
            <img src={logoSrc} alt="학교 로고" className="h-10 max-h-12 w-auto object-contain" />
        ) : (
            <>
                <svg width="34" height="34" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                    <circle cx="50" cy="50" r="46" stroke="#2563eb" strokeWidth="8" fill="none" />
                    <path d="M50 15 L85 50 L50 85 L15 50 Z" stroke="#10b981" strokeWidth="6" fill="none" />
                    <circle cx="50" cy="50" r="14" fill="#2563eb" />
                </svg>
                <div className="flex flex-col">
                    <span className="font-extrabold text-[15px] text-[#1e3a8a] dark:text-blue-200 tracking-tight leading-none">원묵고등학교</span>
                    <span className="text-[9px] text-[#64748b] dark:text-slate-400 font-bold tracking-widest mt-1 uppercase">WONMOOK HIGH SCHOOL</span>
                </div>
            </>
        )}
    </a>
);

const SeoulLogo = () => (
    <span className="hidden"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAABwCAYAAADogILwAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA3ZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDcuMS1jMDAwIDc5LmVkYTJiM2ZhYywgMjAyMS8xMS8xNy0xNzoyMzoxOSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDphZjEzMTcwYi1hYzdkLWMzNDMtYjZkNC1kMGYxZWQ1OWQyZTIiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6RkJBRDhDOTk3MTRCMTFFRDhBNzBCOTBCREE4NjNCQTUiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6RkJBRDhDOTg3MTRCMTFFRDhBNzBCOTBCREE4NjNCQTUiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDIzLjEgKFdpbmRvd3MpIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6YjA0MDczMGYtY2IyZS0xNTRiLWJmZWItMTUyMWFhZWFlZDZlIiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOmFmMTMxNzBiLWFjN2QtYzM0My1iNmQ0LWQwZjFlZDU5ZDJlMiIv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" alt="서울특별시교육청" className="h-9 w-auto" />
    </span>
);

// ── 포털 상단 헤더 ──
const PortalHeader = ({ darkMode, onToggleDark, onFont, onOpenAdmin, logoSrc, isAdminLoggedIn, onLogout }) => {
    return (
        <header className="gbe-header print-hidden sticky top-0 z-40 bg-white/95 dark:bg-[#0b1329]/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/80">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-6">
                <WonmookLogo logoSrc={logoSrc} />
                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                    <div className="hidden sm:flex items-center gap-1 mr-1">
                        <span className="text-[11px] font-semibold text-[#94a8c0] mr-1">글꼴크기</span>
                        <button className="gbe-util-btn" title="글꼴 크게" onClick={() => onFont(1)}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                        </button>
                        <button className="gbe-util-btn" title="글꼴 기본" onClick={() => onFont(0)}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M20 4l-7 7M11 13l-7 7" /></svg>
                        </button>
                        <button className="gbe-util-btn" title="글꼴 작게" onClick={() => onFont(-1)}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M5 12h14" /></svg>
                        </button>
                    </div>
                    <button onClick={onToggleDark} className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-[#0c1c3a] text-white text-xs font-bold hover:bg-[#13294d] transition-colors">
                        {darkMode ? (
                            <svg className="w-3.5 h-3.5 text-amber-300" fill="currentColor" viewBox="0 0 24 24"><path d="M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
                        )}
                        {darkMode ? '라이트모드' : '다크모드'}
                    </button>
                    {/* 관리자 톱니바퀴 아이콘: 항상 표시 (미인증 시 비밀번호 확인, 인증 시 패널 열기) */}
                    <div className="flex items-center gap-1.5">
                        <button 
                            onClick={onOpenAdmin} 
                            className={`gbe-util-btn h-8 w-8 !p-0 flex items-center justify-center rounded-full transition-all ${isAdminLoggedIn ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm ring-2 ring-blue-300 dark:ring-blue-700' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'}`} 
                            title={isAdminLoggedIn ? "관리자 설정 패널 열기 (로그인됨)" : "관리자 설정"}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 animate-[spin_8s_linear_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        {isAdminLoggedIn && (
                            <button onClick={onLogout} className="px-2 h-7 rounded-full bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-red-400 text-[11px] font-semibold transition-colors" title="관리자 로그아웃">
                                로그아웃
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

// ── 포털 풋터 ──
const PortalFooter = () => (
    <footer className="gbe-footer print-hidden mt-auto bg-white/70 dark:bg-slate-900 border-t border-[#dbe7f4] dark:border-slate-800 backdrop-blur-sm">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-5 text-center text-[12px] text-[#7c93ad] font-medium">
            <p>원묵고등학교 시험시간표 자동 생성 시스템</p>
        </div>
    </footer>
);

// ==========================================
// 파이어베이스 설정 및 연동
// ==========================================
// 기존 compat API(db.collection().doc().get/set/delete) 형태를 유지하는 얇은 어댑터.
// 실제 연결은 통합 앱 공통 모듈(shared/firebase)을 사용합니다.
const db = {
    collection: (col) => ({
        doc: (id) => {
            const ref = fsDoc(firestore, col, id);
            return {
                get: async () => {
                    const snap = await getDoc(ref);
                    return { exists: snap.exists(), data: () => snap.data() };
                },
                set: (data, options) => setDoc(ref, data, options || {}),
                delete: () => deleteDoc(ref),
            };
        },
    }),
};
const firebase = { firestore: { FieldValue: { serverTimestamp } } };

// ==========================================
// 공통 다이얼로그
// ==========================================
const CustomDialog = ({ dialogConfig, onClose }) => {
    const { type = 'alert', message = '', defaultValue = '', onConfirm, onCancel } = dialogConfig || {};
    const [inputValue, setInputValue] = useState(defaultValue);
    const inputRef = React.useRef(null);
    
    useEffect(() => {
        if (!dialogConfig) return;
        setInputValue(defaultValue);
        if (type === 'prompt') {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [dialogConfig, defaultValue, type]);

    if (!dialogConfig) return null;

    const handleConfirm = () => {
        if (onConfirm) onConfirm(type === 'prompt' ? inputValue : undefined);
        onClose();
    };

    const handleCancel = () => {
        if (onCancel) onCancel();
        else if (onConfirm && type === 'prompt') onConfirm(null);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6">
                    <p className="text-base text-slate-800 dark:text-slate-200 font-medium whitespace-pre-wrap">{message}</p>
                    {type === 'prompt' && (
                        <input
                            ref={inputRef}
                            type="password"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                            className="w-full mt-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-lg focus:ring-[#1b5fa6] focus:border-[#1b5fa6] block p-3"
                        />
                    )}
                </div>
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2">
                    {(type === 'prompt' || type === 'confirm') && (
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            취소
                        </button>
                    )}
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2 text-sm font-medium text-white bg-[#1b5fa6] hover:bg-[#154b85] rounded-lg transition-colors"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 메인 앱
// ==========================================
const App = () => {
    const [dialogConfig, setDialogConfig] = useState(null);
    const showAlert = useCallback((message) => setDialogConfig({ type: 'alert', message }), []);
    const showConfirm = useCallback((message, onConfirm, onCancel) => 
        setDialogConfig({ type: 'confirm', message, onConfirm, onCancel }), []);
    const showPrompt = useCallback((message, onConfirm, onCancel, defaultValue = '') => 
        setDialogConfig({ type: 'prompt', message, onConfirm, onCancel, defaultValue }), []);

    const [darkMode, setDarkMode] = useState(false);

    const toggleDark = useCallback(() => {
        setDarkMode(prev => {
            const next = !prev;
            document.documentElement.classList.toggle('dark', next);
            return next;
        });
    }, []);

    const handleFont = useCallback((dir) => {
        const root = document.documentElement;
        if (dir === 0) { root.style.fontSize = ''; return; }
        const cur = parseFloat(getComputedStyle(root).fontSize) || 16;
        const next = Math.min(20, Math.max(13, cur + dir));
        root.style.fontSize = `${next}px`;
    }, []);

    // 관리자 관련 및 파이어베이스 연동 상태 항목 추가
    // 관리자 여부: 통합 앱 공통 로그인(구글 계정 + exam_admins 등록) 상태를 따릅니다.
    const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => getAuthState().isAdmin);
    const [isAdminOpen, setIsAdminOpen] = useState(false);
    useEffect(() => subscribeAuth((s) => {
        setIsAdminLoggedIn(s.isAdmin);
        if (!s.isAdmin) setIsAdminOpen(false);
    }), []);
    const [adminTab, setAdminTab] = useState('upload'); // 'upload' | 'default' | 'catalog' | 'logo'
    const [adminDbUploading, setAdminDbUploading] = useState(false);
    const [adminSavingDefault, setAdminSavingDefault] = useState(false);
    const [isDbLoaded, setIsDbLoaded] = useState(false);
    const [isMetadataModified, setIsMetadataModified] = useState(false);

    const handleLogout = async () => {
        await logoutAdmin();
        setIsAdminOpen(false);
        showAlert("관리자 모드에서 로그아웃되었습니다.");
    };

    // 기본(디폴트) 학사 정보 (DB active 문서에서 로드 및 관리자가 설정)
    const [defaultMetadata, setDefaultMetadata] = useState({ year: new Date().getFullYear().toString(), semester: '1', grade: '2', examType: 'final' });

    // 메인 화면 활성 학사 정보
    const [metadata, setMetadata] = useState({ year: new Date().getFullYear().toString(), semester: '1', grade: '2', examType: 'final' });

    // 관리자 패널: 업로드 대상 학사 정보
    const [adminTargetMetadata, setAdminTargetMetadata] = useState({ year: new Date().getFullYear().toString(), semester: '1', grade: '2', examType: 'final' });

    // 관리자 패널: 기본(디폴트) 설정 폼 상태
    const [adminDefaultForm, setAdminDefaultForm] = useState({ year: new Date().getFullYear().toString(), semester: '1', grade: '2', examType: 'final' });

    // 업로드 시 기본값 자동 지정 여부
    const [setAsDefaultOnUpload, setSetAsDefaultOnUpload] = useState(true);

    // 등록된 고사 데이터 카탈로그 목록
    const [catalog, setCatalog] = useState([]);

    // 관리자 모달 내 업로드 파일 및 파싱 상태
    const [adminFiles, setAdminFiles] = useState([]);
    const [adminRawData, setAdminRawData] = useState(null);
    const [adminParsedData, setAdminParsedData] = useState(null);
    const [adminTimeSlots, setAdminTimeSlots] = useState([]);
    const [adminHeaderInputs, setAdminHeaderInputs] = useState({});
    const [adminHasCodes, setAdminHasCodes] = useState(false);
    const [adminHasLocations, setAdminHasLocations] = useState(false);

    const [files, setFiles] = useState([]);
    const [logoSrc, setLogoSrc] = useState(null);
    const [parsedData, setParsedData] = useState(null);
    const [timeSlots, setTimeSlots] = useState([]);
    const [headerInputs, setHeaderInputs] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [generatedCsvContent, setGeneratedCsvContent] = useState(null);
    const [generatedCsvRows, setGeneratedCsvRows] = useState(null);
    const [individualStudents, setIndividualStudents] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [selectedClass, setSelectedClass] = useState('all');
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [viewMode, setViewMode] = useState('individual'); // 'grid' | 'individual'
    const [hasSourceCodes, setHasSourceCodes] = useState(false);
    const [hasSourceLocations, setHasSourceLocations] = useState(false);

    // 앱 시작 시 파이어베이스로부터 기본(디폴트) 설정, 카탈로그, 로고를 자동 로드합니다.
    useEffect(() => {
        if (typeof db !== "undefined" && db) {
            db.collection("timetable_config").doc("active").get().then((docSnapshot) => {
                if (docSnapshot.exists) {
                    const data = docSnapshot.data();
                    if (data) {
                        if (data.logoSrc) {
                            setLogoSrc(data.logoSrc);
                        }
                        const activeDefault = data.defaultMetadata || data.metadata;
                        if (activeDefault) {
                            setDefaultMetadata(activeDefault);
                            setMetadata(activeDefault);
                            setAdminTargetMetadata(activeDefault);
                            setAdminDefaultForm(activeDefault);
                        }
                        if (data.catalog && Array.isArray(data.catalog)) {
                            setCatalog(data.catalog);
                        } else if (data.parsedDataJson && activeDefault) {
                            try {
                                const legacyParsed = JSON.parse(data.parsedDataJson);
                                const sCount = new Set(legacyParsed.map(e => e.학번)).size;
                                setCatalog([{
                                    id: `data_${activeDefault.year}_${activeDefault.semester}_${activeDefault.examType}_${activeDefault.grade}`,
                                    year: activeDefault.year,
                                    semester: activeDefault.semester,
                                    examType: activeDefault.examType,
                                    grade: activeDefault.grade,
                                    studentCount: sCount,
                                    rowCount: legacyParsed.length,
                                    fileName: data.fileName || "기존 업로드 데이터",
                                    updatedAtText: "기존 등록 데이터"
                                }]);
                            } catch (e) {}
                        }
                    }
                }
            }).catch((err) => {
                console.log("파이어베이스 초기 설정 자동 로딩 건너뜀:", err);
            });
        }
    }, []);

    // 관리자 진입 인증 핸들러 (단방향 SHA-256 해시로 안전하게 비밀번호 검증)
    const handleOpenAdmin = () => {
        if (isAdminLoggedIn) {
            setIsAdminOpen(true);
            return;
        }
        loginAdmin()
            .then((ok) => { if (ok) setIsAdminOpen(true); })
            .catch((err) => {
                if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) return;
                showAlert("관리자 로그인 실패: " + (err && err.message ? err.message : err));
            });
    };

    // 키보드 단축키(Ctrl+Shift+A 또는 Alt+A) 및 URL 파라미터(?admin) 지원
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) || (e.altKey && (e.key === 'A' || e.key === 'a'))) {
                e.preventDefault();
                handleOpenAdmin();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAdminLoggedIn]);

    // (?admin 자동 로그인 창은 팝업 차단 때문에 제거: 상단 '관리자 로그인' 또는 톱니바퀴 사용)

    // 단일 파일 파싱 헬퍼 (CSV 및 Excel 지원)
    const parseFileToRows = (selectedFile, targetYear) => {
        return new Promise((resolve, reject) => {
            const fileName = selectedFile.name.toLowerCase();
            const isCsv = selectedFile.type === 'text/csv' || fileName.endsWith('.csv');
            const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || selectedFile.type.includes('spreadsheet');
            if (!isCsv && !isExcel) {
                reject(new Error(`${selectedFile.name}: 잘못된 파일 형식입니다. CSV 또는 Excel 파일을 업로드해주세요.`));
                return;
            }

            if (isExcel) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const wb = XLSX.read(event.target?.result, { type: 'array' });
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                        if (!rows || rows.length < 2) {
                            reject(new Error(`${selectedFile.name}: Excel 파일에 데이터가 없습니다.`));
                            return;
                        }
                        const headers = rows[0].map(h => String(h || '').trim().replace(/^\uFEFF/, ''));
                        const cleanData = rows.slice(1).map(row => {
                            const obj = {};
                            headers.forEach((h, i) => { obj[h] = String(row[i] || '').trim(); });
                            if (obj['날짜']) obj['날짜'] = formatUniformDate(obj['날짜'], targetYear);
                            return obj;
                        });
                        if (!cleanData[0] || !('학번' in cleanData[0] && '이름' in cleanData[0] && '날짜' in cleanData[0] && '교시' in cleanData[0] && '과목' in cleanData[0])) {
                            reject(new Error(`${selectedFile.name}: Excel 파일의 헤더가 올바르지 않습니다. "학번,이름,날짜,교시,과목" 열이 포함되어 있는지 확인해주세요.`));
                            return;
                        }
                        resolve(cleanData);
                    } catch (err) {
                        reject(new Error(`${selectedFile.name}: Excel 파싱 오류: ${err.message}`));
                    }
                };
                reader.onerror = () => reject(new Error(`${selectedFile.name}: 파일을 읽는 중 오류가 발생했습니다.`));
                reader.readAsArrayBuffer(selectedFile);
            } else {
                Papa.parse(selectedFile, {
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: h => h.trim().replace(/^\uFEFF/, ''),
                    complete: (results) => {
                        if (results.errors.length > 0) {
                            const criticalErrors = results.errors.filter(e => e.type !== 'FieldMismatch');
                            if (criticalErrors.length > 0) {
                                reject(new Error(`${selectedFile.name}: CSV 파싱 오류 - ${criticalErrors[0].message}`));
                                return;
                            }
                        }
                        const cleanData = results.data.map(row => {
                            const obj = {};
                            Object.keys(row).forEach(k => { obj[k.trim()] = String(row[k] || '').trim(); });
                            if (obj['날짜']) obj['날짜'] = formatUniformDate(obj['날짜'], targetYear);
                            return obj;
                        });
                        if (!cleanData[0] || !('학번' in cleanData[0] && '이름' in cleanData[0] && '날짜' in cleanData[0] && '교시' in cleanData[0] && '과목' in cleanData[0])) {
                            reject(new Error(`${selectedFile.name}: CSV 파일의 헤더가 올바르지 않습니다. "학번,이름,날짜,교시,과목" 열이 포함되어 있는지 확인해주세요.`));
                            return;
                        }
                        resolve(cleanData);
                    },
                    error: (err) => reject(new Error(`${selectedFile.name}: CSV 파일을 읽는 중 오류 발생 - ${err.message}`))
                });
            }
        });
    };

    // 관리자 타겟 조건에 맞게 파싱 데이터 및 슬롯 계산 갱신
    const updateAdminParsedForTarget = (rawData, targetMeta) => {
        if (!rawData || rawData.length === 0) return;
        const matched = rawData.filter(entry => filterDataByMetadata(entry, targetMeta));
        const targetData = matched.length > 0 ? matched : rawData;
        setAdminParsedData(targetData);

        const timeSlotSet = new Set();
        targetData.forEach(entry => { if (entry.날짜 && String(entry.교시).trim()) timeSlotSet.add(`${entry.날짜}|${entry.교시}`); });
        const calculated = Array.from(timeSlotSet)
            .map(s => { if (!s.includes('|')) return null; const [date, pStr] = s.split('|'); const period = parseInt(pStr, 10); return (!isNaN(period) && date) ? { date, period } : null; })
            .filter(Boolean)
            .sort((a, b) => { const daVal = new Date(a.date.split('(')[0].replace(/\//g, '-')); const dbVal = new Date(b.date.split('(')[0].replace(/\//g, '-')); return daVal - dbVal || a.period - b.period; });
        setAdminTimeSlots(calculated);

        const subjectsBySlot = {};
        targetData.forEach(entry => {
            if (isNaN(parseInt(entry.교시, 10))) return;
            const key = `${entry.날짜}|${entry.교시}`;
            if (!subjectsBySlot[key]) subjectsBySlot[key] = new Set();
            subjectsBySlot[key].add(entry.과목);
        });
        const initial = calculated.reduce((acc, slot) => {
            const key = `${slot.date}|${slot.period}`;
            const subjects = Array.from(subjectsBySlot[key] || []).join(', ');
            acc[key] = { subject: subjects.replace(/\s*\(.*?\)\s*/g, '').trim(), time: '', code: '', location: '', notes: '' };
            return acc;
        }, {});
        setAdminHeaderInputs(initial);

        const sample = targetData.find(e => e.학번) || targetData[0];
        if (sample) {
            setAdminHasCodes('코드' in sample && String(sample['코드'] || '').trim() !== '');
            setAdminHasLocations('고사실' in sample && String(sample['고사실'] || '').trim() !== '');
        }
    };

    // 관리자 모달 파일 선택 핸들러
    const handleAdminFileChange = async (e) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;
        setAdminFiles(selectedFiles);
        setIsLoading(true);
        try {
            let combined = [];
            for (const f of selectedFiles) {
                const rows = await parseFileToRows(f, adminTargetMetadata.year);
                combined = combined.concat(rows);
            }
            setAdminRawData(combined);
            updateAdminParsedForTarget(combined, adminTargetMetadata);
        } catch (err) {
            showAlert("파일 파싱 중 오류: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // 관리자 업로드 대상 학사 정보 변경 핸들러
    const handleAdminTargetChange = (e) => {
        const { name, value } = e.target;
        const nextMeta = { ...adminTargetMetadata, [name]: value };
        setAdminTargetMetadata(nextMeta);
        if (adminRawData) {
            updateAdminParsedForTarget(adminRawData, nextMeta);
        }
    };

    // 관리자 고사별 데이터 파이어베이스 DB 저장
    const handleSaveScopedData = async () => {
        if (!db) {
            showAlert("파이어베이스가 연결되어 있지 않습니다. 네트워크 환경을 확인해주세요.");
            return;
        }
        if (!adminParsedData || adminParsedData.length === 0) {
            showAlert("업로드 및 파싱된 시험 시간표 데이터가 없습니다. 먼저 원본 파일(CSV/Excel)을 업로드해 주세요.");
            return;
        }

        setAdminDbUploading(true);
        const targetDocKey = `data_${adminTargetMetadata.year}_${adminTargetMetadata.semester}_${adminTargetMetadata.examType}_${adminTargetMetadata.grade}`;
        const studentCount = new Set(adminParsedData.map(e => e.학번)).size;
        const nowText = new Date().toLocaleDateString('ko-KR') + ' ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

        try {
            // 1. 해당 고사 전용 문서 저장
            await db.collection("timetable_config").doc(targetDocKey).set({
                id: targetDocKey,
                metadata: adminTargetMetadata,
                parsedDataJson: JSON.stringify(adminParsedData),
                headerInputs: adminHeaderInputs || {},
                timeSlots: adminTimeSlots || [],
                fileName: adminFiles.length > 0 ? adminFiles.map(f => f.name).join(', ') : "timetable.csv",
                studentCount: studentCount,
                rowCount: adminParsedData.length,
                hasSourceCodes: adminHasCodes,
                hasSourceLocations: adminHasLocations,
                updatedAt: (typeof firebase !== 'undefined' ? firebase.firestore.FieldValue.serverTimestamp() : new Date()),
                updatedAtText: nowText
            });

            // 2. 카탈로그 목록 갱신
            const newCatalogItem = {
                id: targetDocKey,
                year: adminTargetMetadata.year,
                semester: adminTargetMetadata.semester,
                examType: adminTargetMetadata.examType,
                grade: adminTargetMetadata.grade,
                studentCount: studentCount,
                rowCount: adminParsedData.length,
                fileName: adminFiles.length > 0 ? adminFiles.map(f => f.name).join(', ') : "timetable.csv",
                updatedAtText: nowText
            };
            const nextCatalog = [
                newCatalogItem,
                ...catalog.filter(c => c.id !== targetDocKey)
            ];
            setCatalog(nextCatalog);

            // 3. active 문서 업데이트
            const activePayload = {
                catalog: nextCatalog,
                logoSrc: logoSrc || "",
                updatedAt: (typeof firebase !== 'undefined' ? firebase.firestore.FieldValue.serverTimestamp() : new Date())
            };

            if (setAsDefaultOnUpload) {
                activePayload.defaultMetadata = adminTargetMetadata;
                activePayload.metadata = adminTargetMetadata;
                activePayload.parsedDataJson = JSON.stringify(adminParsedData);
                activePayload.headerInputs = adminHeaderInputs || {};
                activePayload.timeSlots = adminTimeSlots || [];
                activePayload.fileName = adminFiles.length > 0 ? adminFiles.map(f => f.name).join(', ') : "timetable.csv";
                activePayload.hasSourceCodes = adminHasCodes;
                activePayload.hasSourceLocations = adminHasLocations;

                setDefaultMetadata(adminTargetMetadata);
                setMetadata(adminTargetMetadata);
                setAdminDefaultForm(adminTargetMetadata);
            }

            await db.collection("timetable_config").doc("active").set(activePayload, { merge: true });

            const examLabel = adminTargetMetadata.examType === 'midterm' ? '중간고사' : '기말고사';
            showAlert(`[${adminTargetMetadata.year}학년도 ${adminTargetMetadata.semester}학기 ${adminTargetMetadata.grade}학년 ${examLabel}] 데이터(학생 ${studentCount}명)가 파이어베이스 DB에 성공적으로 저장되었습니다!${setAsDefaultOnUpload ? '\n\n★ 메인 화면 기본(디폴트) 학사 정보로도 함께 설정되었습니다.' : ''}`);
            setAdminTab('catalog');
        } catch (err) {
            showAlert("파이어베이스 DB 저장 중 오류 발생: " + err.message);
        } finally {
            setAdminDbUploading(false);
        }
    };

    // 관리자 기본(디폴트) 학사 정보 저장 핸들러
    const handleSaveDefaultMetadata = async (targetMeta) => {
        if (!db) {
            showAlert("파이어베이스가 연결되어 있지 않습니다.");
            return;
        }
        const metaToSave = targetMeta || adminDefaultForm;
        setAdminSavingDefault(true);
        try {
            await db.collection("timetable_config").doc("active").set({
                defaultMetadata: metaToSave,
                metadata: metaToSave,
                updatedAt: (typeof firebase !== 'undefined' ? firebase.firestore.FieldValue.serverTimestamp() : new Date())
            }, { merge: true });

            setDefaultMetadata(metaToSave);
            setMetadata(metaToSave);
            setAdminDefaultForm(metaToSave);

            const examLabel = metaToSave.examType === 'midterm' ? '중간고사' : '기말고사';
            showAlert(`기본(디폴트) 학사 정보가 [${metaToSave.year}학년도 ${metaToSave.semester}학기 ${metaToSave.grade}학년 ${examLabel}]으로 성공적으로 변경되었습니다!`);
        } catch (err) {
            showAlert("디폴트 설정 저장 중 오류: " + err.message);
        } finally {
            setAdminSavingDefault(false);
        }
    };

    // 카탈로그 데이터 삭제
    const handleDeleteCatalogItem = (item) => {
        const examLabel = item.examType === 'midterm' ? '중간고사' : '기말고사';
        showConfirm(`[${item.year}학년도 ${item.semester}학기 ${item.grade}학년 ${examLabel}] 데이터를 파이어베이스 DB에서 삭제하시겠습니까?`, async () => {
            if (!db) return;
            try {
                await db.collection("timetable_config").doc(item.id).delete();
                const nextCatalog = catalog.filter(c => c.id !== item.id);
                setCatalog(nextCatalog);
                await db.collection("timetable_config").doc("active").set({
                    catalog: nextCatalog
                }, { merge: true });
                showAlert("데이터가 삭제되었습니다.");
            } catch (err) {
                showAlert("삭제 실패: " + err.message);
            }
        });
    };

    // 학교 로고 저장 핸들러
    const handleSaveLogoToFirebase = async () => {
        if (!db) {
            showAlert("파이어베이스가 연결되어 있지 않습니다.");
            return;
        }
        try {
            await db.collection("timetable_config").doc("active").set({
                logoSrc: logoSrc || "",
                updatedAt: (typeof firebase !== 'undefined' ? firebase.firestore.FieldValue.serverTimestamp() : new Date())
            }, { merge: true });
            showAlert("학교 로고가 파이어베이스에 성공적으로 저장되었습니다!");
        } catch (err) {
            showAlert("로고 저장 실패: " + err.message);
        }
    };

    // 레거시 호환: 파이어베이스 DB 저장 처리
    const handleSaveToFirebase = async () => {
        if (!db) {
            showAlert("파이어베이스가 연결되어 있지 않습니다. 오프라인 모드에서는 사용할 수 없습니다.");
            return;
        }
        if (!parsedData) {
            showAlert("파이어베이스 DB에 저장할 시험 시간표 원본 데이터(CSV/Excel)가 아직 업로드되지 않았습니다.");
            return;
        }
        setAdminDbUploading(true);
        try {
            await db.collection("timetable_config").doc("active").set({
                parsedDataJson: JSON.stringify(parsedData),
                logoSrc: logoSrc || "",
                headerInputs: headerInputs || {},
                metadata: metadata,
                defaultMetadata: metadata,
                hasSourceCodes: hasSourceCodes,
                hasSourceLocations: hasSourceLocations,
                timeSlots: timeSlots,
                fileName: files.length > 0 ? files.map(f => f.name).join(', ') : "timetable_source.csv",
                updatedAt: (typeof firebase !== 'undefined' ? firebase.firestore.FieldValue.serverTimestamp() : new Date())
            }, { merge: true });
            showAlert("성공적으로 파이어베이스 DB에 설정 데이터가 업로드 및 저장되었습니다!");
        } catch (err) {
            showAlert("파이어베이스 DB 업로드 중 오류 발생: " + err.message);
        } finally {
            setAdminDbUploading(false);
        }
    };

    // 일반 사용자가 선택된 학사 정보 기준으로 DB에서 데이터를 불러와 시간표 생성 진행
    const handleUserGenerateWithAuth = () => {
        if (!db) {
            showAlert("파이어베이스 클라우드 데이터베이스 연결이 비활성화되어있거나 차단되었습니다. 네트워크 환경 또는 스크립트 로드 상태를 확인해 주세요.");
            return;
        }

        const runFetch = () => {
            setIsLoading(true);
            setError(null);
            setSelectedClass('all'); // 생성시 학급 필터 전체('all')로 초기화

            let isTimedOut = false;
            const timeoutId = setTimeout(() => {
                isTimedOut = true;
                setError(
                    <div className="space-y-3">
                        <p>파이어베이스 클라우드 데이터베이스 연결 시간이 초과되었습니다(15초 경과).</p>
                        <p className="text-xs opacity-80">현재 미리보기 화면(iframe)의 보안 정책이나 네트워크 전송 제한 때문에 지연되고 있을 수 있습니다. 우측 상단의 '새 창으로 열기' 버튼을 눌러 접속해주시면 정상 작동합니다.</p>
                        <div className="pt-2 flex flex-wrap gap-2">
                            <button onClick={() => { setIsOfflineMode(true); setError(null); }} className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 transition-colors">
                                오프라인 모드(파일 직접 업로드) 사용하기
                            </button>
                            <button onClick={() => location.reload()} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg font-bold text-xs hover:bg-slate-300 transition-colors">
                                다시 시도(새로고침)
                            </button>
                        </div>
                    </div>
                );
                setIsLoading(false);
            }, 15000);

            const currentMetadata = {
                year: metadata.year || new Date().getFullYear().toString(),
                semester: metadata.semester || '1',
                examType: metadata.examType || 'final',
                grade: metadata.grade || '2'
            };
            const targetDocKey = `data_${currentMetadata.year}_${currentMetadata.semester}_${currentMetadata.examType}_${currentMetadata.grade}`;
            const examLabel = currentMetadata.examType === 'midterm' ? '중간고사' : '기말고사';

            // 1. 해당 학년도/학기/고사/학년 전용 문서 우선 조회
            db.collection("timetable_config").doc(targetDocKey).get().then(async (targetDocSnap) => {
                let configData = null;
                let isExactTarget = false;

                if (targetDocSnap.exists) {
                    configData = targetDocSnap.data();
                    isExactTarget = true;
                } else {
                    // 2. 전용 문서가 없으면 active 문서 fallback 조회
                    const activeSnap = await db.collection("timetable_config").doc("active").get();
                    if (activeSnap.exists) {
                        configData = activeSnap.data();
                    }
                }

                if (isTimedOut) return;
                clearTimeout(timeoutId);

                if (!configData || !configData.parsedDataJson) {
                    setError(
                        <div className="space-y-2">
                            <p className="font-bold text-red-600">[{currentMetadata.year}학년도 {currentMetadata.semester}학기 {currentMetadata.grade}학년 {examLabel}] 조건에 등록된 시험 데이터가 없습니다.</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300">우측 상단 톱니바퀴(관리자 패널)에서 해당 학년/고사의 원본 시간표 파일(CSV/Excel)을 업로드해 주세요.</p>
                        </div>
                    );
                    setIsLoading(false);
                    return;
                }

                if (configData.logoSrc) {
                    setLogoSrc(configData.logoSrc);
                }
                if (configData.hasSourceCodes !== undefined) {
                    setHasSourceCodes(configData.hasSourceCodes);
                }
                if (configData.hasSourceLocations !== undefined) {
                    setHasSourceLocations(configData.hasSourceLocations);
                }

                const allParsed = JSON.parse(configData.parsedDataJson);
                let filtered = isExactTarget ? allParsed : allParsed.filter(entry => filterDataByMetadata(entry, currentMetadata));
                if (filtered.length === 0 && isExactTarget) {
                    filtered = allParsed;
                }

                if (!filtered || filtered.length === 0) {
                    setError(
                        <div className="space-y-2">
                            <p className="font-bold text-red-600">[{currentMetadata.year}학년도 {currentMetadata.semester}학기 {currentMetadata.grade}학년 {examLabel}] 조건에 해당하는 학생 데이터가 파일 내에 존재하지 않습니다.</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300">업로드된 파일의 학생 학번이 {currentMetadata.grade}학년({currentMetadata.grade}로 시작)인지 확인해주세요.</p>
                        </div>
                    );
                    setIsLoading(false);
                    return;
                }

                setParsedData(filtered);
                setFiles([{ name: configData.fileName || "timetable_source.csv" }]);
                setIsDbLoaded(true);

                // 4가지 필터(학년도, 학기, 고사구분, 학년)에 근거해 유효한 타임슬롯과 과목을 동적으로 재생성합니다.
                const timeSlotSet = new Set();
                filtered.forEach(entry => { if (entry.날짜 && String(entry.교시).trim()) timeSlotSet.add(`${entry.날짜}|${entry.교시}`); });
                const calculated = Array.from(timeSlotSet)
                    .map(s => { if (!s.includes('|')) return null; const [date, pStr] = s.split('|'); const period = parseInt(pStr, 10); return (!isNaN(period) && date) ? { date, period } : null; })
                    .filter(Boolean)
                    .sort((a, b) => { const daVal = new Date(a.date.split('(')[0].replace(/\//g, '-')); const dbVal = new Date(b.date.split('(')[0].replace(/\//g, '-')); return daVal - dbVal || a.period - b.period; });
                setTimeSlots(calculated);

                // configData에 저장된 수동 입력 헤더값(시작시각, 과목코드, 고사실 등)이 있을 경우 동적 재생성한 슬롯에 병합 복원합니다.
                const mergedHeaderInputs = {};
                calculated.forEach(slot => {
                    const key = `${slot.date}|${slot.period}`;
                    const savedInfo = configData.headerInputs?.[key] || {};
                    const matchingEntries = filtered.filter(e => e.날짜 === slot.date && parseInt(e.교시, 10) === slot.period);
                    const subjects = Array.from(new Set(matchingEntries.map(e => e.과목))).join(', ');
                    mergedHeaderInputs[key] = {
                        subject: savedInfo.subject || subjects.replace(/\s*\(.*?\)\s*/g, '').trim(),
                        time: savedInfo.time || '',
                        code: savedInfo.code || '',
                        location: savedInfo.location || '',
                        notes: savedInfo.notes || ''
                    };
                });
                setHeaderInputs(mergedHeaderInputs);

                // 파이어베이스에서 파싱 완료된 상태이므로 자동으로 슬롯 설정에 근거하여 시간표/카드 즉각 랜더링!
                setTimeout(() => {
                    try {
                        const { csvString, csvRows } = generatePersonalTimetableCsv(filtered, currentMetadata, mergedHeaderInputs);
                        setGeneratedCsvContent(csvString);
                        setGeneratedCsvRows(csvRows);
                        const students = generateIndividualStudentData(filtered, mergedHeaderInputs, currentMetadata);
                        setIndividualStudents(students);
                        setTimeout(() => document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
                    } catch (e) {
                        setError(`시험 시간표 자동 컴파일 실패: ${e.message}`);
                    } finally {
                        setIsLoading(false);
                    }
                }, 100);
            }).catch(err => {
                if (isTimedOut) return;
                clearTimeout(timeoutId);
                setError("파이어베이스 DB 무선 연결에 실패했습니다: " + err.message);
                setIsLoading(false);
            });
        };

        // 자체 포탈 로그인 등을 사용하여 2중 인증(비밀번호) 생략
        runFetch();
    };

    const handleMetadataChange = (e) => {
        const { name, value } = e.target;
        setMetadata(prev => ({ ...prev, [name]: value }));
        setIsMetadataModified(true);
        if (name === 'grade') {
            setSelectedClass('all');
        }
    };

    const handleLogoChange = (e) => {
        const f = e.target.files?.[0];
        if (f && f.type.startsWith('image/')) {
            setError(null);
            const reader = new FileReader();
            reader.onload = (evt) => setLogoSrc(evt.target?.result);
            reader.readAsDataURL(f);
        } else if (f) { setError('이미지 파일(jpg, png 등)을 선택해주세요.'); }
    };

    const handleHeaderInputChange = useCallback((key, field, value) => {
        setHeaderInputs(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    }, []);

    const extractTimeSlotsAndHeaders = (data, targetMetadata) => {
        const activeMetadata = targetMetadata || metadata;
        const filtered = data.filter(entry => filterDataByMetadata(entry, activeMetadata));
        const timeSlotSet = new Set();
        filtered.forEach(entry => { if (entry.날짜 && String(entry.교시).trim()) timeSlotSet.add(`${entry.날짜}|${entry.교시}`); });
        const calculated = Array.from(timeSlotSet)
            .map(s => { if (!s.includes('|')) return null; const [date, pStr] = s.split('|'); const period = parseInt(pStr, 10); return (!isNaN(period) && date) ? { date, period } : null; })
            .filter(Boolean)
            .sort((a, b) => { const daVal = new Date(a.date.split('(')[0].replace(/\//g, '-')); const dbVal = new Date(b.date.split('(')[0].replace(/\//g, '-')); return daVal - dbVal || a.period - b.period; });
        setTimeSlots(calculated);
        const subjectsBySlot = {};
        filtered.forEach(entry => {
            if (isNaN(parseInt(entry.교시, 10))) return;
            const key = `${entry.날짜}|${entry.교시}`;
            if (!subjectsBySlot[key]) subjectsBySlot[key] = new Set();
            subjectsBySlot[key].add(entry.과목);
        });
        const initial = calculated.reduce((acc, slot) => {
            const key = `${slot.date}|${slot.period}`;
            const subjects = Array.from(subjectsBySlot[key] || []).join(', ');
            acc[key] = { subject: subjects.replace(/\s*\(.*?\)\s*/g, '').trim(), time: '', code: '', location: '', notes: '' };
            return acc;
        }, {});
        setHeaderInputs(initial);
        // 소스 데이터에 코드/고사실 컬럼 존재 여부 감지
        if (data.length > 0) {
            const sampleEntry = data.find(e => e.학번) || data[0];
            setHasSourceCodes('코드' in sampleEntry && String(sampleEntry['코드'] || '').trim() !== '');
            setHasSourceLocations('고사실' in sampleEntry && String(sampleEntry['고사실'] || '').trim() !== '');

            // 학번 첫 자리로 학년 자동 감지
            const sid = String(sampleEntry['학번'] || '').trim();
            if (sid.length >= 1 && /^[1-6]/.test(sid)) {
                const detectedGrade = sid.charAt(0);
                setMetadata(prev => ({ ...prev, grade: detectedGrade }));
            }
        }
    };

    const processFiles = useCallback(async (selectedFiles) => {
        if (!selectedFiles || selectedFiles.length === 0) return;
        setError(null);
        setParsedData(null);
        setTimeSlots([]);
        setHeaderInputs({});
        setGeneratedCsvContent(null);
        setGeneratedCsvRows(null);
        setIndividualStudents(null);
        setSelectedClass('all');
        setHasSourceCodes(false);
        setHasSourceLocations(false);

        const fileArray = Array.from(selectedFiles);
        setFiles(fileArray);

        const parseSingleFile = (selectedFile) => {
            return new Promise((resolve, reject) => {
                const fileName = selectedFile.name.toLowerCase();
                const isCsv = selectedFile.type === 'text/csv' || fileName.endsWith('.csv');
                const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || selectedFile.type.includes('spreadsheet');
                if (!isCsv && !isExcel) {
                    reject(new Error(`${selectedFile.name}: 잘못된 파일 형식입니다. CSV 또는 Excel 파일을 업로드해주세요.`));
                    return;
                }

                if (isExcel) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const wb = XLSX.read(event.target?.result, { type: 'array' });
                            const ws = wb.Sheets[wb.SheetNames[0]];
                            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                            if (!rows || rows.length < 2) {
                                reject(new Error(`${selectedFile.name}: Excel 파일에 데이터가 없습니다.`));
                                return;
                            }
                            const headers = rows[0].map(h => String(h || '').trim().replace(/^\uFEFF/, ''));
                            const cleanData = rows.slice(1).map(row => {
                                const obj = {};
                                headers.forEach((h, i) => { obj[h] = String(row[i] || '').trim(); });
                                if (obj['날짜']) obj['날짜'] = formatUniformDate(obj['날짜'], metadata.year);
                                return obj;
                            });
                            if (!cleanData[0] || !('학번' in cleanData[0] && '이름' in cleanData[0] && '날짜' in cleanData[0] && '교시' in cleanData[0] && '과목' in cleanData[0])) {
                                reject(new Error(`${selectedFile.name}: Excel 파일의 헤더가 올바르지 않습니다. "학번,이름,날짜,교시,과목" 열이 포함되어 있는지 확인해주세요.`));
                                return;
                            }
                            resolve(cleanData);
                        } catch (err) {
                            reject(new Error(`${selectedFile.name}: Excel 파싱 오류: ${err.message}`));
                        }
                    };
                    reader.onerror = () => reject(new Error(`${selectedFile.name}: 파일을 읽는 중 오류가 발생했습니다.`));
                    reader.readAsArrayBuffer(selectedFile);
                } else {
                    Papa.parse(selectedFile, {
                        header: true, skipEmptyLines: true, encoding: "UTF-8",
                        complete: (results) => {
                            const cleanData = results.data.map(row => {
                                const newRow = {};
                                for (const key in row) { const ck = key.trim().replace(/^\uFEFF/, ''); newRow[ck] = row[key]; }
                                if (newRow['날짜']) newRow['날짜'] = formatUniformDate(newRow['날짜'], metadata.year);
                                return newRow;
                            });
                            if (!cleanData[0] || !('학번' in cleanData[0] && '이름' in cleanData[0] && '날짜' in cleanData[0] && '교시' in cleanData[0] && '과목' in cleanData[0])) {
                                reject(new Error(`${selectedFile.name}: CSV 파일의 헤더가 올바르지 않습니다. "학번,이름,날짜,교시,과목" 열이 포함되어 있는지 확인해주세요.`));
                                return;
                            }
                            resolve(cleanData);
                        },
                        error: (err) => reject(new Error(`${selectedFile.name}: CSV 파싱 오류: ${err.message}`))
                    });
                }
            });
        };

        try {
            const results = await Promise.all(fileArray.map(f => parseSingleFile(f)));
            const combinedData = results.flat();
            if (combinedData.length === 0) {
                setError('모든 파일에 유효한 데이터가 없습니다.');
                return;
            }
            setParsedData(combinedData);
            extractTimeSlotsAndHeaders(combinedData);
        } catch (err) {
            setError(err.message);
            setFiles([]);
        }
    }, [metadata.year]);

    const handleFileChange = (e) => processFiles(e.target.files);
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); processFiles(e.dataTransfer.files); };

    const handleGenerate = useCallback(() => {
        if (!parsedData || timeSlots.length === 0) { setError('데이터가 없습니다. 먼저 파일을 업로드해주세요.'); return; }
        setError(null); setIsLoading(true); setGeneratedCsvContent(null); setGeneratedCsvRows(null); setIndividualStudents(null);
        setTimeout(() => {
            try {
                const { csvString, csvRows } = generatePersonalTimetableCsv(parsedData, metadata, headerInputs);
                setGeneratedCsvContent(csvString);
                setGeneratedCsvRows(csvRows);
                const students = generateIndividualStudentData(parsedData, headerInputs, metadata);
                setIndividualStudents(students);
                setTimeout(() => document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
            } catch (e) { setError(`생성 오류: ${e.message}`); }
            finally { setIsLoading(false); }
        }, 500);
    }, [parsedData, metadata, timeSlots, headerInputs]);

    const isGenerateDisabled = useMemo(() => isLoading || files.length === 0 || !parsedData || timeSlots.length === 0, [isLoading, files, parsedData, timeSlots]);

    // 학급 목록
    const availableClasses = useMemo(() => {
        if (!generatedCsvRows) return [];
        const classSet = new Set();
        const gradeStr = String(metadata.grade);
        generatedCsvRows.slice(4).forEach(row => {
            const sid = row[0] || '';
            if (sid && sid.length >= 3) {
                const grade = sid.substring(0, 1);
                if (grade === gradeStr) {
                    const classNum = parseInt(sid.substring(1, 3), 10);
                    if (!isNaN(classNum)) classSet.add(`${grade}-${classNum}`);
                }
            }
        });
        return ['all', ...Array.from(classSet).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}))];
    }, [generatedCsvRows, metadata.grade]);

    // 학급별 시험 시간표 필터
    const filteredCsvRows = useMemo(() => {
        if (!generatedCsvRows) return null;
        if (selectedClass === 'all') {
            const gradeStr = String(metadata.grade);
            return [
                ...generatedCsvRows.slice(0, 4),
                ...generatedCsvRows.slice(4).filter(row => (row[0]||'').startsWith(gradeStr))
            ];
        }
        const [grade, classNumStr] = selectedClass.split('-');
        const classPrefix = `${grade}${String(classNumStr).padStart(2, '0')}`;
        return [...generatedCsvRows.slice(0, 4), ...generatedCsvRows.slice(4).filter(row => (row[0]||'').startsWith(classPrefix))];
    }, [generatedCsvRows, selectedClass, metadata.grade]);

    // 개인별 학생 필터
    const filteredStudents = useMemo(() => {
        if (!individualStudents) return null;
        if (selectedClass === 'all') {
            const gradeStr = String(metadata.grade);
            return individualStudents.filter(s => s.studentId.startsWith(gradeStr));
        }
        const [grade, classNumStr] = selectedClass.split('-');
        const classPrefix = `${grade}${String(classNumStr).padStart(2, '0')}`;
        return individualStudents.filter(s => s.studentId.startsWith(classPrefix));
    }, [individualStudents, selectedClass, metadata.grade]);

    // 학급별 시험 시간표 인쇄
    const handlePrint = () => {
        const printableElement = document.getElementById('printable-section');
        if (!printableElement) return setError('인쇄할 내용을 찾을 수 없습니다.');
        const printableClone = printableElement.cloneNode(true);
        const toRemove = printableClone.querySelector('.print-hidden');
        if (toRemove) toRemove.remove();
        const printWindow = window.open('', '_blank', 'width=1200,height=800');
        if (!printWindow) return setError('팝업이 차단되었습니다. 팝업을 허용해주세요.');
        const tailwindScript = document.querySelector('script[src="https://cdn.tailwindcss.com"]')?.outerHTML || '';
        const inlineStyles = Array.from(document.querySelectorAll('style')).map(s => s.innerHTML).join('');
        printWindow.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>시험 시간표 인쇄</title>${tailwindScript}<style>${inlineStyles}@page{size:A4 landscape;margin:0;}html,body{width:297mm!important;height:210mm!important;margin:0!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;background:white!important;}#printable-section{width:275mm!important;max-width:275mm!important;margin:0 auto!important;transform:scale(0.9)!important;transform-origin:center center!important;}</style></head><body class="bg-white">${printableClone.innerHTML}</body></html>`);
        printWindow.document.close();
        setTimeout(() => { printWindow.focus(); printWindow.print(); printWindow.close(); }, 1000);
    };

    // 개인별 시간표 인쇄
    const handlePrintIndividual = () => {
        if (!filteredStudents || filteredStudents.length === 0) return setError('인쇄할 학생 데이터가 없습니다.');
        const printWindow = window.open('', '_blank', 'width=900,height=1000');
        if (!printWindow) return setError('팝업이 차단되었습니다. 팝업을 허용해주세요.');
        const html = buildIndividualPrintDoc(filteredStudents, metadata, logoSrc);
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => { printWindow.focus(); printWindow.print(); printWindow.close(); }, 2000);
    };

    const hasResults = filteredCsvRows || filteredStudents;

    return (
        <div className="flex-grow flex flex-col relative w-full">
            {dialogConfig && <CustomDialog dialogConfig={dialogConfig} onClose={() => setDialogConfig(null)} />}
            <PortalHeader darkMode={darkMode} onToggleDark={toggleDark} onFont={handleFont} onOpenAdmin={handleOpenAdmin} logoSrc={logoSrc} isAdminLoggedIn={isAdminLoggedIn} onLogout={handleLogout} />

            {/* Hero — 업무포털 배너 스타일 */}
            <div className="print-hidden w-full max-w-[1280px] mx-auto px-4 sm:px-6 pt-7">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b5fa6] via-[#2575c0] to-[#3a92d6] px-7 sm:px-10 py-9 sm:py-11 shadow-[0_12px_40px_rgba(31,99,166,0.28)]">
                    <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
                        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/15 blur-2xl"></div>
                        <div className="absolute -bottom-24 right-1/4 w-80 h-80 rounded-full bg-[#5fc6e8]/25 blur-3xl"></div>
                        <div className="absolute top-1/3 -left-12 w-56 h-56 rounded-full bg-[#34b3a0]/20 blur-2xl"></div>
                    </div>
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="inline-flex items-center gap-1.5 bg-white/15 text-white px-3 py-1 rounded-full text-xs font-semibold border border-white/25 backdrop-blur-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> 업무 자동화 도구
                                </span>
                                <span className="inline-flex items-center bg-amber-400 text-amber-900 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider shadow-sm">DATA POWERED</span>
                            </div>
                            <h1 className="text-3xl md:text-[42px] leading-tight font-extrabold text-white tracking-tight drop-shadow-sm">시험 시간표 자동 생성 시스템</h1>
                            <p className="text-base text-blue-50/90 mt-3 font-medium">학급별 시험 시간표 및 개인별 배부용 카드를 자동으로 생성합니다.</p>
                        </div>
                        <div className="hidden md:block flex-shrink-0">
                            <svg width="150" height="120" viewBox="0 0 150 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-95">
                                <rect x="18" y="20" width="100" height="80" rx="9" fill="#ffffff" fillOpacity="0.95"/>
                                <rect x="18" y="20" width="100" height="20" rx="9" fill="#bfe0fb"/>
                                <rect x="18" y="34" width="100" height="6" fill="#bfe0fb"/>
                                <line x1="51" y1="40" x2="51" y2="100" stroke="#dbe9f7" strokeWidth="2"/>
                                <line x1="84" y1="40" x2="84" y2="100" stroke="#dbe9f7" strokeWidth="2"/>
                                <line x1="18" y1="58" x2="118" y2="58" stroke="#dbe9f7" strokeWidth="2"/>
                                <line x1="18" y1="78" x2="118" y2="78" stroke="#dbe9f7" strokeWidth="2"/>
                                <rect x="56" y="62" width="23" height="12" rx="3" fill="#34b3a0"/>
                                <rect x="89" y="82" width="23" height="12" rx="3" fill="#2575c0"/>
                                <circle cx="110" cy="30" r="4" fill="#1b5fa6"/>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            <main className="w-full relative z-20 flex-grow flex flex-col">
                <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 pt-8 pb-10">
                    <div className="print-hidden space-y-6">
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl shadow-sm flex items-start gap-3">
                                <svg className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <div><p className="font-bold text-red-800 text-sm">오류가 발생했습니다</p><p className="text-red-600 text-sm mt-1">{error}</p></div>
                            </div>
                        )}

                        <div className="w-full space-y-6">
                            {/* 기본 학사 정보 */}
                            <Card 
                                title={
                                    <div className="flex items-center gap-2">
                                        <span>기본 학사 정보</span>
                                        {defaultMetadata && metadata.year === defaultMetadata.year && metadata.semester === defaultMetadata.semester && metadata.grade === defaultMetadata.grade && metadata.examType === defaultMetadata.examType && (
                                            <span className="text-[11px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">★ 기본값</span>
                                        )}
                                    </div>
                                } 
                                badgeText="SCOPE SETTING" 
                                theme="blue"
                                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                            >
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <InputBox label="학년도" type="number" name="year" value={metadata.year} onChange={handleMetadataChange} />
                                    <SelectBox label="학기" name="semester" value={metadata.semester} onChange={handleMetadataChange} options={[{value:'1',label:'1학기'},{value:'2',label:'2학기'}]} />
                                    <SelectBox label="고사 구분" name="examType" value={metadata.examType} onChange={handleMetadataChange} options={[{value:'midterm',label:'중간고사'},{value:'final',label:'기말고사'}]} />
                                    <SelectBox label="학년" name="grade" value={metadata.grade} onChange={handleMetadataChange} options={[{value:'1',label:'1학년'},{value:'2',label:'2학년'},{value:'3',label:'3학년'}]} />
                                </div>

                                {isAdminLoggedIn && catalog && catalog.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-extrabold px-1.5 py-0.5 rounded">관리자 전용</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                <span>파이어베이스 DB 등록 시험 바로가기:</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { setAdminTab('catalog'); setIsAdminOpen(true); }}
                                                className="text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold underline cursor-pointer"
                                            >
                                                전체 목록 관리
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {catalog.map(item => {
                                                const isSelected = metadata.year === item.year && metadata.semester === item.semester && metadata.grade === item.grade && metadata.examType === item.examType;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setMetadata({ year: item.year, semester: item.semester, grade: item.grade, examType: item.examType });
                                                            setSelectedClass('all');
                                                        }}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                            isSelected
                                                                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                                                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200'
                                                        }`}
                                                    >
                                                        <span>{item.year}년 {item.semester}학기 {item.grade}학년 {item.examType === 'midterm' ? '중간' : '기말'}</span>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'}`}>{item.studentCount}명</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </Card>

                            {isOfflineMode && (
                                <Card title="오프라인 데이터 업로드 (로컬 모드)" badgeText="MANUAL INPUT" theme="orange"
                                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}
                                >
                                    <div className="space-y-4">
                                        <div className="bg-orange-50 text-orange-800 p-3 rounded-xl text-xs border border-orange-100 italic">
                                            DB 연결이 실패하여 로컬 모드로 전환되었습니다. 직접 CSV 또는 Excel 원본 파일을 업로드하여 시간표를 생성하실 수 있습니다.
                                        </div>
                                        <label htmlFor="offline-file-upload" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                                            className={`transition-all duration-200 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer ${isDragging ? 'border-orange-400 bg-orange-50/50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-orange-300 dark:bg-slate-700 dark:border-slate-600'}`}>
                                            <div className={`p-3 rounded-full mb-2 ${files.length > 0 ? 'bg-orange-100 text-orange-600' : 'bg-white shadow-sm text-slate-400'}`}>
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    {files.length > 0 ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />}
                                                </svg>
                                            </div>
                                            <div className="text-center text-xs w-full px-2">
                                                {files.length > 0 ? <p className="font-bold text-orange-600 italic truncate">{files.map(f => f.name).join(', ')}</p> : <p className="font-bold text-slate-700 dark:text-slate-300 truncate text-[11px]">클릭하거나 파일을 드래그하여 원본 데이터 업로드</p>}
                                            </div>
                                            <input id="offline-file-upload" type="file" className="sr-only" accept=".csv,.xlsx,.xls" multiple onChange={handleFileChange} />
                                        </label>
                                    </div>
                                </Card>
                            )}
                        </div>

                        {/* 생성 버튼 */}
                        <div className="pt-4 pb-4">
                            <button onClick={isOfflineMode ? handleGenerate : handleUserGenerateWithAuth} disabled={isOfflineMode ? isGenerateDisabled : isLoading}
                                className={`group relative flex items-center justify-center px-10 py-5 text-lg font-black rounded-3xl shadow-lg transition-all duration-300 w-full overflow-hidden ${(isOfflineMode ? isGenerateDisabled : isLoading) ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white hover:shadow-indigo-500/20 hover:scale-[1.005] active:scale-98'}`}>
                                {!isLoading && <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>}
                                {isLoading ? (
                                    <><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>데이터 처리 중...</>
                                ) : <span>{hasResults ? '최신 정보로 다시 생성' : '시험 시간표 생성 및 조회'}</span>}
                            </button>
                            <style dangerouslySetInnerHTML={{__html: `@keyframes shimmer{100%{transform:translateX(100%);}}` }} />
                        </div>
                    </div>
                </div>

                {/* ── 관리자 패널 설정 모달 영역 ── */}
                {isAdminOpen && (
                    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-100 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
                            {/* Modal Header */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <span className="p-2 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </span>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight">원묵고등학교 관리자 패널</h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">학년도/학기/고사/학년별 데이터 업로드 및 디폴트 설정 관리</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        type="button"
                                        onClick={handleLogout} 
                                        className="px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                        title="관리자 로그아웃"
                                    >
                                        로그아웃
                                    </button>
                                    <button onClick={() => setIsAdminOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* ── 관리자 탭 네비게이션 ── */}
                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 px-6 pt-3 gap-2 overflow-x-auto">
                                <button
                                    type="button"
                                    onClick={() => setAdminTab('upload')}
                                    className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${adminTab === 'upload' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    <span>고사별 데이터 업로드</span>
                                    {adminParsedData && <span className="w-2 h-2 rounded-full bg-orange-500"></span>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAdminTab('default')}
                                    className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${adminTab === 'default' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                    <span>디폴트 학사 정보 설정</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAdminTab('catalog')}
                                    className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${adminTab === 'catalog' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                    <span>등록 데이터 목록 ({catalog ? catalog.length : 0})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAdminTab('logo')}
                                    className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${adminTab === 'logo' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    <span>학교 로고</span>
                                </button>
                            </div>
                            
                            {/* Modal Body */}
                            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                                
                                {/* 탭 1: 고사별 데이터 업로드 */}
                                {adminTab === 'upload' && (
                                    <div className="space-y-6">
                                        <div className="bg-amber-50/75 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4 text-xs sm:text-sm text-amber-900 dark:text-amber-300">
                                            <p className="font-bold mb-1">💡 학년도, 학기, 고사, 학년별 데이터 업로드</p>
                                            <p>아래에서 업로드 대상 학사 조건을 지정한 후 해당 고사의 시간표 파일(CSV 또는 Excel)을 업로드하세요. 조건별로 파이어베이스 DB에 독립적으로 저장되며, 즉시 전체 사용자에게 배포됩니다.</p>
                                        </div>

                                        {/* 업로드 대상 학사 조건 설정 */}
                                        <Card title="1. 업로드 대상 학사 조건 지정" badgeText="STEP 1" theme="blue"
                                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
                                        >
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                <InputBox label="학년도" type="number" name="year" value={adminTargetMetadata.year} onChange={handleAdminTargetChange} />
                                                <SelectBox label="학기" name="semester" value={adminTargetMetadata.semester} onChange={handleAdminTargetChange} options={[{value:'1',label:'1학기'},{value:'2',label:'2학기'}]} />
                                                <SelectBox label="고사 구분" name="examType" value={adminTargetMetadata.examType} onChange={handleAdminTargetChange} options={[{value:'midterm',label:'중간고사'},{value:'final',label:'기말고사'}]} />
                                                <SelectBox label="학년" name="grade" value={adminTargetMetadata.grade} onChange={handleAdminTargetChange} options={[{value:'1',label:'1학년'},{value:'2',label:'2학년'},{value:'3',label:'3학년'}]} />
                                            </div>
                                        </Card>

                                        {/* 시간표 파일 선택 */}
                                        <Card title="2. 원본 시간표 파일 업로드" badgeText="STEP 2" theme="indigo"
                                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>}
                                        >
                                            <label htmlFor="admin-scoped-file-upload" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleAdminFileChange({ target: { files: e.dataTransfer.files } }); }}
                                                className={`transition-all duration-200 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer ${isDragging ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-indigo-300 dark:bg-slate-700 dark:border-slate-600'}`}>
                                                <div className={`p-3 rounded-full mb-2 ${adminFiles.length > 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-white shadow-sm text-slate-400'}`}>
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        {adminFiles.length > 0 ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />}
                                                    </svg>
                                                </div>
                                                <div className="text-center text-xs w-full px-2">
                                                    {adminFiles.length > 0 ? (
                                                        <div className="space-y-1 w-full">
                                                            <p className="font-bold text-indigo-600">선택된 파일 ({adminFiles.length}개):</p>
                                                            <div className="max-h-20 overflow-y-auto text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 bg-indigo-50/30 dark:bg-slate-800 p-2 rounded-lg border border-indigo-100/30 text-left">
                                                                {adminFiles.map((f, i) => (
                                                                    <p key={i} className="truncate" title={f.name}>{f.name}</p>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <><p className="font-bold text-slate-700 dark:text-slate-300">클릭하거나 시간표 파일을 드래그하여 업로드</p><p className="text-slate-400 mt-1">CSV 또는 Excel (.xlsx, .xls) 파일 지원 ("학번, 이름, 날짜, 교시, 과목" 열)</p></>
                                                    )}
                                                </div>
                                                <input id="admin-scoped-file-upload" type="file" className="sr-only" accept=".csv,.xlsx,.xls" multiple onChange={handleAdminFileChange} />
                                            </label>

                                            {/* 파싱 및 분석 결과 카드 */}
                                            {adminParsedData && (
                                                <div className="mt-4 p-4 rounded-2xl bg-indigo-50/50 dark:bg-slate-900/40 border border-indigo-100 dark:border-indigo-950 space-y-2 text-xs">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-indigo-900 dark:text-indigo-300">파일 파싱 분석 결과:</span>
                                                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px]">정상 분석됨</span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2 text-slate-600 dark:text-slate-300 pt-1">
                                                        <div className="bg-white dark:bg-slate-800 p-2 rounded-xl text-center border border-slate-100 dark:border-slate-700">
                                                            <div className="text-slate-400 text-[10px]">총 데이터 행</div>
                                                            <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">{adminParsedData.length}행</div>
                                                        </div>
                                                        <div className="bg-white dark:bg-slate-800 p-2 rounded-xl text-center border border-slate-100 dark:border-slate-700">
                                                            <div className="text-slate-400 text-[10px]">응시 학생 수</div>
                                                            <div className="font-bold text-sm text-indigo-600 dark:text-indigo-400 mt-0.5">{new Set(adminParsedData.map(e => e.학번)).size}명</div>
                                                        </div>
                                                        <div className="bg-white dark:bg-slate-800 p-2 rounded-xl text-center border border-slate-100 dark:border-slate-700">
                                                            <div className="text-slate-400 text-[10px]">검출 타임슬롯</div>
                                                            <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">{adminTimeSlots.length}교시</div>
                                                        </div>
                                                    </div>

                                                    {/* 학년 일치 여부 점검 */}
                                                    {(() => {
                                                        const sample = adminParsedData.find(e => e.학번) || adminParsedData[0];
                                                        const sid = String(sample?.학번 || '').trim();
                                                        if (sid.length >= 1 && /^[1-6]/.test(sid) && sid.charAt(0) !== adminTargetMetadata.grade) {
                                                            return (
                                                                <div className="p-2.5 bg-amber-100 text-amber-900 rounded-xl font-bold text-[11px] border border-amber-300 mt-2">
                                                                    ⚠️ 파일 내 대표 학번({sid})의 학년과 선택한 업로드 학년({adminTargetMetadata.grade}학년)이 서로 다릅니다. STEP 1의 학년 선택을 다시 한 번 확인해주세요.
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            )}
                                        </Card>

                                        {/* 디폴트 자동 지정 체크박스 */}
                                        <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 text-xs sm:text-sm font-bold text-orange-900 dark:text-orange-300 cursor-pointer transition-colors hover:bg-orange-100/50 select-none">
                                            <input
                                                type="checkbox"
                                                checked={setAsDefaultOnUpload}
                                                onChange={(e) => setSetAsDefaultOnUpload(e.target.checked)}
                                                className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4"
                                            />
                                            <span>이 데이터를 메인 화면의 기본(디폴트) 학사 정보로 함께 지정하기</span>
                                        </label>

                                        {/* 저장 실행 버튼 */}
                                        <button
                                            type="button"
                                            onClick={handleSaveScopedData}
                                            disabled={adminDbUploading || !adminParsedData || adminParsedData.length === 0}
                                            className={`w-full py-4 px-6 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all ${
                                                adminDbUploading || !adminParsedData || adminParsedData.length === 0
                                                    ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed shadow-none'
                                                    : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:shadow-orange-500/30 active:scale-98'
                                            }`}
                                        >
                                            {adminDbUploading ? (
                                                <><svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>파이어베이스 DB에 저장 중...</>
                                            ) : (
                                                <><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                                [{adminTargetMetadata.year}학년도 {adminTargetMetadata.semester}학기 {adminTargetMetadata.grade}학년 {adminTargetMetadata.examType === 'midterm' ? '중간고사' : '기말고사'}] DB에 저장하기</>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* 탭 2: 기본(디폴트) 학사 정보 설정 */}
                                {adminTab === 'default' && (
                                    <div className="space-y-6">
                                        <div className="bg-amber-50/75 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4 text-xs sm:text-sm text-amber-900 dark:text-amber-300">
                                            <p className="font-bold mb-1">⭐ 메인 화면 기본(디폴트) 학사 정보 설정</p>
                                            <p>학생과 교사가 웹앱에 접속했을 때 메인 화면에 가장 먼저 기본으로 표시될 학년도, 학기, 고사, 학년을 설정합니다. 설정된 디폴트 값은 파이어베이스 DB를 통해 모든 사용자의 초기 화면에 공통 적용됩니다.</p>
                                        </div>

                                        {/* 현재 활성화된 디폴트 표시 */}
                                        <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-2xl flex items-center justify-between">
                                            <div>
                                                <div className="text-xs font-bold text-orange-600 dark:text-orange-400">현재 활성화된 기본(디폴트) 학사 정보</div>
                                                <div className="text-lg font-black text-slate-800 dark:text-white mt-1">
                                                    {defaultMetadata.year}학년도 {defaultMetadata.semester}학기 {defaultMetadata.grade}학년 {defaultMetadata.examType === 'midterm' ? '중간고사' : '기말고사'}
                                                </div>
                                            </div>
                                            <span className="px-3 py-1 bg-orange-500 text-white font-bold text-xs rounded-full shadow-sm">
                                                현재 적용 중
                                            </span>
                                        </div>

                                        {/* 디폴트 변경 폼 */}
                                        <Card title="새로운 기본(디폴트) 학사 정보 지정" badgeText="CONFIG" theme="orange"
                                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>}
                                        >
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                <InputBox label="기본 학년도" type="number" name="year" value={adminDefaultForm.year} onChange={e => setAdminDefaultForm(prev => ({ ...prev, year: e.target.value }))} />
                                                <SelectBox label="기본 학기" name="semester" value={adminDefaultForm.semester} onChange={e => setAdminDefaultForm(prev => ({ ...prev, semester: e.target.value }))} options={[{value:'1',label:'1학기'},{value:'2',label:'2학기'}]} />
                                                <SelectBox label="기본 고사 구분" name="examType" value={adminDefaultForm.examType} onChange={e => setAdminDefaultForm(prev => ({ ...prev, examType: e.target.value }))} options={[{value:'midterm',label:'중간고사'},{value:'final',label:'기말고사'}]} />
                                                <SelectBox label="기본 학년" name="grade" value={adminDefaultForm.grade} onChange={e => setAdminDefaultForm(prev => ({ ...prev, grade: e.target.value }))} options={[{value:'1',label:'1학년'},{value:'2',label:'2학년'},{value:'3',label:'3학년'}]} />
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleSaveDefaultMetadata(adminDefaultForm)}
                                                disabled={adminSavingDefault}
                                                className={`mt-4 w-full py-3.5 px-6 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 shadow-md transition-all ${
                                                    adminSavingDefault
                                                        ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed shadow-none'
                                                        : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:shadow-orange-500/30 active:scale-98'
                                                }`}
                                            >
                                                {adminSavingDefault ? "디폴트 정보 저장 중..." : "기본(디폴트) 학사 정보로 저장 및 적용"}
                                            </button>
                                        </Card>
                                    </div>
                                )}

                                {/* 탭 3: 등록 데이터 카탈로그 관리 */}
                                {adminTab === 'catalog' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-black text-slate-800 dark:text-white text-base">파이어베이스 DB 등록 시험 목록</h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">현재 클라우드 데이터베이스에 보관 중인 고사별 데이터입니다.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setAdminTab('upload')}
                                                className="px-3 py-1.5 rounded-xl bg-orange-100 text-orange-700 hover:bg-orange-200 font-bold text-xs transition-colors"
                                            >
                                                + 새 고사 데이터 추가
                                            </button>
                                        </div>

                                        {catalog.length === 0 ? (
                                            <div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 space-y-3">
                                                <p className="text-slate-400 font-medium text-sm">파이어베이스 DB에 등록된 시험 데이터가 아직 없습니다.</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdminTab('upload')}
                                                    className="px-4 py-2 bg-orange-500 text-white rounded-xl font-bold text-xs hover:bg-orange-600 transition-colors shadow-sm"
                                                >
                                                    첫 시험 데이터 파일 업로드하기
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {catalog.map((item) => {
                                                    const isDefault = defaultMetadata && item.year === defaultMetadata.year && item.semester === defaultMetadata.semester && item.grade === defaultMetadata.grade && item.examType === defaultMetadata.examType;
                                                    const examName = item.examType === 'midterm' ? '중간고사' : '기말고사';
                                                    return (
                                                        <div key={item.id} className={`p-4 rounded-2xl border transition-all ${isDefault ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800' : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'}`}>
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-black text-slate-800 dark:text-white text-base">
                                                                            {item.year}학년도 {item.semester}학기 {item.grade}학년 {examName}
                                                                        </span>
                                                                        {isDefault && (
                                                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                                                                                ★ 현재 기본값
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                                                        <span>학생: <strong className="text-slate-700 dark:text-slate-200">{item.studentCount}명</strong></span>
                                                                        <span>행 수: <strong className="text-slate-700 dark:text-slate-200">{item.rowCount}행</strong></span>
                                                                        {item.fileName && <span className="truncate max-w-[200px]">파일: {item.fileName}</span>}
                                                                        {item.updatedAtText && <span>등록: {item.updatedAtText}</span>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                                    {!isDefault && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSaveDefaultMetadata({ year: item.year, semester: item.semester, grade: item.grade, examType: item.examType })}
                                                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 transition-colors"
                                                                        >
                                                                            기본값 지정
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteCatalogItem(item)}
                                                                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                                                    >
                                                                        삭제
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 탭 4: 학교 로고 */}
                                {adminTab === 'logo' && (
                                    <div className="space-y-6">
                                        <div className="bg-amber-50/75 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4 text-xs sm:text-sm text-amber-900 dark:text-amber-300">
                                            <p className="font-bold mb-1">🏫 학교 로고 설정</p>
                                            <p>시간표 및 개인별 시험 안내 카드 상단에 표시되는 학교 로고 이미지를 파이어베이스 DB에 등록합니다.</p>
                                        </div>

                                        <Card title="학교 로고 이미지 등록" badgeText="LOGO" theme="teal"
                                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                                        >
                                            <div className="flex flex-col gap-4 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                                                <input type="file" id="admin-logo-upload-tab" className="sr-only" accept="image/*" onChange={handleLogoChange}/>
                                                <div className="flex items-center gap-3">
                                                    <label htmlFor="admin-logo-upload-tab" className="cursor-pointer py-2.5 px-4 font-bold rounded-xl text-xs text-teal-700 bg-teal-100 hover:bg-teal-200 transition-colors shadow-sm inline-block">
                                                        {logoSrc ? '로고 이미지 변경하기' : '이미지 파일 선택 (jpg, png 등)'}
                                                    </label>
                                                    {logoSrc && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setLogoSrc(null)}
                                                            className="text-xs font-bold text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            로고 제거
                                                        </button>
                                                    )}
                                                </div>

                                                {logoSrc ? (
                                                    <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                                                        <img src={logoSrc} alt="학교 로고 미리보기" className="max-h-16 max-w-xs object-contain" />
                                                    </div>
                                                ) : (
                                                    <p className="text-slate-400 text-xs italic">등록된 로고 이미지가 없습니다.</p>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={handleSaveLogoToFirebase}
                                                    className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-sm"
                                                >
                                                    학교 로고 파이어베이스 DB에 저장
                                                </button>
                                            </div>
                                        </Card>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="bg-slate-50 dark:bg-slate-900/30 px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-medium">원묵고등학교 시간표 관리 시스템</span>
                                <button onClick={() => setIsAdminOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 dark:text-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition-colors">
                                    닫기
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── 결과 영역 ── */}
                {hasResults && (
                    <div id="result-section" className="w-full bg-slate-50/70 border-t border-slate-200 mt-4 pt-8 pb-20 px-2 sm:px-6 lg:px-8 print:bg-white print:border-none print:p-0 print:mt-0 print:pb-0">
                        <div className="max-w-[1600px] mx-auto w-full print:max-w-none">

                            {/* 컨트롤 바 */}
                            <div className="print-hidden mb-6 max-w-6xl mx-auto">
                                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 sm:p-4 flex flex-row items-center justify-between gap-3 overflow-x-auto scrollbar-none">
                                    <div className="flex flex-row items-center gap-3 flex-shrink-0">
                                        {/* 뷰 모드 탭 */}
                                        <div className="flex bg-slate-100 p-1 rounded-xl">
                                            <button onClick={() => setViewMode('individual')}
                                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === 'individual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                개인별 카드
                                            </button>
                                            <button onClick={() => setViewMode('grid')}
                                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" /></svg>
                                                학급별 시험 시간표
                                            </button>
                                        </div>

                                        {/* 학급 필터 */}
                                        {availableClasses.length > 1 && (
                                            <div className="flex flex-nowrap gap-1 bg-slate-100 p-1 rounded-xl max-w-full overflow-x-auto scrollbar-none flex-shrink-0">
                                                {availableClasses.map(cn => (
                                                    <button key={cn} onClick={() => setSelectedClass(cn)}
                                                        className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-all ${selectedClass === cn ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
                                                        {cn === 'all' ? '전체' : `${cn}반`}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* 인쇄 버튼 */}
                                    <button onClick={viewMode === 'individual' ? handlePrintIndividual : handlePrint}
                                        className="flex-shrink-0 flex items-center justify-center px-8 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-500 active:scale-95 transition-all shadow-sm whitespace-nowrap">
                                        인쇄
                                    </button>
                                </div>
                            </div>

                            {/* ── 개인별 카드 뷰 ── */}
                            {viewMode === 'individual' && filteredStudents && (
                                <div className="px-2 max-w-6xl mx-auto">
                                    {filteredStudents.length === 0 ? (
                                        <div className="text-center py-16 text-slate-400 font-medium">해당 학급 학생 데이터가 없습니다.</div>
                                    ) : (
                                        <>
                                            <p className="text-sm text-slate-500 mb-4 font-medium">
                                                총 <span className="font-bold text-slate-700">{filteredStudents.length}명</span>의 개인별 시험 시간표 — 인쇄 시 A4 1장에 2명씩 출력됩니다.
                                            </p>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                                {filteredStudents.map(student => (
                                                    <IndividualStudentCard key={student.studentId} student={student} metadata={metadata} logoSrc={logoSrc} />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ── 학급별 시험 시간표 뷰 ── */}
                            {viewMode === 'grid' && filteredCsvRows && (
                                <div id="printable-section" className="w-full">
                                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-4 sm:p-8 print-card print:p-0">
                                        <div className="relative mb-6 print-header-container border-b-2 border-slate-800 pb-4">
                                            <h2 className="text-center text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                                                {`${metadata.year}학년도 ${metadata.semester}학기 ${metadata.grade}학년 ${metadata.examType === 'midterm' ? '중간고사' : '기말고사'} 시간표`}
                                            </h2>
                                            {logoSrc && <img src={logoSrc} alt="School Logo" className="absolute top-1/2 -translate-y-1/2 right-0 max-h-[40px] w-auto" />}
                                        </div>
                                        <div id="print-area" className="w-full">
                                            <TimetablePreviewTable data={filteredCsvRows} />
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                )}
            </main>

            <PortalFooter />
        </div>
    );
};

export default App;
