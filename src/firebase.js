
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
  collection, query, orderBy, limit, getDocs,
} from "firebase/firestore";

// ↓↓↓ วางค่าจริงจาก Firebase ของคุณตรงนี้ ↓↓↓
const app = initializeApp({
  apiKey: "AIzaSyDrUdtSjHnr-zw0bf_ihdadOnbw42y8Rx0",
  authDomain: "sweet-moves-web.firebaseapp.com",
  projectId: "sweet-moves-web",
  storageBucket: "sweet-moves-web.firebasestorage.app",
  messagingSenderId: "332617578049",
  appId: "1:332617578049:web:420b3debf64a17058f38c0",
});
// ↑↑↑ ---------------------------------- ↑↑↑

export const auth = getAuth(app);
export const db = getFirestore(app);

// รหัสเดือนตามเวลาไทย เช่น "2026-11"
export function monthKey() {
  return new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" })
    .slice(0, 7);
}

// ล็อกอินแบบไม่ระบุตัวตน (ถ้าเคยล็อกอินแล้วจะใช้บัญชีเดิม)
export async function ensureLogin() {
  if (auth.currentUser) return auth.currentUser;
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

// บวกคะแนนที่ได้เพิ่มเข้าเดือนปัจจุบัน
export async function addMonthlyPoints(name, earned) {
  const user = await ensureLogin();
  const ref = doc(db, "leaderboards", monthKey(), "players", user.uid);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data().points : 0;
  await setDoc(ref, {
    name,
    points: current + earned,
    updatedAt: serverTimestamp(),
  });
}

// ดึง 10 อันดับแรกของเดือนนี้
export async function fetchTop10() {
  const q = query(
    collection(db, "leaderboards", monthKey(), "players"),
    orderBy("points", "desc"),
    limit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d, i) => ({ rank: i + 1, uid: d.id, ...d.data() }));
}

// ดึงคะแนนของตัวเอง (ไว้โชว์ถ้าไม่ติด 10 อันดับ)
export async function fetchMyScore() {
  const user = await ensureLogin();
  const snap = await getDoc(doc(db, "leaderboards", monthKey(), "players", user.uid));
  return snap.exists() ? { uid: user.uid, ...snap.data() } : null;
}