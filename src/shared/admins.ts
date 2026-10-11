import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// 관리자 구성원 목록: exam_admins/{이메일(소문자)} = { name, addedBy, addedAt }
// 읽기·쓰기는 기본 관리자만 가능 (firestore.rules)
export type AdminMember = { email: string; name: string; addedBy: string; addedAt: Date | null };

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const listAdmins = async (): Promise<AdminMember[]> => {
  const snap = await getDocs(collection(db, 'exam_admins'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        email: d.id,
        name: String(data.name || ''),
        addedBy: String(data.addedBy || ''),
        addedAt: data.addedAt?.toDate ? data.addedAt.toDate() : null,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
};

export const addAdmin = (email: string, name: string, addedBy: string) =>
  setDoc(doc(db, 'exam_admins', email.trim().toLowerCase()), {
    name: name.trim(),
    addedBy,
    addedAt: serverTimestamp(),
  });

export const removeAdmin = (email: string) => deleteDoc(doc(db, 'exam_admins', email));
