export interface Meta {
  year: string;
  term: string;
  examType: string;
  grade: string;
}

export interface Student {
  hak: string | number;
  name: string;
  sel: { [subjectName: string]: string };
}

export interface Elective {
  subject: string;
  raw: string;
  codes: string[];
  date: string;
  period: string;
  hasExam: boolean;
  rooms: { [code: string]: string };
  teachers: { [code: string]: string };
}

export interface CommonSubject {
  subject: string;
  date: string;
  period: string;
  teachers: { [classCode: string]: string };
}

export interface RosterRecord {
  hak: string | number;
  name: string;
  date: string;
  period: string;
  subject: string;
  code: string;
  room: string;
  teacher: string;
}
