import clickSrc from "./sounds/click.mp3";
import skipSrc from "./sounds/skip.mp3";
import repSrc from "./sounds/rep.mp3";
import questSrc from "./sounds/quest.mp3";
import winSrc from "./sounds/win.mp3";

const SOURCES = {
  click: clickSrc,
  skip: skipSrc,
  rep: repSrc,
  quest: questSrc,
  win: winSrc,
};

// ความดังของแต่ละเสียง (0 = เงียบ, 1 = เต็ม) ปรับได้ตามไฟล์ที่ใช้
const VOLUMES = {
  click: 0.5,
  skip: 0.6,
  rep: 0.6,
  quest: 0.8,
  win: 0.9,
};

let ctx = null;
let sfxOn = true;
const buffers = {};

function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) ctx = new AC();
  return ctx;
}

// เปิด/ปิดเสียง effect (ผูกกับปุ่ม "เสียง" ในหน้าตั้งค่า)
export function setSfxEnabled(on) {
  sfxOn = on;
}

// เบราว์เซอร์บังคับให้ผู้เล่นแตะก่อนถึงจะเปิดเสียงได้ ฟังก์ชันนี้ปลดล็อกให้
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

// โหลดและถอดรหัสเสียงทั้งหมดไว้ล่วงหน้า (เรียกครั้งเดียวตอนเปิดเกม)
export async function preloadSounds() {
  const c = getCtx();
  if (!c) return;
  await Promise.all(
    Object.entries(SOURCES).map(async ([name, src]) => {
      try {
        const res = await fetch(src);
        const data = await res.arrayBuffer();
        buffers[name] = await c.decodeAudioData(data);
      } catch (err) {
        console.warn("โหลดเสียงไม่สำเร็จ:", name, err);
      }
    })
  );
}

export function playSound(name) {
  if (!sfxOn) return;
  const c = getCtx();
  const buffer = buffers[name];
  if (!c || !buffer) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.value = VOLUMES[name] ?? 1;
  source.connect(gain);
  gain.connect(c.destination);
  source.start(0);
}