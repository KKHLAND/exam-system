import * as XLSX from "xlsx";
import {
  fetchExamData,
  saveExamData,
  saveExamDataWithGrade,
  fetchSettings,
  saveLogoSetting,
  saveDefaultAcademicInfo,
  deleteExamData,
  deleteExamGradeData,
  addStudentRecord,
  updateStudentRecord,
  deleteStudentRecord,
} from "./firebase.js";

let allStudents = [];
let schoolLogo = null;

export const initDocsApp = () => {
  const fetchBtn = document.getElementById("fetch-data-btn");
  const appContent = document.getElementById("app-content");
  const controlsSection = document.getElementById("controls-section");
  const printableArea = document.getElementById("printable-area");
  const schoolYearInput = document.getElementById("school-year");
  const semesterSelect = document.getElementById("semester");
  const examTypeSelect = document.getElementById("exam-type");
  const targetGradeSelect = document.getElementById("target-grade");
  const dateSelect = document.getElementById("exam-date");
  const periodSelect = document.getElementById("exam-period");
  const subjectSelect = document.getElementById("exam-subject");
  const generateBtn = document.getElementById("generate-btn");
  const logoUpload = document.getElementById("logo-upload");
  const logoControls = document.getElementById("logo-controls");
  const printControls = document.getElementById("print-controls");
  const generationOptions = document.getElementById("generation-options");
  const printAttendanceBtn = document.getElementById("print-attendance-btn");
  const printSeatingChartBtn = document.getElementById(
    "print-seating-chart-btn",
  );
  const printB4Btn = document.getElementById("print-b4-btn");
  const uploadModal = document.getElementById("upload-modal");
  const openUploadModalBtn = document.getElementById("open-upload-modal-btn");
  const closeUploadModalBtn = document.getElementById("close-upload-modal-btn");
  const authModal = document.getElementById("auth-modal");
  const adminBtn = document.getElementById("admin-btn");
  const authPassword = document.getElementById("access-password");
  const authError = document.getElementById("auth-error");
  const closeAdminAuthBtn = document.getElementById("close-admin-auth-btn");
  const csvUpload = document.getElementById("csv-upload");
  const loadingMessage = document.getElementById("loading-message");
  const loadingText = document.getElementById("loading-text");
  const errorMessage = document.getElementById("error-message");
  const errorTextSpan = document.getElementById("error-text");

  // 디폴트 학사 정보 설정 관련 요소
  const defaultSchoolYearInput = document.getElementById("default-school-year");
  const defaultSemesterSelect = document.getElementById("default-semester");
  const defaultExamTypeSelect = document.getElementById("default-exam-type");
  const defaultTargetGradeSelect = document.getElementById("default-target-grade");
  const saveDefaultSettingsBtn = document.getElementById("save-default-settings-btn");
  const defaultSettingsMsg = document.getElementById("default-settings-msg");

  // 업로드 대상 설정 관련 요소
  const uploadSchoolYearInput = document.getElementById("upload-school-year");
  const uploadSemesterSelect = document.getElementById("upload-semester");
  const uploadExamTypeSelect = document.getElementById("upload-exam-type");
  const uploadTargetGradeSelect = document.getElementById("upload-target-grade");

  // 업로드 완료 알림 UI 요소
  const uploadSuccessCard = document.getElementById("upload-success-card");
  const uploadSuccessDetailText = document.getElementById("upload-success-detail-text");
  const statCurrentCount = document.getElementById("stat-current-count");
  const statRetainedCount = document.getElementById("stat-retained-count");
  const statTotalCount = document.getElementById("stat-total-count");
  const dismissUploadSuccessBtn = document.getElementById("dismiss-upload-success-btn");

  const uploadCompleteModal = document.getElementById("upload-complete-modal");
  const modalSuccessExamTitle = document.getElementById("modal-success-exam-title");
  const modalSuccessGrade = document.getElementById("modal-success-grade");
  const modalSuccessCurrentCount = document.getElementById("modal-success-current-count");
  const modalSuccessRetainedCount = document.getElementById("modal-success-retained-count");
  const modalSuccessTotalCount = document.getElementById("modal-success-total-count");
  const closeUploadCompleteModalBtn = document.getElementById("close-upload-complete-modal-btn");

  dismissUploadSuccessBtn?.addEventListener("click", () => {
    uploadSuccessCard?.classList.add("hidden");
  });

  closeUploadCompleteModalBtn?.addEventListener("click", () => {
    uploadCompleteModal?.classList.add("hidden");
  });

  uploadCompleteModal?.addEventListener("click", (e) => {
    if (e.target === uploadCompleteModal) {
      uploadCompleteModal.classList.add("hidden");
    }
  });

  // Set school year default value
  const currentYear = new Date().getFullYear();
  if (schoolYearInput) {
    schoolYearInput.value = currentYear;
  }
  if (uploadSchoolYearInput) {
    uploadSchoolYearInput.value = currentYear;
  }
  if (defaultSchoolYearInput) {
    defaultSchoolYearInput.value = currentYear;
  }

  const manageSchoolYearInput = document.getElementById("manage-school-year");
  const manageSemesterSelect = document.getElementById("manage-semester");
  const manageExamTypeSelect = document.getElementById("manage-exam-type");

  const syncAdminModalInputs = () => {
    const curYear = schoolYearInput?.value || currentYear;
    const curSem = semesterSelect?.value || "1";
    const curExam = examTypeSelect?.value || "중간고사";
    const curGrade = targetGradeSelect?.value || "2";

    if (uploadSchoolYearInput) uploadSchoolYearInput.value = curYear;
    if (uploadSemesterSelect) uploadSemesterSelect.value = curSem;
    if (uploadExamTypeSelect) uploadExamTypeSelect.value = curExam;
    if (uploadTargetGradeSelect) uploadTargetGradeSelect.value = curGrade;

    if (manageSchoolYearInput && !manageSchoolYearInput.value) manageSchoolYearInput.value = curYear;
    if (manageSemesterSelect && !manageSemesterSelect.value) manageSemesterSelect.value = curSem;
    if (manageExamTypeSelect && !manageExamTypeSelect.value) manageExamTypeSelect.value = curExam;

    if (defaultSchoolYearInput && !defaultSchoolYearInput.value) defaultSchoolYearInput.value = curYear;
    if (defaultSemesterSelect && !defaultSemesterSelect.value) defaultSemesterSelect.value = curSem;
    if (defaultExamTypeSelect && !defaultExamTypeSelect.value) defaultExamTypeSelect.value = curExam;
    if (defaultTargetGradeSelect && !defaultTargetGradeSelect.value) defaultTargetGradeSelect.value = curGrade;
  };

  const initializeApp = async () => {
    try {
      const settings = await fetchSettings();
      if (settings) {
        if (settings.schoolLogo) {
          schoolLogo = settings.schoolLogo;
          const headerLogo = document.querySelector("header img");
          if (headerLogo) headerLogo.src = schoolLogo;
        }

        // 기본 학사 정보(디폴트) 적용
        if (settings.defaultAcademicInfo) {
          const def = settings.defaultAcademicInfo;
          if (def.year && schoolYearInput) schoolYearInput.value = def.year;
          if (def.semester && semesterSelect) semesterSelect.value = def.semester;
          if (def.examType && examTypeSelect) examTypeSelect.value = def.examType;
          if (def.grade && targetGradeSelect) targetGradeSelect.value = def.grade;

          if (def.year && defaultSchoolYearInput) defaultSchoolYearInput.value = def.year;
          if (def.semester && defaultSemesterSelect) defaultSemesterSelect.value = def.semester;
          if (def.examType && defaultExamTypeSelect) defaultExamTypeSelect.value = def.examType;
          if (def.grade && defaultTargetGradeSelect) defaultTargetGradeSelect.value = def.grade;

          if (def.year && uploadSchoolYearInput) uploadSchoolYearInput.value = def.year;
          if (def.semester && uploadSemesterSelect) uploadSemesterSelect.value = def.semester;
          if (def.examType && uploadExamTypeSelect) uploadExamTypeSelect.value = def.examType;
          if (def.grade && uploadTargetGradeSelect) uploadTargetGradeSelect.value = def.grade;
        }
      }
      syncAdminModalInputs();
      // 첫 화면에서는 기본 학사 정보만 표시하고 자동 조회하지 않음
      generationOptions?.classList.add("hidden");
      resetOutput();
    } catch (e) {
      console.error("Failed to fetch settings:", e);
    } finally {
      updateLogoControls();
    }
  };

  initializeApp();

  // 기본 학사 정보 저장 핸들러
  saveDefaultSettingsBtn?.addEventListener("click", async () => {
    const year = defaultSchoolYearInput?.value?.trim() || schoolYearInput?.value;
    const semester = defaultSemesterSelect?.value || semesterSelect?.value;
    const examType = defaultExamTypeSelect?.value || examTypeSelect?.value;
    const grade = defaultTargetGradeSelect?.value || targetGradeSelect?.value;

    if (!year) {
      alert("기본 학년도를 입력해주세요.");
      return;
    }

    try {
      saveDefaultSettingsBtn.disabled = true;
      const originalText = saveDefaultSettingsBtn.innerHTML;
      saveDefaultSettingsBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> 저장 중...
      `;

      await saveDefaultAcademicInfo({ year, semester, examType, grade });

      // 메인 화면 컨트롤에도 즉시 반영
      if (schoolYearInput) schoolYearInput.value = year;
      if (semesterSelect) semesterSelect.value = semester;
      if (examTypeSelect) examTypeSelect.value = examType;
      if (targetGradeSelect) targetGradeSelect.value = grade;

      // 업로드 기본값도 연동
      if (uploadSchoolYearInput) uploadSchoolYearInput.value = year;
      if (uploadSemesterSelect) uploadSemesterSelect.value = semester;
      if (uploadExamTypeSelect) uploadExamTypeSelect.value = examType;
      if (uploadTargetGradeSelect) uploadTargetGradeSelect.value = grade;

      if (defaultSettingsMsg) {
        defaultSettingsMsg.classList.remove("hidden");
        setTimeout(() => {
          defaultSettingsMsg.classList.add("hidden");
        }, 4000);
      }
      alert(`기본 학사 정보가 [${year}학년도 ${semester}학기 ${examType} ${grade}학년]으로 설정되었습니다.\n앱에 접속하는 모든 사용자에게 이 조건이 기본값으로 제공됩니다.`);
    } catch (err) {
      alert("기본 학사 정보 저장 중 오류가 발생했습니다: " + err.message);
    } finally {
      saveDefaultSettingsBtn.disabled = false;
      saveDefaultSettingsBtn.innerHTML = "기본 학사 정보 저장";
    }
  });

  const showError = (message) => {
    if (errorTextSpan) errorTextSpan.textContent = message;
    errorMessage?.classList.remove("hidden");
  };
  const hideError = () => {
    errorMessage?.classList.add("hidden");
  };
  const resetOutput = () => {
    printableArea.innerHTML = "";
    printControls?.classList.add("hidden");
    hideError();
  };

  // 통합 앱: 이 페이지는 관리자 로그인 후에만 열리므로 비밀번호 확인 없이 바로 관리자 창을 엽니다.
  openUploadModalBtn?.addEventListener("click", () => {
    uploadSuccessCard?.classList.add("hidden");
    hideError();
    syncAdminModalInputs();
    uploadModal?.classList.remove("hidden");
  });

  closeUploadModalBtn?.addEventListener("click", () => {
    uploadModal?.classList.add("hidden");
    if (allStudents.length > 0) {
      fetchDataAndUpdateUI(); // 이미 조회된 상태에서만 최신 데이터 리프레시
    }
  });

  closeAdminAuthBtn?.addEventListener("click", () => {
    authModal?.classList.add("hidden");
  });

  const formatDateString = (rawDate) => {
    if (!rawDate) return "";
    let dateStr = String(rawDate).trim();
    const match = dateStr.match(
      /(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/,
    );
    if (match) {
      const yyyy = match[1];
      const mm = match[2].padStart(2, "0");
      const dd = match[3].padStart(2, "0");
      const dateObj = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
      if (!isNaN(dateObj.getTime())) {
        const days = ["일", "월", "화", "수", "목", "금", "토"];
        const dayName = days[dateObj.getDay()];
        return `${yyyy}/${mm}/${dd}(${dayName})`;
      }
    }
    if (!isNaN(Number(dateStr)) && Number(dateStr) > 30000) {
      const excelDate = Number(dateStr);
      const dateObj = new Date((excelDate - 25569) * 86400 * 1000);
      dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
      if (!isNaN(dateObj.getTime())) {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
        const dd = String(dateObj.getDate()).padStart(2, "0");
        const days = ["일", "월", "화", "수", "목", "금", "토"];
        const dayName = days[dateObj.getDay()];
        return `${yyyy}/${mm}/${dd}(${dayName})`;
      }
    }
    return dateStr;
  };

  const parseCsv = (csvText) => {
    const processedText = csvText.startsWith("\uFEFF")
      ? csvText.substring(1)
      : csvText;
    const rows = processedText.trim().split(/\r?\n/);
    rows.shift();
    return rows
      .map((row) => {
        if (!row.trim()) return null;
        const values = row
          .trim()
          .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .map((v) => {
            let value = v.trim();
            if (value.startsWith('"') && value.endsWith('"'))
              return value.substring(1, value.length - 1).replace(/""/g, '"');
            return value;
          });
        if (values.length < 9) return null;
        try {
          const studentId = values[1]?.trim();
          const name = values[2]?.trim();
          const date = formatDateString(values[3]?.trim());
          const period = values[4]?.trim();
          const subjectBase = values[5]?.trim();
          const subjectModifier = values[6]?.trim();
          const room = values[7]?.trim();
          const proctor = values[8]?.trim();
          if (
            !studentId ||
            !name ||
            !date ||
            !period ||
            !subjectBase ||
            !subjectModifier ||
            !room ||
            !proctor
          )
            return null;
          const grade = parseInt(studentId[0], 10);
          const studentClass = parseInt(studentId.substring(1, 3), 10);
          const number = parseInt(studentId.substring(3, 5), 10);
          return {
            studentId,
            name,
            date,
            period,
            subject: `${subjectBase} ${subjectModifier}`.trim(),
            grade,
            class: studentClass,
            number,
            room,
            proctor,
          };
        } catch (e) {
          return null;
        }
      })
      .filter((student) => student !== null);
  };

  const parseExcel = (arrayBuffer) => {
    try {
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (rows.length > 0) {
        rows.shift(); // Remove column headers
      }
      
      return rows
        .map((row) => {
          if (!row || row.length === 0) return null;
          const studentId = String(row[1] ?? "").trim();
          const name = String(row[2] ?? "").trim();
          const date = formatDateString(String(row[3] ?? "").trim());
          const period = String(row[4] ?? "").trim();
          const subjectBase = String(row[5] ?? "").trim();
          const subjectModifier = String(row[6] ?? "").trim();
          const room = String(row[7] ?? "").trim();
          const proctor = String(row[8] ?? "").trim();
          
          if (
            !studentId ||
            !name ||
            !date ||
            !period ||
            !subjectBase ||
            !subjectModifier ||
            !room ||
            !proctor
          ) {
            return null;
          }
          
          const grade = parseInt(studentId[0], 10);
          const studentClass = parseInt(studentId.substring(1, 3), 10);
          const number = parseInt(studentId.substring(3, 5), 10);
          return {
            studentId,
            name,
            date,
            period,
            subject: `${subjectBase} ${subjectModifier}`.trim(),
            grade,
            class: studentClass,
            number,
            room,
            proctor,
          };
        })
        .filter((student) => student !== null);
    } catch (e) {
      console.error("Error parsing Excel:", e);
      throw new Error(`엑셀 파일 해석 중 오류가 발생했습니다: ${e.message}`);
    }
  };

  const readFileAsStudents = (file) => {
    return new Promise((resolve, reject) => {
      const fileName = file.name.toLowerCase();
      const reader = new FileReader();

      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        reader.onload = (e) => {
          try {
            const students = parseExcel(e.target?.result);
            resolve(students);
          } catch (err) {
            reject(new Error(`[${file.name}] ${err.message}`));
          }
        };
        reader.onerror = () => {
          reject(new Error(`[${file.name}] 파일을 읽는 중 오류가 발생했습니다.`));
        };
        reader.readAsArrayBuffer(file);
      } else if (fileName.endsWith(".csv")) {
        reader.onload = (e) => {
          try {
            const students = parseCsv(e.target?.result);
            resolve(students);
          } catch (err) {
            reject(new Error(`[${file.name}] ${err.message}`));
          }
        };
        reader.onerror = () => {
          reject(new Error(`[${file.name}] 파일을 읽는 중 오류가 발생했습니다.`));
        };
        reader.readAsText(file, "UTF-8");
      } else {
        reject(new Error(`[${file.name}] 지원되지 않는 파일 형식입니다. .csv, .xlsx, .xls 파일만 업로드 가능합니다.`));
      }
    });
  };

  const handleUploadedFiles = async (files) => {
    if (!files || files.length === 0) return;
    resetOutput();
    uploadSuccessCard?.classList.add("hidden");
    loadingMessage?.classList.remove("hidden");
    if (loadingText) loadingText.textContent = "파일을 분석하고 서버에 안전하게 병합하는 중입니다...";

    try {
      const year = uploadSchoolYearInput?.value?.trim() || schoolYearInput?.value;
      const semester = uploadSemesterSelect?.value || semesterSelect?.value;
      const examType = uploadExamTypeSelect?.value || examTypeSelect?.value;
      const gradeOption = uploadTargetGradeSelect?.value || "all";

      if (!year) {
        throw new Error("업로드할 학년도를 입력해주세요.");
      }

      const promises = Array.from(files).map((file) => readFileAsStudents(file));
      const results = await Promise.all(promises);
      
      let combinedStudents = [];
      results.forEach((students) => {
        combinedStudents = combinedStudents.concat(students);
      });

      if (combinedStudents.length === 0) {
        throw new Error("업로드한 파일들에서 유효한 학생 데이터를 찾을 수 없습니다.");
      }

      // 학년 데이터 보정 (학번에서 학년 인식이 안 된 경우 선택된 특정 학년으로 보정)
      combinedStudents.forEach((student) => {
        if (isNaN(student.grade) || student.grade < 1 || student.grade > 3) {
          if (gradeOption !== "all") {
            student.grade = parseInt(gradeOption, 10);
          }
        }
      });

      // 특정 학년 선택 시 해당 학년 데이터 유무 검증
      if (gradeOption !== "all") {
        const matching = combinedStudents.filter(
          (s) => String(s.grade) === String(gradeOption),
        );
        if (matching.length === 0) {
          throw new Error(
            `업로드한 파일에서 [${gradeOption}학년] 학생 데이터를 찾을 수 없습니다.\n학번의 첫째 자리가 ${gradeOption}학년인지 확인해주세요. (예: ${gradeOption}0101)`,
          );
        }
      }

      // 기존 데이터 처리 방식 선택 (overwrite_grade / overwrite_all / merge)
      const saveModeRadio = document.querySelector('input[name="upload-save-mode"]:checked');
      const uploadMode = saveModeRadio ? saveModeRadio.value : "overwrite_grade";

      // 업로드 모드에 따른 저장 실행
      const result = await saveExamDataWithGrade(
        year,
        semester,
        examType,
        gradeOption,
        combinedStudents,
        uploadMode,
      );

      const gradeLabel = gradeOption === "all" ? "전학년" : `${gradeOption}학년`;
      let modeName = "선택 학년 교체";
      if (uploadMode === "overwrite_all") modeName = "전체 데이터 초기화 후 등록";
      if (uploadMode === "merge") modeName = "기존 데이터에 누적 추가";

      // 1. 업로드 완료 팝업 알림 모달 표시
      if (modalSuccessExamTitle) {
        modalSuccessExamTitle.textContent = `${year}학년도 ${semester}학기 ${examType}`;
      }
      if (modalSuccessGrade) {
        modalSuccessGrade.textContent = gradeLabel;
      }
      if (modalSuccessCurrentCount) {
        modalSuccessCurrentCount.textContent = `${result.currentGradeCount.toLocaleString()}명`;
      }
      if (modalSuccessRetainedCount) {
        modalSuccessRetainedCount.textContent = `${result.retainedOtherGradesCount.toLocaleString()}명`;
      }
      if (modalSuccessTotalCount) {
        modalSuccessTotalCount.textContent = `${result.totalCount.toLocaleString()}명`;
      }
      uploadCompleteModal?.classList.remove("hidden");

      // 2. 업로드 모달 내부 완료 알림 카드 표시
      if (statCurrentCount) {
        statCurrentCount.textContent = `${result.currentGradeCount.toLocaleString()}명`;
      }
      if (statRetainedCount) {
        statRetainedCount.textContent = `${result.retainedOtherGradesCount.toLocaleString()}명`;
      }
      if (statTotalCount) {
        statTotalCount.textContent = `${result.totalCount.toLocaleString()}명`;
      }
      if (uploadSuccessDetailText) {
        uploadSuccessDetailText.textContent = `[${year}학년도 ${semester}학기 ${examType} - ${gradeLabel} (${modeName})] 총 ${files.length}개 파일의 데이터가 안전하게 저장되었습니다.`;
      }
      uploadSuccessCard?.classList.remove("hidden");

      // 메인 화면과 업로드 조건이 같으면 최신 데이터로 즉시 갱신
      if (
        schoolYearInput.value === year &&
        semesterSelect.value === semester &&
        examTypeSelect.value === examType
      ) {
        if (gradeOption !== "all") {
          targetGradeSelect.value = gradeOption;
        }
        await fetchDataAndUpdateUI();
      }
    } catch (err) {
      showError(err.message);
    } finally {
      loadingMessage?.classList.add("hidden");
      if (csvUpload) csvUpload.value = "";
    }
  };

  csvUpload?.addEventListener("change", (event) => {
    const files = event.target.files;
    if (files && files.length > 0) handleUploadedFiles(files);
  });

  const csvDropzone = document.getElementById("csv-upload-dropzone");
  
  csvDropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    csvDropzone.classList.add("border-blue-500", "bg-blue-50/50");
  });

  csvDropzone?.addEventListener("dragleave", (e) => {
    e.preventDefault();
    csvDropzone.classList.remove("border-blue-500", "bg-blue-50/50");
  });

  csvDropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    csvDropzone.classList.remove("border-blue-500", "bg-blue-50/50");
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) handleUploadedFiles(files);
  });

  const updateUIFromData = () => {
    const targetGrade = targetGradeSelect?.value;
    const filteredStudents = allStudents.filter(
      (s) => String(s.grade) === targetGrade,
    );
    const dates = [...new Set(filteredStudents.map((s) => s.date))].sort();
    dateSelect.innerHTML = dates
      .map((date) => `<option value="${date}">${date}</option>`)
      .join("");
    if (dates.length > 0) dateSelect.value = dates[0];
    updatePeriodOptions();
  };

  const updatePeriodOptions = () => {
    const selectedDate = dateSelect.value;
    const targetGrade = targetGradeSelect?.value;
    if (!selectedDate) {
      periodSelect.innerHTML = '<option value="">날짜를 선택하세요</option>';
      periodSelect.disabled = true;
      return;
    }
    const relevantPeriods = [
      ...new Set(
        allStudents
          .filter(
            (s) => s.date === selectedDate && String(s.grade) === targetGrade,
          )
          .map((s) => s.period),
      ),
    ].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    periodSelect.innerHTML = relevantPeriods
      .map((p) => `<option value="${p}">${p}교시</option>`)
      .join("");
    periodSelect.disabled = false;
    if (relevantPeriods.length > 0) periodSelect.value = relevantPeriods[0];
    updateSubjectOptions();
  };

  const updateSubjectOptions = () => {
    const selectedDate = dateSelect.value;
    const selectedPeriod = periodSelect.value;
    const targetGrade = targetGradeSelect?.value;
    if (!selectedPeriod) {
      subjectSelect.innerHTML = "<option>교시를 선택하세요</option>";
      subjectSelect.disabled = true;
      return;
    }
    const relevantSubjects = [
      ...new Set(
        allStudents
          .filter(
            (s) =>
              s.date === selectedDate &&
              s.period === selectedPeriod &&
              String(s.grade) === targetGrade,
          )
          .map((s) => s.subject),
      ),
    ].sort();
    subjectSelect.innerHTML = relevantSubjects
      .map(
        (s) =>
          `<option value="${s}" class="p-1.5 hover:bg-blue-50 border-b border-slate-50 last:border-0 rounded">${s}</option>`,
      )
      .join("");
    subjectSelect.disabled = false;
  };

  const fetchDataAndUpdateUI = async () => {
    const year = schoolYearInput?.value;
    const semester = semesterSelect?.value;
    const examType = examTypeSelect?.value;
    const targetGrade = targetGradeSelect?.value;
    if (!year || !semester || !examType) return;

    const originalBtnHtml = fetchBtn ? fetchBtn.innerHTML : "";
    if (fetchBtn) {
      fetchBtn.disabled = true;
      fetchBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        시험 데이터 조회 중...
      `;
    }

    try {
      const data = await fetchExamData(year, semester, examType);
      if (data && data.length > 0) {
        allStudents = data;
        const targetStudents = allStudents.filter(
          (s) => String(s.grade) === String(targetGrade),
        );

        if (targetStudents.length === 0) {
          updateUIFromData();
          generationOptions?.classList.add("hidden");
          showError(
            `[${year}학년도 ${semester}학기 ${examType}]에 [${targetGrade}학년] 데이터가 없습니다. (타 학년 데이터만 등록되어 있음)\n관리자 메뉴에서 해당 학년 데이터를 업로드해주세요.`,
          );
        } else {
          updateUIFromData();
          hideError();
          generationOptions?.classList.remove("hidden");
          // 생성 옵션 영역으로 부드럽게 스크롤 이동
          setTimeout(() => {
            generationOptions?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 100);
        }
      } else {
        allStudents = [];
        updateUIFromData();
        generationOptions?.classList.add("hidden");
        showError(
          `선택하신 [${year}학년도 ${semester}학기 ${examType}]의 시험 데이터가 등록되어 있지 않습니다. 우측 상단 관리자(톱니바퀴) 아이콘을 눌러 시험 데이터를 업로드해주세요.`,
        );
      }
    } catch (e) {
      console.error(e);
      generationOptions?.classList.add("hidden");
      showError("데이터를 가져오는 중 오류가 발생했습니다: " + e.message);
    } finally {
      if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = originalBtnHtml;
      }
    }
  };

  dateSelect?.addEventListener("change", updatePeriodOptions);
  periodSelect?.addEventListener("change", updateSubjectOptions);

  [schoolYearInput, semesterSelect, examTypeSelect, targetGradeSelect].forEach(
    (el) => {
      el?.addEventListener("change", () => {
        resetOutput();
        generationOptions?.classList.add("hidden");
      });
    },
  );

  fetchBtn?.addEventListener("click", () => {
    resetOutput();
    fetchDataAndUpdateUI();
  });

  [dateSelect, periodSelect, subjectSelect].forEach((el) => {
    el?.addEventListener("change", resetOutput);
  });
  subjectSelect?.addEventListener("change", () => {
    const selectedOptions = Array.from(subjectSelect.selectedOptions);
    generateBtn.disabled = selectedOptions.length === 0;
  });

  const handleLogoFile = (file) => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        schoolLogo = reader.result;
        updateLogoControls();
        const headerLogo = document.querySelector("header img");
        if (headerLogo) headerLogo.src = schoolLogo;
        if (printableArea.innerHTML) generateContent();
        try {
          await saveLogoSetting(schoolLogo);
        } catch (e) {
          console.error("Failed to save logo", e);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  logoUpload?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleLogoFile(file);
    }
  });

  generateBtn?.addEventListener("click", () => {
    const selectedSubjects = Array.from(subjectSelect.selectedOptions).map(
      (opt) => opt.value,
    );
    if (selectedSubjects.length === 0) {
      showError("하나 이상의 과목을 선택해야 합니다.");
      return;
    }

    proceedWithGeneration();
  });

  const proceedWithGeneration = () => {
    hideError();
    generateContent();
    setTimeout(() => {
      document
        .getElementById("printable-area")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const updateLogoControls = () => {
    if (!logoControls) return;
    if (!schoolLogo) {
      logoControls.innerHTML = `
        <label for="logo-upload" class="w-full group block">
          <div class="flex flex-col items-center justify-center w-full h-40 border-2 border-slate-200 border-dashed rounded-2xl cursor-pointer bg-[#f8fafc] group-hover:bg-[#f1f5f9] group-hover:border-emerald-400 group-hover:shadow-inner transition-all duration-300 relative overflow-hidden">
            <div class="bg-white shadow-sm p-3 rounded-full mb-2 group-hover:scale-110 group-hover:text-emerald-600 group-hover:shadow-md transition-all duration-300 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p class="mb-1 text-md text-slate-600 font-semibold text-center">
              <span class="font-bold text-emerald-600">클릭하여 이미지 파일 업로드</span>
            </p>
            <p class="text-xs text-slate-400 text-center">또는 이 영역에 로고 이미지 드래그 (기본 원묵고 로고 대체)</p>
          </div>
        </label>
      `;
    } else {
      logoControls.innerHTML = `
        <div class="flex flex-col sm:flex-row items-center gap-6 p-6 border-2 border-emerald-100 rounded-2xl bg-emerald-50/20 shadow-sm w-full">
          <div class="relative group bg-white p-3 rounded-xl border border-slate-200 shadow-inner flex items-center justify-center min-w-[120px] h-24">
            <img src="${schoolLogo}" alt="School logo preview" class="max-h-20 w-auto object-contain" />
          </div>
          <div class="flex flex-col items-center sm:items-start gap-1">
            <div class="text-slate-800 font-bold text-md">학교 로고 업로드 완료</div>
            <div class="text-slate-500 text-xs">문서 헤더 영역에 업로드된 로고 이미지 표시 중</div>
          </div>
          <div class="flex gap-2 sm:ml-auto w-full sm:w-auto mt-4 sm:mt-0">
            <label for="logo-upload" class="flex-1 sm:flex-none text-center text-sm bg-white hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-5 rounded-lg cursor-pointer transition-colors border border-slate-200 shadow-sm">변경</label>
            <button id="remove-logo-btn" class="flex-1 sm:flex-none text-sm bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2.5 px-5 rounded-lg transition-colors border border-red-100 shadow-sm">삭제</button>
          </div>
        </div>
      `;
      document
        .getElementById("remove-logo-btn")
        .addEventListener("click", async () => {
          schoolLogo = null;
          updateLogoControls();
          const headerLogo = document.querySelector("header img");
          if (headerLogo) headerLogo.src = "./wonmook_logo.jpg";
          if (printableArea.innerHTML) generateContent();
          try {
            await saveLogoSetting(null);
          } catch (e) {}
        });
    }
  };

  logoControls?.addEventListener("dragover", (e) => {
    if (schoolLogo) return;
    e.preventDefault();
    const dropContainer = logoControls.querySelector(".border-dashed");
    if (dropContainer) {
      dropContainer.classList.add("border-emerald-500", "bg-emerald-50/50");
    }
  });

  logoControls?.addEventListener("dragleave", (e) => {
    e.preventDefault();
    const dropContainer = logoControls.querySelector(".border-dashed");
    if (dropContainer) {
      dropContainer.classList.remove("border-emerald-500", "bg-emerald-50/50");
    }
  });

  logoControls?.addEventListener("drop", (e) => {
    e.preventDefault();
    if (schoolLogo) return;
    const dropContainer = logoControls.querySelector(".border-dashed");
    if (dropContainer) {
      dropContainer.classList.remove("border-emerald-500", "bg-emerald-50/50");
    }
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleLogoFile(file);
    } else if (file) {
      alert("이미지 파일 형식만 지원합니다.");
    }
  });

  const generateContent = () => {
    const selectedDate = dateSelect.value;
    const selectedPeriod = periodSelect.value;
    const selectedSubjects = Array.from(subjectSelect.selectedOptions).map(
      (opt) => opt.value,
    );
    const schoolYear = schoolYearInput.value + "학년도";
    const semesterText =
      semesterSelect.options[semesterSelect.selectedIndex].text;
    const selectedExamType = examTypeSelect.value;
    const targetGrade = targetGradeSelect?.value;

    const outputData = selectedSubjects.map((subject) => {
      const filtered = allStudents
        .filter(
          (s) =>
            s.date === selectedDate &&
            s.period === selectedPeriod &&
            s.subject === subject &&
            String(s.grade) === targetGrade,
        )
        .sort((a, b) => a.class - b.class || a.number - b.number);
      const { room, proctor } = filtered[0] || { room: "N/A", proctor: "N/A" };
      return {
        grade: targetGrade || (filtered[0] ? String(filtered[0].grade) : "1"),
        students: filtered,
        examDate: selectedDate,
        period: selectedPeriod,
        subject,
        proctor,
        room,
        logo: schoolLogo || new URL("./wonmook_logo.jpg", window.location.href).href,
        schoolYear: schoolYear.replace("학년도", ""),
        semester: semesterText,
        examType: selectedExamType,
      };
    });
    printableArea.innerHTML = outputData
      .map((props) => generatePrintLayout(props))
      .join("");
    printControls?.classList.remove("hidden");
  };

  const generatePrintLayout = (props) => {
    const numStudents = props.students ? props.students.length : 0;
    const isSpecial31 = numStudents === 31;
    const numRows = isSpecial31 ? 7 : (numStudents > 0 ? Math.ceil(numStudents / 5) : 6);
    const rowClass = numRows <= 5 ? "seating-rows-5" : (numRows >= 7 ? "seating-rows-7" : "seating-rows-6");
    const gradeVal = String(props.grade || (props.students?.[0]?.grade ?? targetGradeSelect?.value ?? "1"));
    const gradeClass = gradeVal ? `grade-${gradeVal}` : "";

    return `
            <div class="subject-print-block ${gradeClass} print:shadow-none shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-xl overflow-hidden print:overflow-visible print:border-0 print:mb-0 mb-8 border border-slate-200 bg-white" data-grade="${gradeVal}">
                <div class="printable-unit attendance-sheet-wrapper ${gradeClass}" data-grade="${gradeVal}">
                    ${generateAttendanceSheet({ ...props, grade: gradeVal })}
                </div>
                <div class="printable-unit seating-chart-wrapper ${rowClass} ${gradeClass} border-t-[16px] border-slate-100 print:border-0" data-grade="${gradeVal}">
                    ${generateSeatingChart({ ...props, grade: gradeVal })}
                </div>
            </div>
        `;
  };

  const generateAttendanceSheet = ({
    students,
    examDate,
    period,
    subject,
    room,
    logo,
    schoolYear,
    semester,
    examType,
    grade,
  }) => {
    const studentRows = Array.from({ length: 30 })
      .map((_, index) => {
        const student = students[index];
        return `<tr><td class="border border-slate-800 p-2 print:py-1 print:px-1">${index + 1}</td><td class="border border-slate-800 p-2 print:py-1 print:px-1">${student?.grade ?? ""}</td><td class="border border-slate-800 p-2 print:py-1 print:px-1">${student?.class ?? ""}</td><td class="border border-slate-800 p-2 print:py-1 print:px-1">${student?.number ?? ""}</td><td class="border border-slate-800 p-2 highlight-cell bg-yellow-50 print:py-1 print:px-1 font-semibold">${student?.studentId ?? ""}</td><td class="border border-slate-800 p-2 highlight-cell bg-yellow-50 print:py-1 print:px-1 font-semibold">${student?.name ?? ""}</td><td class="border border-slate-800 p-2 print:py-1 print:px-1"></td><td class="border border-slate-800 p-2 print:py-1 print:px-1"></td></tr>`;
      })
      .join("");
    const resolvedLogo = logo ? (logo.startsWith("data:") ? logo : new URL(logo, window.location.href).href) : "";
    const logoImg = resolvedLogo
      ? `<img src="${resolvedLogo}" alt="학교 로고" class="print-logo-position object-contain pointer-events-none" />`
      : "";
    const gradeClass = grade ? `grade-${grade}` : "";
    return `<div id="attendance-sheet-area" class="bg-white p-8 border-0 font-sans printable-container relative print:p-4 ${gradeClass}" data-grade="${grade || ""}"><div class="relative flex items-center justify-center mb-4 print:mb-2 min-h-[4rem] print:min-h-[2.6rem]"><h1 class="text-center text-5xl font-extrabold print:text-3xl text-slate-800 tracking-tight">&lt;응시현황표&gt;</h1></div><div class="text-base mb-4 text-center print:text-xs print:mb-2 text-slate-600 font-medium">OMR 카드 회수시 &lt;응시현황표&gt; OMR카드 봉투에 동봉</div><div class="border-2 border-slate-800"><div class="grid grid-cols-10"><div class="col-span-10 text-center font-bold text-3xl p-3 exam-title-banner bg-blue-600 text-white border-b border-blue-600 print:text-xl print:py-1 print:px-1 tracking-wide">${schoolYear}학년도 ${semester} ${examType}</div><div class="col-span-2 text-center p-3 font-bold info-label-cell bg-slate-100 border-r border-slate-800 text-xl print:text-base print:py-1 print:px-1">고사일</div><div class="col-span-3 text-center p-3 border-r border-slate-800 text-2xl print:text-lg print:py-1 print:px-1 font-semibold">${examDate}</div><div class="col-span-2 text-center p-3 font-bold info-label-cell bg-slate-100 border-r border-slate-800 text-xl print:text-base print:py-1 print:px-1">교시</div><div class="col-span-3 text-center p-3 text-2xl print:text-lg print:py-1 print:px-1 font-semibold">${period}교시</div></div><div class="grid grid-cols-10 border-t border-slate-800"><div class="col-span-2 text-center p-3 font-bold info-label-cell bg-slate-100 border-r border-slate-800 text-xl print:text-base print:py-1 print:px-1">과목명</div><div class="col-span-8 text-center p-3 text-2xl print:text-lg print:py-1 print:px-1 font-bold text-blue-800">${subject}</div></div><div class="grid grid-cols-10 border-t border-slate-800"><div class="col-span-2 text-center p-3 font-bold info-label-cell bg-slate-100 border-r border-slate-800 text-xl print:text-base print:py-1 print:px-1">시험장소</div><div class="col-span-3 text-center p-3 border-r border-slate-800 text-2xl print:text-lg print:py-1 print:px-1 font-bold text-rose-700">${room}</div><div class="col-span-2 text-center p-3 font-bold info-label-cell bg-slate-100 border-r border-slate-800 text-xl print:text-base print:py-1 print:px-1">응시인원</div><div class="col-span-3 text-center p-3 text-2xl print:text-lg print:py-1 print:px-1 font-semibold">${students.length} 명</div></div></div><div class="text-base mt-2 print:text-[10px] print:mt-2 text-slate-600 font-medium">※ 출결 : 결석○, 지각ø (*위탁생 결번 처리)<br />※ 입실시간 : 지각생 입실시간 기록</div><div class="mt-4 print:mt-2"><table class="w-full border-collapse border-2 border-slate-800 text-center text-lg print:text-xs print:leading-tight"><thead class="bg-blue-600 font-bold text-white"><tr><th class="border border-white p-2 print:py-1 print:px-1">순번</th><th class="border border-white p-2 print:py-1 print:px-1">학년</th><th class="border border-white p-2 print:py-1 print:px-1">반</th><th class="border border-white p-2 print:py-1 print:px-1">번호</th><th class="border border-white p-2 print:py-1 print:px-1">학번</th><th class="border border-white p-2 print:py-1 print:px-1">이름</th><th class="border border-white p-2 print:py-1 print:px-1">출결</th><th class="border border-white p-2 print:py-1 print:px-1">입실시간</th></tr></thead><tbody>${studentRows}</tbody></table></div>${logoImg ? `<div class="flex justify-end items-center mt-3 print:mt-1 attendance-bottom-logo">${logoImg}</div>` : ""}</div>`;
  };

  const generateSeatingChart = ({
    students,
    subject,
    room,
    proctor,
    logo,
    grade,
    examDate,
    period,
  }) => {
    const numStudents = students.length;
    const numCols = 5;

    let numRows = numStudents > 0 ? Math.ceil(numStudents / numCols) : 0;
    const isSpecial31 = numStudents === 31;
    if (isSpecial31) numRows = 7;

    const totalSeats = numRows * numCols;
    const seats = Array.from({ length: totalSeats })
      .map((_, index) => {
        const rowIndex = Math.floor(index / numCols);
        const colIndex = index % numCols;

        let studentIndex;
        if (isSpecial31) {
          if (rowIndex < 6) {
            studentIndex = colIndex * 6 + rowIndex;
          } else {
            studentIndex = colIndex === 3 ? 30 : -1;
          }
        } else {
          studentIndex = colIndex * numRows + rowIndex;
        }

        const student =
          studentIndex >= 0 && studentIndex < numStudents
            ? students[studentIndex]
            : undefined;
        const seatNumber = studentIndex + 1;

        if (isSpecial31 && rowIndex === 6 && colIndex !== 3) {
          return `<div class="relative p-2 h-40 print:h-32"></div>`;
        }

        return `<div class="relative border-2 border-slate-200 rounded-xl p-2 h-40 flex flex-col justify-center items-center bg-slate-50 shadow-sm seat-card-box print:h-32 print:p-1.5 print:shadow-none print:rounded-lg"><div class="absolute top-1.5 left-2.5 font-bold text-slate-400 text-lg print:text-sm">${seatNumber}</div>${student ? `<div class="text-center w-full"><div class="text-xl text-blue-600 font-semibold mb-1 print:text-base">${student.studentId}</div><div class="font-extrabold text-2xl text-slate-800 tracking-wide print:text-lg bg-white rounded-md py-1 px-1.5 mx-1 shadow-sm border border-slate-100 seat-student-pill print:shadow-none print:py-0.5">${student.name}</div></div>` : `<div aria-hidden="true">&nbsp;</div>`}</div>`;
      })
      .join("");
    const resolvedLogo = logo ? (logo.startsWith("data:") ? logo : new URL(logo, window.location.href).href) : "";
    const logoImg = resolvedLogo
      ? `<img src="${resolvedLogo}" alt="학교 로고" class="print-logo-position object-contain pointer-events-none" />`
      : "";
    const gradeClass = grade ? `grade-${grade}` : "";

    const dateText = examDate || "";
    const periodText = period
      ? String(period).endsWith("교시")
        ? period
        : `${period}교시`
      : "";

    const datePeriodHtml = (dateText || periodText)
      ? `<div class="border-2 border-slate-600 bg-slate-50/90 rounded-lg py-2.5 px-3.5 print:py-1.5 print:px-2.5 shadow-sm date-period-badge whitespace-nowrap flex items-center justify-center gap-2.5 leading-none">
          ${dateText ? `<span class="text-2xl print:text-xl font-bold text-slate-700 tracking-tight leading-none">${dateText}</span>` : ""}
          ${periodText ? `<span class="text-2xl print:text-xl font-bold text-blue-700 tracking-tight leading-none">${periodText}</span>` : ""}
        </div>`
      : "";

    return `<div id="seating-chart-area" class="bg-white p-8 border-0 font-sans printable-container relative print:p-4 ${gradeClass}" data-grade="${grade || ""}"><div class="mb-8 print:mb-4"><div class="flex justify-between items-center relative min-h-[4rem] print:min-h-[2.6rem]"><div class="border-2 border-rose-500 rounded-lg py-2.5 px-3.5 text-rose-600 font-extrabold text-2xl print:text-xl print:py-1.5 print:px-2.5 shadow-sm bg-rose-50 subject-badge-box flex items-center justify-center leading-none">${subject}</div><div class="text-center flex-grow"><h1 class="text-5xl font-extrabold mb-0 print:text-4xl text-slate-800 tracking-tight">&lt;자리배치표&gt;</h1></div><div class="flex-shrink-0 flex justify-end items-center">${datePeriodHtml}</div></div><div class="text-2xl text-center space-y-1.5 mt-4 pt-4 border-t border-slate-200 print:border-t-0 print:text-xl print:mt-1 print:pt-1 font-medium text-slate-700"><div class="inline-block mr-6"><span class="text-slate-400 mr-2">과목명</span><span class="font-bold">${subject}</span></div><div class="inline-block mr-6"><span class="text-slate-400 mr-2">고사실</span><span class="font-bold text-rose-600">${room}</span></div><div class="inline-block"><span class="text-slate-400 mr-2">지도교사</span><span class="font-bold">${proctor}</span></div></div></div><div class="flex justify-center my-8 print:my-4"><div class="border-2 border-blue-600 bg-blue-600 text-white rounded-lg p-3 w-56 text-center font-bold text-2xl print:text-xl print:py-2 print:px-4 shadow-md tracking-widest teacher-desk-box">교 탁</div></div><div class="grid grid-cols-5 gap-4 print:gap-2">${seats}</div>${logoImg ? `<div class="flex justify-end items-center mt-4 print:mt-1 seating-bottom-logo">${logoImg}</div>` : ""}</div>`;
  };

  const printInNewWindow = (type) => {
    const isB4 = type === "b4_landscape";
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert(
        "팝업 차단이 설정되어 있어 새 인쇄창을 열 수 없습니다. 브라우저 주소창 오른쪽에 있는 [팝업 차단 항상 허용]을 설정해 주세요.",
      );
      return;
    }

    const printContent = printableArea.innerHTML;
    if (!printContent) {
      alert("출력할 콘텐츠가 존재하지 않습니다. 먼저 문서를 생성해 주세요.");
      printWindow.close();
      return;
    }

    const baseUrl = window.location.origin + window.location.pathname;
    const pageTitle = isB4
      ? "B4 가로 통합 인쇄 (좌:응시현황표 / 우:자리배치표)"
      : (type === "attendance" ? "응시현황표 인쇄" : "자리배치표 인쇄");

    // 부모 문서에서 컴파일된 모든 CSS 규칙(Tailwind 유틸리티 및 커스텀 스타일)을 즉시 추출하여 주입
    // (별도의 3MB CDN 스크립트 재다운로드 및 JIT 재파싱을 완전히 제거하여 인쇄 미리보기가 즉각 열리도록 획기적 속도 개선)
    let parentStyles = "";
    try {
      for (const sheet of document.styleSheets) {
        try {
          if (sheet.cssRules) {
            for (const rule of sheet.cssRules) {
              parentStyles += rule.cssText + "\n";
            }
          }
        } catch (_) {
          if (sheet.href) {
            parentStyles += `@import url("${sheet.href}");\n`;
          }
        }
      }
    } catch (_) {}
    if (!parentStyles) {
      parentStyles = Array.from(document.querySelectorAll("style"))
        .map((s) => s.textContent)
        .join("\n");
    }

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="${baseUrl}" />
    <title>${pageTitle}</title>
    <style>
      /* 부모 창에서 이미 빌드된 Tailwind 및 공통 스타일 (0ms 즉시 적용) */
      ${parentStyles}
    </style>
    <style>
      /* 전체 페이지 및 폰트 설정 */
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      html, body {
        font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Malgun Gothic', '맑은 고딕', sans-serif !important;
        background-color: #ffffff !important;
        color: #1e293b;
        margin: 0;
        padding: 0;
      }
      ${isB4 ? `
      @page {
        size: B4 landscape;
        margin: 13mm 8mm 8mm 8mm; /* 상단 여백 13mm로 넉넉하게 확보하여 답답함 해소 */
      }
      ` : `
      @page {
        size: A4 portrait;
        margin: 8mm 10mm;
      }
      `}

      /* ── 인쇄 배경 및 그래픽 강제 보존 스타일 (화면과 100% 동일한 색상/형태 보장) ── */
      
      /* 1. 상단 시험 타이틀 파란색 배너 */
      .exam-title-banner,
      .bg-blue-600,
      [class*="bg-blue-600"] {
        background-color: #2563eb !important;
        color: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* 2. 흰색 텍스트 유지 */
      .text-white,
      [class*="text-white"] {
        color: #ffffff !important;
      }

      /* 3. 기본 안내 헤더 셀 (고사일, 교시, 과목명, 시험장소, 응시인원) */
      .info-label-cell,
      .bg-slate-100,
      [class*="bg-slate-100"] {
        background-color: #f1f5f9 !important;
        color: #334155 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* 4. 응시현황표 학생 명단 테이블 헤더 */
      thead.bg-blue-600,
      table thead,
      thead tr,
      thead th {
        background-color: #2563eb !important;
        color: #ffffff !important;
        border-color: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* 5. 응시현황표 학번 및 이름 열 노란색 강조 배경 */
      .highlight-cell,
      .bg-yellow-50,
      [class*="bg-yellow-50"] {
        background-color: #fef9c3 !important;
        color: #0f172a !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* 6. 주요 텍스트 색상 (시험장소-빨강, 과목명-파랑 등) */
      .text-rose-700, [class*="text-rose-700"] { color: #be123c !important; }
      .text-rose-600, [class*="text-rose-600"] { color: #e11d48 !important; }
      .text-blue-800, [class*="text-blue-800"] { color: #1e40af !important; }
      .text-blue-600, [class*="text-blue-600"] { color: #2563eb !important; }
      .text-slate-800, [class*="text-slate-800"] { color: #1e293b !important; }
      .text-slate-600, [class*="text-slate-600"] { color: #475569 !important; }
      .text-slate-400, [class*="text-slate-400"] { color: #94a3b8 !important; }

      /* 7. 자리배치표 교탁 */
      .teacher-desk-box,
      div.teacher-desk,
      [class*="bg-blue-600"][class*="text-white"] {
        background-color: #2563eb !important;
        color: #ffffff !important;
        border: 2px solid #2563eb !important;
        border-radius: 0.5rem !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* 8. 자리배치표 상단 좌측 과목 뱃지 */
      .subject-badge-box,
      .bg-rose-50,
      [class*="bg-rose-50"] {
        background-color: #fff1f2 !important;
        color: #e11d48 !important;
        border: 2px solid #f43f5e !important;
        border-radius: 0.5rem !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* 9. 자리배치표 좌석 카드 */
      .seat-card-box,
      .bg-slate-50,
      [class*="bg-slate-50"] {
        background-color: #f8fafc !important;
        border: 2px solid #cbd5e1 !important;
        border-radius: 0.75rem !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* 10. 자리배치표 좌석 내 학생 성명 카드 */
      .seat-student-pill,
      [class*="bg-white"][class*="rounded-md"] {
        background-color: #ffffff !important;
        color: #1e293b !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 0.375rem !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* 11. 학교 로고 위치 및 크기 */
      .print-logo-position {
        max-height: 2.34rem !important;
        max-width: 7.2rem !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
        display: block !important;
      }
      .seating-bottom-logo,
      .attendance-bottom-logo {
        display: flex;
        justify-content: flex-end;
        align-items: center;
      }
      .seating-bottom-logo .print-logo-position {
        max-height: 3.36rem !important;
        max-width: 10.2rem !important;
      }
      .attendance-bottom-logo .print-logo-position {
        max-height: 3.8rem !important;
        max-width: 9.5rem !important;
      }

      ${isB4 ? `
      /* 화면 미리보기에서의 B4 가로 2단 배치 */
      .b4-landscape-mode #print-root {
        max-width: 100% !important;
        width: 100% !important;
      }
      .b4-landscape-mode .subject-print-block {
        display: flex !important;
        flex-direction: row !important;
        justify-content: space-between !important;
        align-items: stretch !important;
        gap: 6mm !important;
        width: 100% !important;
        box-sizing: border-box !important;
        margin-bottom: 2rem !important;
        padding: 1rem !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 0.75rem !important;
        background-color: #ffffff !important;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
      }
      .b4-landscape-mode .attendance-sheet-wrapper {
        width: calc(50% - 3mm) !important;
        max-width: calc(50% - 3mm) !important;
        padding: 0 3.5mm 0 0 !important;
        border-right: 1.5px dashed #94a3b8 !important;
        border-top: none !important;
        box-sizing: border-box !important;
      }
      .b4-landscape-mode .seating-chart-wrapper {
        width: calc(50% - 3mm) !important;
        max-width: calc(50% - 3mm) !important;
        padding: 0 0 0 3.5mm !important;
        border-top: none !important;
        box-sizing: border-box !important;
      }
      ` : ""}

      /* 페이지 나누기 제어 */
      @media print {
        html, body {
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          background-color: #ffffff !important;
        }
        .printable-unit {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        ${!isB4 ? `
        /* A4 세로 인쇄 규격 */
        .attendance-sheet-wrapper {
          box-sizing: border-box !important;
          padding-top: 1.15cm !important;
        }
        .seating-chart-wrapper {
          page-break-before: always !important;
          box-sizing: border-box !important;
          padding-top: 2.3cm !important;
        }
        .seating-chart-wrapper.seating-rows-5 {
          padding-top: 3.5cm !important;
        }
        .seating-chart-wrapper.seating-rows-6 {
          padding-top: 2.3cm !important;
        }
        .seating-chart-wrapper.seating-rows-7 {
          padding-top: 0.75cm !important;
        }
        .subject-print-block:not(:last-child) {
          page-break-after: always !important;
          break-after: page !important;
        }
        .subject-print-block,
        .attendance-sheet-wrapper,
        .seating-chart-wrapper {
          border: none !important;
        }

        .printable-container,
        #attendance-sheet-area,
        #seating-chart-area {
          border: none !important;
          outline: none !important;
        }
        #attendance-sheet-area {
          font-size: 9.1pt !important;
          box-sizing: border-box !important;
          padding: 0.78rem 0.85rem !important;
        }
        #attendance-sheet-area h1 {
          font-size: 20.8pt !important;
        }
        #attendance-sheet-area table {
          font-size: 8.45pt !important;
          line-height: 1.175 !important;
        }
        #attendance-sheet-area table th,
        #attendance-sheet-area table td {
          padding: 0.158rem 0.23rem !important;
        }

        #seating-chart-area {
          font-size: 9pt !important;
          box-sizing: border-box !important;
          padding: 0.9rem 0.95rem !important;
        }
        #seating-chart-area .h-40 {
          height: 6.42rem !important;
        } 
        .seating-rows-7 #seating-chart-area .h-40,
        .seating-rows-7.seating-chart-wrapper .h-40 {
          height: 6.1rem !important;
        }
        #seating-chart-area .my-8 {
          margin-top: 0.88rem !important;
          margin-bottom: 0.88rem !important;
        }
        .printable-container .text-5xl { font-size: 21pt !important; }
        .printable-container .text-3xl { font-size: 14.5pt !important; }
        .printable-container .text-2xl { font-size: 12.5pt !important; }
        .printable-container .text-xl { font-size: 11.5pt !important; }
        .printable-container .p-3 { padding: 0.35rem !important; }
        .printable-container .p-2 { padding: 0.2rem 0.25rem !important; }

        .date-period-badge {
          border-width: 1.5px !important;
          border-color: #475569 !important;
          background-color: #f8fafc !important;
        }
        .attendance-bottom-logo {
          display: flex !important;
          justify-content: flex-end !important;
          align-items: center !important;
          margin-top: 0.32rem !important;
          margin-bottom: 0 !important;
          page-break-before: avoid !important;
          break-before: avoid !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .attendance-bottom-logo .print-logo-position {
          max-height: 2.05rem !important;
          max-width: 6.8rem !important;
          display: block !important;
        }
        .seating-bottom-logo {
          display: flex !important;
          justify-content: flex-end !important;
          align-items: center !important;
          margin-top: 0.35rem !important;
          margin-bottom: 0 !important;
          page-break-before: avoid !important;
          break-before: avoid !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .seating-bottom-logo .print-logo-position {
          max-height: 2.1rem !important;
          max-width: 7.2rem !important;
          display: block !important;
        }
        .seating-rows-7 .seating-bottom-logo {
          margin-top: 0.14rem !important;
        }
        .seating-rows-7 .seating-bottom-logo .print-logo-position {
          max-height: 1.75rem !important;
        }
        ` : `
        /* B4 가로 좌우 배치 스타일 (좌: 응시현황표, 우: 자리배치표) */
        .b4-landscape-mode body,
        .b4-landscape-mode html {
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        .b4-landscape-mode #print-root {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        /* [중요] 높이를 calc 고정이 아닌 auto로 지정하여 서브픽셀 단위 넘침으로 인한 빈 페이지 발생 원천 차단 */
        .b4-landscape-mode .subject-print-block {
          display: flex !important;
          flex-direction: row !important;
          justify-content: space-between !important;
          align-items: stretch !important;
          gap: 6mm !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          box-sizing: border-box !important;
          page-break-after: always !important;
          break-after: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          overflow: visible !important;
        }
        .b4-landscape-mode .subject-print-block:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        .b4-landscape-mode .attendance-sheet-wrapper {
          display: flex !important;
          flex-direction: column !important;
          justify-content: flex-start !important;
          width: calc(50% - 3mm) !important;
          max-width: calc(50% - 3mm) !important;
          padding: 0 3.5mm 0 0 !important;
          border-right: 1.5px dashed #94a3b8 !important;
          border-top: none !important;
          border-left: none !important;
          border-bottom: none !important;
          box-sizing: border-box !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-before: avoid !important;
          break-before: avoid !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
          height: auto !important;
          min-height: 0 !important;
        }
        .b4-landscape-mode .seating-chart-wrapper {
          display: flex !important;
          flex-direction: column !important;
          justify-content: flex-start !important;
          width: calc(50% - 3mm) !important;
          max-width: calc(50% - 3mm) !important;
          padding: 0 0 0 3.5mm !important;
          border: none !important;
          border-top: none !important;
          box-sizing: border-box !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-before: avoid !important;
          break-before: avoid !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
          height: auto !important;
          min-height: 0 !important;
        }

        .b4-landscape-mode #attendance-sheet-area,
        .b4-landscape-mode #seating-chart-area {
          padding: 0 !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          border: none !important;
          width: 100% !important;
        }

        /* B4 좌측: 응시현황표 세부 글자/셀 크기 */
        .b4-landscape-mode #attendance-sheet-area h1 {
          font-size: 18pt !important;
          margin-bottom: 0.15rem !important;
        }
        .b4-landscape-mode #attendance-sheet-area .min-h-\[4rem\],
        .b4-landscape-mode #attendance-sheet-area .print\:min-h-\[2\.6rem\] {
          min-height: 1.7rem !important;
        }
        .b4-landscape-mode #attendance-sheet-area .text-slate-600 {
          font-size: 7.5pt !important;
          margin-bottom: 0.15rem !important;
          margin-top: 0.1rem !important;
          line-height: 1.2 !important;
        }
        .b4-landscape-mode #attendance-sheet-area .exam-title-banner {
          font-size: 13pt !important;
          padding: 0.2rem 0.3rem !important;
        }
        .b4-landscape-mode #attendance-sheet-area .info-label-cell {
          font-size: 9pt !important;
          padding: 0.18rem 0.22rem !important;
        }
        .b4-landscape-mode #attendance-sheet-area .grid div {
          font-size: 9pt !important;
          padding: 0.18rem 0.22rem !important;
        }
        .b4-landscape-mode #attendance-sheet-area table {
          font-size: 7.8pt !important;
          line-height: 1.15 !important;
        }
        .b4-landscape-mode #attendance-sheet-area table th,
        .b4-landscape-mode #attendance-sheet-area table td {
          padding: 0.12rem 0.15rem !important;
        }
        .b4-landscape-mode #attendance-sheet-area .attendance-bottom-logo {
          margin-top: 0.2rem !important;
          margin-bottom: 0 !important;
        }
        .b4-landscape-mode #attendance-sheet-area .attendance-bottom-logo .print-logo-position {
          max-height: 1.75rem !important;
          max-width: 5.6rem !important;
        }

        /* B4 우측: 자리배치표 세부 글자/셀 크기 */
        .b4-landscape-mode #seating-chart-area h1 {
          font-size: 18pt !important;
          margin-bottom: 0 !important;
        }
        .b4-landscape-mode #seating-chart-area .min-h-\[4rem\],
        .b4-landscape-mode #seating-chart-area .print\:min-h-\[2\.6rem\] {
          min-height: 1.7rem !important;
        }
        .b4-landscape-mode #seating-chart-area .subject-badge-box {
          font-size: 10.5pt !important;
          padding: 0.2rem 0.45rem !important;
        }
        .b4-landscape-mode #seating-chart-area .date-period-badge {
          padding: 0.2rem 0.45rem !important;
        }
        .b4-landscape-mode #seating-chart-area .date-period-badge span {
          font-size: 10.5pt !important;
        }
        .b4-landscape-mode #seating-chart-area .space-y-1\.5 {
          margin-top: 0.2rem !important;
          padding-top: 0.2rem !important;
          font-size: 9pt !important;
        }
        .b4-landscape-mode #seating-chart-area .teacher-desk-box {
          font-size: 11pt !important;
          padding: 0.2rem 1.2rem !important;
          width: 8rem !important;
        }
        .b4-landscape-mode #seating-chart-area .my-8 {
          margin-top: 0.4rem !important;
          margin-bottom: 0.4rem !important;
        }
        .b4-landscape-mode #seating-chart-area .mb-8 {
          margin-bottom: 0.3rem !important;
        }
        .b4-landscape-mode #seating-chart-area .grid-cols-5 {
          gap: 0.3rem !important;
        }
        .b4-landscape-mode #seating-chart-area .h-40 {
          height: 4.85rem !important;
        }
        .b4-landscape-mode .seating-rows-7 #seating-chart-area .h-40 {
          height: 4.25rem !important;
        }
        .b4-landscape-mode #seating-chart-area .seat-card-box {
          padding: 0.2rem !important;
          border-radius: 0.375rem !important;
        }
        .b4-landscape-mode #seating-chart-area .seat-card-box .text-lg {
          font-size: 8pt !important;
          top: 0.15rem !important;
          left: 0.25rem !important;
        }
        .b4-landscape-mode #seating-chart-area .seat-card-box .text-xl {
          font-size: 8pt !important;
          margin-bottom: 0.1rem !important;
        }
        .b4-landscape-mode #seating-chart-area .seat-card-box .seat-student-pill {
          font-size: 9pt !important;
          padding: 0.1rem 0.25rem !important;
          line-height: 1.15 !important;
        }
        .b4-landscape-mode #seating-chart-area .seating-bottom-logo {
          margin-top: 0.2rem !important;
          margin-bottom: 0 !important;
        }
        .b4-landscape-mode #seating-chart-area .seating-bottom-logo .print-logo-position {
          max-height: 1.75rem !important;
          max-width: 5.6rem !important;
        }
        `}
      }

      ${type === "attendance" ? ".seating-chart-wrapper { display: none !important; }" : ""}
      ${type === "seating" ? ".attendance-sheet-wrapper { display: none !important; }" : ""}
      ${type === "seating" ? ".seating-chart-wrapper { page-break-before: avoid !important; break-before: avoid !important; }" : ""}
    </style>
</head>
<body class="bg-white p-4 print:p-0 ${isB4 ? 'b4-landscape-mode' : ''}">
    <div id="print-root" class="${isB4 ? 'w-full max-w-[1400px]' : 'max-w-[800px]'} mx-auto">
        ${printContent}
    </div>
    <script>
        (function() {
            let triggered = false;
            function runPrint() {
                if (triggered) return;
                triggered = true;
                window.focus();
                window.print();
            }
            if (document.readyState === 'complete') {
                setTimeout(runPrint, 60);
            } else {
                window.addEventListener('load', () => setTimeout(runPrint, 60));
            }
            window.addEventListener('afterprint', () => {
                window.close();
            });
        })();
    <\/script>
</body>
</html>`);
    printWindow.document.close();
  };

  printAttendanceBtn?.addEventListener("click", () => {
    printInNewWindow("attendance");
  });
  printSeatingChartBtn?.addEventListener("click", () => {
    printInNewWindow("seating");
  });
  printB4Btn?.addEventListener("click", () => {
    printInNewWindow("b4_landscape");
  });

  // =========================================================================
  // 관리자 모달 탭 전환 및 데이터 관리(조회·추가·수정·삭제) 로직
  // =========================================================================
  const tabBtnUpload = document.getElementById("tab-btn-upload");
  const tabBtnManage = document.getElementById("tab-btn-manage");
  const tabBtnSettings = document.getElementById("tab-btn-settings");
  const tabPanelUpload = document.getElementById("tab-panel-upload");
  const tabPanelManage = document.getElementById("tab-panel-manage");
  const tabPanelSettings = document.getElementById("tab-panel-settings");

  const switchAdminTab = (tabName) => {
    [tabBtnUpload, tabBtnManage, tabBtnSettings].forEach((btn) => {
      btn?.classList.remove("text-blue-600", "border-blue-600");
      btn?.classList.add("text-slate-500", "border-transparent");
    });
    [tabPanelUpload, tabPanelManage, tabPanelSettings].forEach((panel) => {
      panel?.classList.add("hidden");
    });

    if (tabName === "upload") {
      tabBtnUpload?.classList.add("text-blue-600", "border-blue-600");
      tabBtnUpload?.classList.remove("text-slate-500", "border-transparent");
      tabPanelUpload?.classList.remove("hidden");
    } else if (tabName === "manage") {
      tabBtnManage?.classList.add("text-blue-600", "border-blue-600");
      tabBtnManage?.classList.remove("text-slate-500", "border-transparent");
      tabPanelManage?.classList.remove("hidden");
      syncAdminModalInputs();
      if (managedStudents.length === 0) {
        loadManageData();
      }
    } else if (tabName === "settings") {
      tabBtnSettings?.classList.add("text-blue-600", "border-blue-600");
      tabBtnSettings?.classList.remove("text-slate-500", "border-transparent");
      tabPanelSettings?.classList.remove("hidden");
    }
  };

  tabBtnUpload?.addEventListener("click", () => switchAdminTab("upload"));
  tabBtnManage?.addEventListener("click", () => switchAdminTab("manage"));
  tabBtnSettings?.addEventListener("click", () => switchAdminTab("settings"));

  // 데이터 관리 탭 관련 상태 및 요소
  let managedStudents = [];
  let deleteConfirmAction = null;

  const btnLoadManageData = document.getElementById("btn-load-manage-data");
  const manageDataToolbar = document.getElementById("manage-data-toolbar");
  const manageTableContainer = document.getElementById("manage-table-container");
  const manageEmptyPlaceholder = document.getElementById("manage-empty-placeholder");
  const manageStudentTableBody = document.getElementById("manage-student-table-body");
  const manageShowingCount = document.getElementById("manage-showing-count");
  const manageStatTotal = document.getElementById("manage-stat-total");
  const manageStatGrade1 = document.getElementById("manage-stat-grade1");
  const manageStatGrade2 = document.getElementById("manage-stat-grade2");
  const manageStatGrade3 = document.getElementById("manage-stat-grade3");
  const manageTableGradeFilter = document.getElementById("manage-table-grade-filter");
  const manageSearchInput = document.getElementById("manage-search-input");
  const btnOpenAddStudentModal = document.getElementById("btn-open-add-student-modal");
  const manageDeleteTargetGrade = document.getElementById("manage-delete-target-grade");
  const btnDeleteGradeData = document.getElementById("btn-delete-grade-data");
  const btnDeleteEntireExam = document.getElementById("btn-delete-entire-exam");

  // 학생 추가/수정 모달 요소
  const studentEditModal = document.getElementById("student-edit-modal");
  const studentEditModalTitle = document.getElementById("student-edit-modal-title");
  const closeStudentEditModalBtn = document.getElementById("close-student-edit-modal-btn");
  const cancelStudentEditBtn = document.getElementById("cancel-student-edit-btn");
  const studentEditForm = document.getElementById("student-edit-form");
  const editStudentIndex = document.getElementById("edit-student-index");
  const editStudentId = document.getElementById("edit-student-id");
  const editStudentName = document.getElementById("edit-student-name");
  const editStudentGrade = document.getElementById("edit-student-grade");
  const editStudentClass = document.getElementById("edit-student-class");
  const editStudentNumber = document.getElementById("edit-student-number");
  const editStudentDate = document.getElementById("edit-student-date");
  const editStudentPeriod = document.getElementById("edit-student-period");
  const editStudentSubject = document.getElementById("edit-student-subject");
  const editStudentRoom = document.getElementById("edit-student-room");
  const editStudentProctor = document.getElementById("edit-student-proctor");
  const saveStudentEditBtn = document.getElementById("save-student-edit-btn");

  // 삭제 확인 모달 요소
  const deleteConfirmModal = document.getElementById("delete-confirm-modal");
  const deleteConfirmTitle = document.getElementById("delete-confirm-title");
  const deleteConfirmDescription = document.getElementById("delete-confirm-description");
  const proceedDeleteConfirmBtn = document.getElementById("proceed-delete-confirm-btn");
  const cancelDeleteConfirmBtn = document.getElementById("cancel-delete-confirm-btn");

  const openDeleteConfirm = (title, description, onConfirm) => {
    if (deleteConfirmTitle) deleteConfirmTitle.textContent = title;
    if (deleteConfirmDescription) deleteConfirmDescription.textContent = description;
    deleteConfirmAction = onConfirm;
    deleteConfirmModal?.classList.remove("hidden");
  };

  const closeDeleteConfirm = () => {
    deleteConfirmModal?.classList.add("hidden");
    deleteConfirmAction = null;
  };

  cancelDeleteConfirmBtn?.addEventListener("click", closeDeleteConfirm);
  deleteConfirmModal?.addEventListener("click", (e) => {
    if (e.target === deleteConfirmModal) closeDeleteConfirm();
  });

  proceedDeleteConfirmBtn?.addEventListener("click", async () => {
    if (!deleteConfirmAction) return;
    try {
      proceedDeleteConfirmBtn.disabled = true;
      proceedDeleteConfirmBtn.textContent = "삭제 처리 중...";
      await deleteConfirmAction();
      closeDeleteConfirm();
    } catch (err) {
      alert("삭제 작업 중 오류가 발생했습니다: " + err.message);
    } finally {
      proceedDeleteConfirmBtn.disabled = false;
      proceedDeleteConfirmBtn.textContent = "삭제 확정";
    }
  });

  const syncWithMainIfMatching = async (year, semester, examType) => {
    if (
      schoolYearInput?.value === year &&
      semesterSelect?.value === semester &&
      examTypeSelect?.value === examType
    ) {
      if (allStudents.length > 0) {
        await fetchDataAndUpdateUI();
      }
    }
  };

  const renderManageTable = () => {
    if (!manageStudentTableBody) return;
    const gradeFilter = manageTableGradeFilter?.value || "all";
    const searchTerm = (manageSearchInput?.value || "").trim().toLowerCase();

    const filtered = managedStudents.filter((student) => {
      if (gradeFilter !== "all" && String(student.grade) !== String(gradeFilter)) {
        return false;
      }
      if (searchTerm) {
        const targetStr = `${student.studentId} ${student.name} ${student.subject} ${student.room || ""} ${student.proctor || ""} ${student.date}`.toLowerCase();
        if (!targetStr.includes(searchTerm)) return false;
      }
      return true;
    });

    if (manageShowingCount) {
      manageShowingCount.textContent = filtered.length.toLocaleString();
    }

    if (filtered.length === 0) {
      manageStudentTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-10 text-slate-400 font-medium">
            조건에 일치하는 학생 데이터가 없습니다.
          </td>
        </tr>
      `;
      return;
    }

    manageStudentTableBody.innerHTML = filtered
      .map((student) => {
        const origIndex = managedStudents.indexOf(student);
        return `
          <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="px-3 py-2.5 font-bold text-blue-600 font-mono">${student.studentId || "-"}</td>
            <td class="px-3 py-2.5 font-semibold text-slate-700">${student.grade}학년 ${student.class}반 ${student.number}번</td>
            <td class="px-3 py-2.5 font-extrabold text-slate-800">${student.name || "-"}</td>
            <td class="px-3 py-2.5 text-slate-600">${student.date || "-"}</td>
            <td class="px-3 py-2.5 text-slate-600"><span class="bg-slate-100 px-1.5 py-0.5 rounded font-medium">${student.period}교시</span></td>
            <td class="px-3 py-2.5 text-slate-800 font-medium">
              ${student.subject || "-"}
              ${student.room ? `<span class="ml-1 text-[11px] text-slate-400">(${student.room})</span>` : ""}
            </td>
            <td class="px-3 py-2.5 text-center">
              <div class="inline-flex items-center space-x-1.5">
                <button
                  type="button"
                  data-action="edit"
                  data-index="${origIndex}"
                  class="px-2 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                >
                  수정
                </button>
                <button
                  type="button"
                  data-action="delete"
                  data-index="${origIndex}"
                  class="px-2 py-1 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                >
                  삭제
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  };

  manageStudentTableBody?.addEventListener("click", (e) => {
    const target = e.target.closest("button");
    if (!target) return;
    const action = target.dataset.action;
    const idx = parseInt(target.dataset.index, 10);
    if (isNaN(idx) || idx < 0 || idx >= managedStudents.length) return;

    const student = managedStudents[idx];
    const year = manageSchoolYearInput?.value?.trim();
    const semester = manageSemesterSelect?.value;
    const examType = manageExamTypeSelect?.value;

    if (action === "edit") {
      openStudentEditModal(idx, student);
    } else if (action === "delete") {
      openDeleteConfirm(
        "학생 데이터 삭제 확인",
        `[${student.studentId} ${student.name} - ${student.subject}] 학생의 응시 기록을 삭제하시겠습니까?`,
        async () => {
          await deleteStudentRecord(year, semester, examType, idx);
          await loadManageData();
          await syncWithMainIfMatching(year, semester, examType);
        }
      );
    }
  });

  const loadManageData = async () => {
    const year = manageSchoolYearInput?.value?.trim();
    const semester = manageSemesterSelect?.value;
    const examType = manageExamTypeSelect?.value;

    if (!year || !semester || !examType) {
      alert("조회할 학년도, 학기, 고사구분을 선택해주세요.");
      return;
    }

    const origBtnHtml = btnLoadManageData ? btnLoadManageData.innerHTML : "";
    if (btnLoadManageData) {
      btnLoadManageData.disabled = true;
      btnLoadManageData.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> 조회 중...
      `;
    }

    try {
      const data = await fetchExamData(year, semester, examType);
      managedStudents = data || [];

      if (managedStudents.length === 0) {
        manageDataToolbar?.classList.add("hidden");
        manageTableContainer?.classList.add("hidden");
        manageEmptyPlaceholder?.classList.remove("hidden");
        if (manageEmptyPlaceholder) {
          manageEmptyPlaceholder.innerHTML = `
            <svg class="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <p class="text-xs font-semibold text-slate-600">[${year}학년도 ${semester}학기 ${examType}]에 등록된 데이터가 없습니다.</p>
            <p class="text-[11px] text-slate-400 mt-1">[데이터 업로드] 탭에서 엑셀/CSV를 올리거나, 아래 버튼으로 학생을 직접 등록하세요.</p>
            <button id="placeholder-add-student-btn" type="button" class="mt-3 inline-flex items-center px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs">
              + 첫 학생 데이터 직접 추가
            </button>
          `;
          document.getElementById("placeholder-add-student-btn")?.addEventListener("click", () => {
            openStudentEditModal(-1);
          });
        }
      } else {
        manageEmptyPlaceholder?.classList.add("hidden");
        manageDataToolbar?.classList.remove("hidden");
        manageTableContainer?.classList.remove("hidden");

        const total = managedStudents.length;
        const g1 = managedStudents.filter((s) => String(s.grade) === "1").length;
        const g2 = managedStudents.filter((s) => String(s.grade) === "2").length;
        const g3 = managedStudents.filter((s) => String(s.grade) === "3").length;

        if (manageStatTotal) manageStatTotal.textContent = `${total.toLocaleString()}명`;
        if (manageStatGrade1) manageStatGrade1.textContent = g1.toLocaleString();
        if (manageStatGrade2) manageStatGrade2.textContent = g2.toLocaleString();
        if (manageStatGrade3) manageStatGrade3.textContent = g3.toLocaleString();

        renderManageTable();
      }
    } catch (err) {
      alert("데이터 조회 중 오류가 발생했습니다: " + err.message);
    } finally {
      if (btnLoadManageData) {
        btnLoadManageData.disabled = false;
        btnLoadManageData.innerHTML = origBtnHtml;
      }
    }
  };

  btnLoadManageData?.addEventListener("click", loadManageData);
  manageTableGradeFilter?.addEventListener("change", renderManageTable);
  manageSearchInput?.addEventListener("input", renderManageTable);

  // 학번 5자리 입력 시 학년, 반, 번호 자동 분할 채움
  editStudentId?.addEventListener("input", () => {
    const val = editStudentId.value.trim();
    if (val.length === 5 && !isNaN(val)) {
      const g = parseInt(val[0], 10);
      const c = parseInt(val.substring(1, 3), 10);
      const n = parseInt(val.substring(3, 5), 10);
      if (g >= 1 && g <= 3 && editStudentGrade) editStudentGrade.value = g;
      if (c >= 1 && editStudentClass) editStudentClass.value = c;
      if (n >= 1 && editStudentNumber) editStudentNumber.value = n;
    }
  });

  const openStudentEditModal = (index, student = null) => {
    if (editStudentIndex) editStudentIndex.value = index;
    if (index === -1) {
      if (studentEditModalTitle) studentEditModalTitle.textContent = "학생 데이터 직접 추가";
      if (studentEditForm) studentEditForm.reset();
      if (editStudentIndex) editStudentIndex.value = "-1";

      const curGrade = manageTableGradeFilter?.value !== "all" ? manageTableGradeFilter.value : "2";
      if (editStudentGrade) editStudentGrade.value = curGrade;
      if (editStudentClass) editStudentClass.value = "1";
      if (editStudentNumber) editStudentNumber.value = "1";
      if (editStudentPeriod) editStudentPeriod.value = "1";

      if (managedStudents.length > 0) {
        if (editStudentDate) editStudentDate.value = managedStudents[0].date || "";
        if (editStudentSubject) editStudentSubject.value = managedStudents[0].subject || "";
        if (editStudentRoom) editStudentRoom.value = managedStudents[0].room || "";
        if (editStudentProctor) editStudentProctor.value = managedStudents[0].proctor || "";
      } else {
        const today = new Date().toISOString().split("T")[0];
        if (editStudentDate) editStudentDate.value = formatDateString(today);
      }
    } else if (student) {
      if (studentEditModalTitle) {
        studentEditModalTitle.textContent = `학생 데이터 수정 (${student.studentId} ${student.name})`;
      }
      if (editStudentId) editStudentId.value = student.studentId || "";
      if (editStudentName) editStudentName.value = student.name || "";
      if (editStudentGrade) editStudentGrade.value = student.grade || "";
      if (editStudentClass) editStudentClass.value = student.class || "";
      if (editStudentNumber) editStudentNumber.value = student.number || "";
      if (editStudentDate) editStudentDate.value = student.date || "";
      if (editStudentPeriod) editStudentPeriod.value = student.period || "";
      if (editStudentSubject) editStudentSubject.value = student.subject || "";
      if (editStudentRoom) editStudentRoom.value = student.room || "";
      if (editStudentProctor) editStudentProctor.value = student.proctor || "";
    }
    studentEditModal?.classList.remove("hidden");
  };

  const closeStudentEditModal = () => {
    studentEditModal?.classList.add("hidden");
  };

  btnOpenAddStudentModal?.addEventListener("click", () => openStudentEditModal(-1));
  closeStudentEditModalBtn?.addEventListener("click", closeStudentEditModal);
  cancelStudentEditBtn?.addEventListener("click", closeStudentEditModal);
  studentEditModal?.addEventListener("click", (e) => {
    if (e.target === studentEditModal) closeStudentEditModal();
  });

  studentEditForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const idx = parseInt(editStudentIndex?.value || "-1", 10);
    const year = manageSchoolYearInput?.value?.trim();
    const semester = manageSemesterSelect?.value;
    const examType = manageExamTypeSelect?.value;

    if (!year || !semester || !examType) {
      alert("시험 정보가 올바르지 않습니다.");
      return;
    }

    const sId = editStudentId?.value?.trim();
    const sName = editStudentName?.value?.trim();
    const sGrade = parseInt(editStudentGrade?.value || "0", 10);
    const sClass = parseInt(editStudentClass?.value || "0", 10);
    const sNumber = parseInt(editStudentNumber?.value || "0", 10);
    const sDate = formatDateString(editStudentDate?.value?.trim());
    const sPeriod = editStudentPeriod?.value?.trim();
    const sSubject = editStudentSubject?.value?.trim();
    const sRoom = editStudentRoom?.value?.trim() || "";
    const sProctor = editStudentProctor?.value?.trim() || "";

    if (!sId || !sName || !sDate || !sPeriod || !sSubject) {
      alert("필수 항목(학번, 성명, 고사일자, 교시, 과목명)을 모두 입력해주세요.");
      return;
    }

    const newStudentData = {
      studentId: sId,
      name: sName,
      grade: sGrade,
      class: sClass,
      number: sNumber,
      date: sDate,
      period: sPeriod,
      subject: sSubject,
      room: sRoom,
      proctor: sProctor,
    };

    const origText = saveStudentEditBtn ? saveStudentEditBtn.textContent : "";
    if (saveStudentEditBtn) {
      saveStudentEditBtn.disabled = true;
      saveStudentEditBtn.textContent = "저장 중...";
    }

    try {
      if (idx === -1) {
        await addStudentRecord(year, semester, examType, newStudentData);
        alert(`[${sName}] 학생 데이터가 성공적으로 추가되었습니다.`);
      } else {
        await updateStudentRecord(year, semester, examType, idx, newStudentData);
        alert(`[${sName}] 학생 데이터가 성공적으로 수정되었습니다.`);
      }
      closeStudentEditModal();
      await loadManageData();
      await syncWithMainIfMatching(year, semester, examType);
    } catch (err) {
      alert("저장 실패: " + err.message);
    } finally {
      if (saveStudentEditBtn) {
        saveStudentEditBtn.disabled = false;
        saveStudentEditBtn.textContent = origText;
      }
    }
  });

  // 학년별 일괄 삭제
  btnDeleteGradeData?.addEventListener("click", () => {
    const year = manageSchoolYearInput?.value?.trim();
    const semester = manageSemesterSelect?.value;
    const examType = manageExamTypeSelect?.value;
    const targetGrade = manageDeleteTargetGrade?.value;

    if (!year || !semester || !examType) return;

    openDeleteConfirm(
      `[${targetGrade}학년] 데이터 일괄 삭제`,
      `[${year}학년도 ${semester}학기 ${examType}]의 [${targetGrade}학년] 시험 데이터를 모두 삭제하시겠습니까?\n타 학년 데이터는 보존되며, 이 작업은 되돌릴 수 없습니다.`,
      async () => {
        await deleteExamGradeData(year, semester, examType, targetGrade);
        alert(`[${targetGrade}학년] 데이터가 성공적으로 삭제되었습니다.`);
        await loadManageData();
        await syncWithMainIfMatching(year, semester, examType);
      }
    );
  });

  // 해당 시험 전체 데이터 삭제 (초기화)
  btnDeleteEntireExam?.addEventListener("click", () => {
    const year = manageSchoolYearInput?.value?.trim();
    const semester = manageSemesterSelect?.value;
    const examType = manageExamTypeSelect?.value;

    if (!year || !semester || !examType) return;

    openDeleteConfirm(
      `[${year}학년도 ${semester}학기 ${examType}] 전체 데이터 초기화`,
      `경고: 이 시험에 속한 모든 학년(1·2·3학년)의 전체 학생 데이터가 완전히 삭제됩니다.\n정말로 전체 데이터를 초기화하시겠습니까?`,
      async () => {
        await deleteExamData(year, semester, examType);
        alert(`[${year}학년도 ${semester}학기 ${examType}] 전체 데이터가 삭제되었습니다.`);
        await loadManageData();
        await syncWithMainIfMatching(year, semester, examType);
      }
    );
  });
};
