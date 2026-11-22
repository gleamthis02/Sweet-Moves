import { useCallback, useEffect, useRef, useState } from "react";
import { addMonthlyPoints, fetchTop10, fetchMyScore } from "./firebase.js";
import { preloadSounds, playSound, unlockAudio, setSfxEnabled } from "./audio.js";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import "./App.css";

/* ------------------------------------------------------------------
   1) รูปทั้งหมด (อยู่ในโฟลเดอร์ src/ แล้วนำเข้าด้วย import)
   ชื่อโฟลเดอร์/ไฟล์ต้องตรงทุกตัวอักษร รวมตัวพิมพ์เล็ก-ใหญ่
   (โฟลเดอร์ "Button" B ใหญ่, "icon" ไม่มี s) และนามสกุล .png
   ถ้ารูปไหนหาไม่เจอ Vite จะขึ้น error บอกชื่อไฟล์นั้นเลย
------------------------------------------------------------------ */
import wallpaperStage from "./wallpaper/Wallpaper_Stage.png";   // 2172x724 (แนวนอน 3:1)
import wallpaperDesert from "./wallpaper/Wallpaper_Stage_Desert.png"; // 2172x724 ฉากที่ 2
import wallpaperSnow from "./wallpaper/Wallpaper_Snow.png"; // ฉากที่ 3 (ด่าน 21-30)[cite: 1, 3]
import wallpaperIngame from "./wallpaper/Wallpaper_Ingame.jpg"; // 1408x3042
import bgBrown from "./background/Background_Stage.png";        // 1792x2398 (พื้นกล่องเด้งหน้าด่าน)
import bgIngame from "./background/Background_Ingame.png";      // 1536x2752
import bgMission from "./background/Background_Mission.png";    // 1028x512
import dailyTitle from "./background/Title.png";
import buttonImage from "./Button/button.png";                  // 540x250
import squareRed from "./Button/squard_red.png";                // 265x266
import starYellow from "./icons/icon_Star.png";                 // 92x108
import starGray from "./icons/icon_Star_Gray.png";              // 92x108
import starBlue from "./icons/icon_star_blue.png";              // ไอคอนคะแนนภารกิจ
import wallpaperCastle from "./wallpaper/Wallpaper_Castle.jpg";    // 1408x3042
import wallpaperYellow from "./wallpaper/Wallpaper_Yellow.jpg";    // 1408x3042
import wallpaperYellow2 from "./wallpaper/Wallpaper_Yellow_2.jpg"; // 1408x3042
import bgButton from "./background/Background_Button.png";      // 2400x1792
import iconRank from "./icons/icon_rank.png";                   // 57x82
import iconChest from "./icons/icon_chest.png";                 // 57x82
import iconMission from "./icons/icon_mission.png";             // 57x82
import bgSettings from "./background/Background_Settings.png";  // 335x414
import iconSettings from "./icons/icon_settings.png";           // 61x69
import buttonOpen from "./Button/Open.png";                     // ปุ่ม "เปิด"
import buttonClose from "./Button/Close.png";                   // ปุ่ม "ปิด"
import bgTime from "./background/Background_Time.png";         // พื้นกล่องเวลา
import bgListPlayer from "./background/List_Player.png";       // 525x97 แถบชื่อผู้เล่นบนหน้าอันดับ
import { POSES, PoseTracker } from "./poses.js";               // คลังท่าทาง 25 ท่า + ตัวตรวจท่า

const ASSETS = {
  wallpaperStage,
  wallpaperDesert,
  wallpaperSnow,
  wallpaperIngame,
  popupBackground: bgBrown,
  dailyTitle,
  starBlue,
  ingamePanel: bgIngame,
  missionBackground: bgMission,
  button: buttonImage,
  levelButton: squareRed,
  starYellow,
  starGray,
  wallpaperCastle,
  wallpaperYellow,
  wallpaperYellow2,
  navBackground: bgButton,
  iconRank,
  iconChest,
  iconMission,
  settingsBackground: bgSettings,
  iconSettings,
  buttonOpen,
  buttonClose,
  timeBackground: bgTime,
  listPlayer: bgListPlayer,
};

/* ------------------------------------------------------------------
   2) ค่าตั้งต้นของ prototype
------------------------------------------------------------------ */
const UNLOCK_ALL = false;   // true = กดเล่นด่านไหนก็ได้ (ไว้ทดสอบ)
const MAX_STARS = 3;       // ดาวสูงสุดของด่าน (ด่านเริ่มที่ 0 ดาว แล้วเพิ่มตามสัดส่วนเควสที่ผ่าน)
const STORAGE_KEY = "sweet-moves-progress";
const TIMES_KEY = "sweet-moves-best-times";
const DAILY_MISSIONS_KEY = "sweet-moves-daily-missions";
const POINTS_KEY = "sweet-moves-total-points";
// true = บันทึกเวลาเฉพาะรอบที่ทำครบทุกภารกิจโดยไม่กดข้าม (กันเวลาเร็วผิดปกติจากการกดข้ามรัวๆ)
// false = บันทึกเวลาของทุกรอบที่เล่นจบ
const TIME_COUNTS_ONLY_WITHOUT_SKIP = true;
// ภารกิจประจำวันแบบ "ผ่านด่านได้ x ดาว" true = นับเฉพาะด่านที่เพิ่งผ่านเป็นครั้งแรก, false = นับทุกครั้งที่ผ่านด่าน
const MISSION_NEW_LEVEL_ONLY = false;

// แถบเมนูด้านล่าง
const NAV_WIDTH = 96;                 // ความกว้างแถบ (cqw = % ของความกว้างจอ)
const NAV_FALLBACK_RATIO = 285 / 80;  // สัดส่วนแถบตามรูปตัวอย่างดีไซน์ (กว้าง/สูง)
const NAV_ICON_SCALE = 0.74;          // ความสูงไอคอน เทียบกับความสูงแถบ
const NAV_TABS = [
  { id: "rank", icon: ASSETS.iconRank, label: "อันดับ" },
  { id: "chest", icon: ASSETS.iconChest, label: "หีบสมบัติ" },
  { id: "mission", icon: ASSETS.iconMission, label: "ภารกิจ" },
];
// พื้นหลังของแต่ละหน้าที่เปิดจากแถบเมนู
const TAB_WALLPAPERS = {
  rank: ASSETS.wallpaperCastle,
  chest: ASSETS.wallpaperYellow,
  mission: ASSETS.wallpaperYellow2,
};
// หน้าที่ต้องแสดงแถบเมนูด้านล่าง
const NAV_SCREENS = ["stage", "rank", "chest", "mission"];

// รายการในหน้าต่างตั้งค่า (แก้ชื่อ/เพิ่มลดได้) ค่าเริ่มต้นเปิดทั้งหมด
const SETTINGS_OPTIONS = [
  { id: "music", label: "เพลง" },
  { id: "sfx", label: "เสียง" },
  { id: "vibration", label: "การสั่น" },
];
const DEFAULT_SETTINGS = Object.fromEntries(SETTINGS_OPTIONS.map((o) => [o.id, true]));

// ภารกิจของด่าน: สุ่มจากท่าใน poses.js ตามช่วงด่าน (แก้เลขได้ที่ LEVEL_RULES)
// แต่ละเควสมีเวลาจำกัด ถ้าตรวจจับได้ว่าทำท่านั้นถูก 1 ครั้งในเวลา = ผ่านเควสนั้น (เก็บไว้เงียบๆ ไม่แสดงให้ผู้เล่นเห็น)
const TIERS = ["ง่าย", "กลาง", "ยาก"];   // ตรงกับค่า level ใน poses.js ("กลาง" = ปานกลาง)
// upTo    = ใช้กับด่านเลขไม่เกินนี้ (แถวสุดท้าย Infinity = ด่านที่เหลือทั้งหมด)
// quests  = จำนวนเควสในด่าน
// seconds = เวลาต่อเควส (วินาที) หมดเวลาแล้วจึงไปเควสถัดไป
// tiers   = ระดับความยากของท่าที่สุ่มเจอได้
const LEVEL_RULES = [
  { upTo: 3, quests: 2, seconds: 15, tiers: ["ง่าย"] },
  { upTo: 6, quests: 3, seconds: 20, tiers: ["ง่าย", "กลาง"] },
  { upTo: 13, quests: 4, seconds: 25, tiers: TIERS },
  { upTo: 20, quests: 5, seconds: 25, tiers: TIERS },
  { upTo: Infinity, quests: 6, seconds: 30, tiers: TIERS },
];

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

/* ------------------------------------------------------------------
   3) ฟังก์ชันช่วย
------------------------------------------------------------------ */
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* เซฟไม่ได้ก็ข้ามไป */
  }
}

// เวลาที่เร็วที่สุดของแต่ละด่าน { เลขด่าน: วินาที }
function loadBestTimes() {
  try {
    return JSON.parse(localStorage.getItem(TIMES_KEY)) || {};
  } catch {
    return {};
  }
}

function saveBestTimes(times) {
  try {
    localStorage.setItem(TIMES_KEY, JSON.stringify(times));
  } catch {
    /* เซฟไม่ได้ก็ข้ามไป */
  }
}

// 105 วินาที -> "1:45m" (ตามรูปตัวอย่าง)
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}m`;
}

// 2 วินาที -> "0:02" (นาฬิกาในหน้าเล่น)
function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* ------------------------------------------------------------------
   4) ชิ้นส่วนที่ใช้ซ้ำ
------------------------------------------------------------------ */

// แถวดาว 3 ดวง: earned = จำนวนที่ได้ (สีเหลือง) ที่เหลือเป็นสีเทา
function Stars({ earned, className = "" }) {
  return (
    <div className={`stars ${className}`}>
      {[1, 2, 3].map((n) => (
        <img
          key={n}
          src={n <= earned ? ASSETS.starYellow : ASSETS.starGray}
          alt=""
          draggable="false"
        />
      ))}
    </div>
  );
}

// ปุ่มที่ใช้รูป button.png (สัดส่วนล็อกไว้ที่ 540:250 รูปไม่เพี้ยน)
// width / fontSize เป็นหน่วย cqw
function ImageButton({ width, fontSize, onClick, sound, children }) {
  return (
    <button
      className="image-button"
      data-sound={sound}
      style={{
        backgroundImage: `url(${ASSETS.button})`,
        width: `${width}cqw`,
        fontSize: `${fontSize}cqw`,
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ป้ายหัวข้อบนสุดของหน้า (ใช้รูป Title.png) ตำแหน่งและสไตล์ใช้ class เดิมของหน้าภารกิจประจำวัน
// ต้องวางเป็นลูกตรงของ .screen โดยตรง ไม่ซ้อนในกล่องที่มี position
function ScreenTitle({ children }) {
  return (
    <div className="daily-title-wrap">
      <img className="daily-title-image" src={ASSETS.dailyTitle} alt="" draggable="false" />
      <span className="daily-heading">{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------
   5) หน้าด่าน (แผนที่แนวนอน เลื่อนซ้าย -> ขวา)
------------------------------------------------------------------ */

// --- ขนาดของ "โลก" (หน่วย cqw = % ความกว้างกรอบเกม) ---
const FRAME_H = (100 * 16) / 9;                  // ความสูงกรอบเกม
const WORLD_IMAGE_W = FRAME_H * (2172 / 724);    // ความกว้างรูปพื้นหลัง 1 ใบ (สัดส่วน 2172x724 = 3:1)
const WORLD_OVERLAP = 44;                        // ช่วงที่รูปสองใบค่อยๆ เฉือนซ้อนกัน
const EDGE_BLACK_W = 28;                         // ความกว้างฉากสีดำปลายซ้ายสุดและขวาสุด
const EDGE_BLEND_W = 44;                         // ระยะจางซ้ายสุดและขวาสุดให้สมูทเท่ากับรอยต่อฉาก
const LEVELS_PER_WORLD = 10;                     // จำนวนด่านต่อรูป (1 ภาพ = 1 ฉาก = 10 ด่าน)
const LEVEL_EDGE = 35;                           // ระยะจากขอบโลกถึงปุ่มด่านแรก/ด่านสุดท้าย
const LEVEL_SEAM_MARGIN = 12;                    // ระยะเว้นจากช่วงรอยต่อของรูป ไม่ให้ปุ่มอยู่กลางช่วงจาง
const LEVEL_Y_OFFSET = -4;                       // ยกปุ่มขึ้นเล็กน้อย ไม่ให้ดาวใต้ปุ่มถูกแถบเมนูบัง
const POPUP_WIDTH = 65;                          // ความกว้างกล่องเด้ง

// เส้นกึ่งกลางทางเดินหญ้าสีเขียว [x, y] เป็นสัดส่วนของรูป (0-1)
// วัดจากรูป Wallpaper_Stage และ Wallpaper_Stage_Desert (ทางเดินตำแหน่งเดียวกัน จึงใช้เส้นเดียวกัน)
const GRASS_PATH = [
  [0, 0.72], [0.06, 0.725], [0.12, 0.74], [0.2, 0.73], [0.25, 0.70],
  [0.3, 0.66], [0.35, 0.65], [0.4, 0.62], [0.45, 0.595], [0.5, 0.615],
  [0.55, 0.635], [0.6, 0.635], [0.65, 0.64], [0.7, 0.62], [0.75, 0.607],
  [0.8, 0.59], [0.85, 0.575], [0.9, 0.575], [0.95, 0.56], [1, 0.555],
];

// รูปพื้นหลังเรียงจากซ้ายไปขวา (เพิ่มรูปต่อท้ายได้ จะได้ด่านเพิ่มตาม LEVELS_PER_WORLD)[cite: 1, 3]
const WORLDS = [
  { image: ASSETS.wallpaperStage, path: GRASS_PATH },
  { image: ASSETS.wallpaperDesert, path: GRASS_PATH },
  { image: ASSETS.wallpaperSnow, path: GRASS_PATH },
];

const worldLeft = (i) => EDGE_BLACK_W + i * (WORLD_IMAGE_W - WORLD_OVERLAP);
const CONTENT_WIDTH =
  WORLDS.length * WORLD_IMAGE_W - (WORLDS.length - 1) * WORLD_OVERLAP;
const WORLD_WIDTH = CONTENT_WIDTH + EDGE_BLACK_W * 2;

function getWorldMaskStyle(index, total) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  if (isFirst && isLast) {
    const mask = `linear-gradient(to right, transparent 0, #000 ${EDGE_BLEND_W}cqw, #000 calc(100% - ${EDGE_BLEND_W}cqw), transparent 100%)`;
    return { WebkitMaskImage: mask, maskImage: mask };
  }
  if (isFirst) {
    const mask = `linear-gradient(to right, transparent 0, #000 ${EDGE_BLEND_W}cqw)`;
    return { WebkitMaskImage: mask, maskImage: mask };
  }
  if (isLast) {
    const mask = `linear-gradient(to right, transparent 0, #000 ${WORLD_OVERLAP}cqw, #000 calc(100% - ${EDGE_BLEND_W}cqw), transparent 100%)`;
    return { WebkitMaskImage: mask, maskImage: mask };
  }

  const mask = `linear-gradient(to right, transparent 0, #000 ${WORLD_OVERLAP}cqw)`;
  return { WebkitMaskImage: mask, maskImage: mask };
}

// หาค่า y บนเส้นทางที่ตำแหน่ง x (เส้นต่อจุดแบบเส้นตรง)
function interpolateY(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let k = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1];
    const [x1, y1] = points[k];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

// ต่อเส้นทางของทุกรูปเป็นเส้นเดียว ช่วงรอยต่อใช้เส้นตรงเชื่อมให้เรียบเนียน
function buildWorldPath() {
  let pts = [];
  WORLDS.forEach((w, i) => {
    const left = worldLeft(i);
    const world = w.path.map(([px, py]) => [left + px * WORLD_IMAGE_W, py * FRAME_H]);
    if (i === 0) {
      pts = world;
      return;
    }
    const overlapEnd = left + WORLD_OVERLAP;
    const yOld = interpolateY(pts, left);
    const yNew = interpolateY(world, overlapEnd);
    pts = [
      ...pts.filter((p) => p[0] < left),
      [left, yOld],
      [overlapEnd, yNew],
      ...world.filter((p) => p[0] > overlapEnd),
    ];
  });
  return pts;
}

// วางด่านของแต่ละรูป (แต่ละฉาก) ห่างเท่าๆ กันในแนวนอน แล้วดึงความสูงจากเส้นทางหญ้า
// ด่านจะไม่อยู่ในช่วงรอยต่อที่ภาพกำลังจางสลับกัน
function placeLevels(points) {
  const result = [];
  WORLDS.forEach((w, i) => {
    const isFirst = i === 0;
    const isLast = i === WORLDS.length - 1;
    const left = worldLeft(i);
    const from = isFirst
      ? left + LEVEL_EDGE
      : left + WORLD_OVERLAP + LEVEL_SEAM_MARGIN;
    const to = isLast
      ? left + WORLD_IMAGE_W - LEVEL_EDGE
      : left + WORLD_IMAGE_W - WORLD_OVERLAP - LEVEL_SEAM_MARGIN;
    const step = (to - from) / (LEVELS_PER_WORLD - 1);
    for (let k = 0; k < LEVELS_PER_WORLD; k++) {
      const x = from + k * step;
      result.push({ x, y: interpolateY(points, x) + LEVEL_Y_OFFSET });
    }
  });
  return result;
}

// ตำแหน่งของด่าน 1, 2, 3, ... (index 0 = ด่าน 1) คำนวณครั้งเดียวตอนเปิดเกม
const LEVEL_POSITIONS = placeLevels(buildWorldPath());
const TOTAL_LEVELS = LEVEL_POSITIONS.length;

// กติกาสุ่มเควสของด่านนี้ (ดูตาราง LEVEL_RULES)
function levelRule(n) {
  return LEVEL_RULES.find((rule) => n <= rule.upTo);
}

// ข้อความจำนวนเควสที่โชว์ในกล่องด่าน เช่น "2"
function questCountText(n) {
  return String(levelRule(n).quests);
}

// ดาวจากสัดส่วนเควสที่ผ่าน: ไม่ผ่านเลย = 0, 1-19% = 1, 20-39% = 2, 40% ขึ้นไป = 3
function starsFromPassed(passed, total) {
  if (passed <= 0 || total <= 0) return 0;
  const percent = (passed / total) * 100;
  if (percent >= 40) return 3;
  if (percent >= 20) return 2;
  return 1;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// สุ่มท่าของด่าน: คืนรายการท่า (ไม่ซ้ำกันในด่านเดียว)
// จำนวนเควสและระดับท่าเป็นไปตาม LEVEL_RULES ของช่วงด่านนั้น
function pickMissions(level) {
  const rule = levelRule(level);
  const pool = POSES.filter((p) => rule.tiers.includes(p.level));
  return shuffle(pool).slice(0, rule.quests);
}

// ชื่อท่าที่แสดงในเกม (ตัดข้อความในวงเล็บออกให้สั้นลง)
function missionName(pose) {
  return pose.name.replace(/\s*\(.*?\)\s*/g, " ").trim();
}

// ภารกิจประจำวัน: สุ่มมาวันละ 3 จาก 8 แบบ ผ่านครบเป้าได้ดาวสีน้ำเงิน 1 ดวง
// type "level"     = ผ่านด่านได้ minStars ดาวขึ้นไป (นับทีละด่าน)
// type "online"    = เวลาออนไลน์ของวันนี้ target นาที
// type "challenge" = เล่นชาเล้นจ์ประจำวันสำเร็จ (นับทีละครั้ง)
const DAILY_MISSION_POOL = [
  { id: "star3-1", type: "level", minStars: 3, target: 1, unit: "ด่าน", description: "ได้รับ 3 ดาวใน 1 ด่าน" },
  { id: "star2-2", type: "level", minStars: 2, target: 2, unit: "ด่าน", description: "ได้รับ 2 ดาวขึ้นไป ใน 2 ด่าน" },
  { id: "star2-3", type: "level", minStars: 2, target: 3, unit: "ด่าน", description: "ได้รับ 2 ดาวขึ้นไป ใน 3 ด่าน" },
  { id: "online-10", type: "online", target: 10, unit: "นาที", description: "ออนไลน์เกิน 10 นาที" },
  { id: "online-15", type: "online", target: 15, unit: "นาที", description: "ออนไลน์เกิน 15 นาที" },
  { id: "challenge-today-2", type: "challenge", target: 2, unit: "ครั้ง", description: "เล่นชาเล้นจ์ประจำวัน 2 ครั้ง" },
  { id: "challenge-today-1", type: "challenge", target: 1, unit: "ครั้ง", description: "เล่นชาเล้นจ์ประจำวัน 1 ครั้ง" },
  { id: "challenge-any-1", type: "challenge", target: 1, unit: "ครั้ง", description: "เล่นชาเล้นจ์ใดก็ได้ 1 ครั้ง" },
];

function createMissions() {
  return shuffle(DAILY_MISSION_POOL).slice(0, 3).map((mission) => ({
    ...mission,
    progress: 0,
    claimed: false,
  }));
}

// อัปเดตความคืบหน้าภารกิจตามเหตุการณ์ที่เกิดขึ้น แล้วบอกว่าภารกิจที่สำเร็จใหม่ได้กี่ดาว
// event: { type: "level", stars } | { type: "challenge" } | { type: "online", seconds }
function applyMissionEvent(daily, event) {
  let earned = 0;
  const missions = daily.missions.map((mission) => {
    if (mission.claimed) return mission;
    let progress;
    if (mission.type === "level" && event.type === "level" && event.stars >= mission.minStars) {
      progress = mission.progress + 1;
    } else if (mission.type === "challenge" && event.type === "challenge") {
      progress = mission.progress + 1;
    } else if (mission.type === "online" && event.type === "online") {
      progress = Math.floor(event.seconds / 60);
    } else {
      return mission;
    }
    progress = Math.min(mission.target, progress);
    const claimed = progress >= mission.target;
    if (claimed) earned += 1;
    return { ...mission, progress, claimed };
  });
  return { daily: { ...daily, missions }, earned };
}

// ชาเล้นจ์ประจำวัน: ทุกชาเล้นจ์ใช้กติกาเดียวกัน คือนับถอยหลัง 60 วินาที แล้วนับจำนวนครั้งที่ทำท่าถูก
const DAILY_CHALLENGE_POOL = [
  { id: "jumping-jack", description: "กระโดดตบ" },
  { id: "march-in-place", description: "ขยับขาเหมือนเดิน" },
  { id: "punch", description: "ชกซ้าย-ขวา" },
  { id: "bend-touch-knee", description: "ก้มแตะเข่าแล้วยืดตัวตรง" },
  { id: "clap-overhead", description: "ตบมือเหนือหัว" },
];

const CHALLENGE_SECONDS = 60; // เวลาของชาเล้นจ์ (วินาที)
const READY_SECONDS = 5;      // เวลาเตรียมพร้อมก่อนเริ่มด่าน/ชาเล้นจ์ (วินาที)

// ดาวของชาเล้นจ์จากจำนวนครั้งที่ทำถูก: 20+ = 3 ดาว, 10-19 = 2 ดาว, 2-9 = 1 ดาว, 0-1 = 0 ดาว (ไม่ผ่าน)
function starsFromReps(reps) {
  if (reps >= 20) return 3;
  if (reps >= 10) return 2;
  if (reps >= 2) return 1;
  return 0;
}

const DAILY_RESET_MS = 24 * 60 * 60 * 1000;

function createDailyData() {
  const createdAt = Date.now();

  return {
    createdAt,
    expiresAt: createdAt + DAILY_RESET_MS,

    onlineSeconds: 0,   // เวลาออนไลน์ของวันนี้ (วินาที)
    missions: createMissions(),

    challenges: shuffle(DAILY_CHALLENGE_POOL).slice(0, 3).map((challenge) => ({
      ...challenge,
      claimed: false,
    })),
  };
}

function saveDailyData(data) {
  try {
    localStorage.setItem(DAILY_MISSIONS_KEY, JSON.stringify(data));
  } catch {
    /* เซฟไม่ได้ก็ข้ามไป */
  }
}

function loadPoints() {
  try {
    return Number(localStorage.getItem(POINTS_KEY)) || 0;
  } catch {
    return 0;
  }
}

function savePoints(points) {
  try {
    localStorage.setItem(POINTS_KEY, String(points));
  } catch {
    /* เซฟไม่ได้ก็ข้ามไป */
  }
}

function loadDailyData() {
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_MISSIONS_KEY));
    if (saved?.expiresAt > Date.now() && Array.isArray(saved.missions) && saved.missions.length === 3) {
      const uniqueIds = new Set(saved.missions.map((mission) => mission.id));
      if (uniqueIds.size === 3) {
  // ภารกิจชุดเก่า (ไม่มี type หรือไม่อยู่ในรายการใหม่) ให้สุ่มชุดใหม่แทน
  const poolIds = new Set(DAILY_MISSION_POOL.map((mission) => mission.id));
  if (!saved.missions.every((mission) => mission.type && poolIds.has(mission.id))) {
    saved.missions = createMissions();
    saved.onlineSeconds = 0;
    saveDailyData(saved);
  }
  if (!Array.isArray(saved.challenges) || saved.challenges.length !== 3) {
    saved.challenges = shuffle(DAILY_CHALLENGE_POOL).slice(0, 3).map((challenge) => ({
      ...challenge,
      claimed: false,
    }));
    saveDailyData(saved);
  }

  return saved;
}
    }
  } catch {
    /* สุ่มชุดใหม่ด้านล่าง */
  }
  const fresh = createDailyData();
  saveDailyData(fresh);
  return fresh;
}

function DailyMissionScreen({ dailyData, points }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = Math.max(0, dailyData.expiresAt - now);
  const hours = String(Math.floor(remaining / 3600000)).padStart(2, "0");
  const minutes = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, "0");
  const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");

  return (
    <div className="screen daily-screen" style={{ backgroundImage: `url(${ASSETS.wallpaperYellow})` }}>
      <ScreenTitle>ภารกิจประจำวัน</ScreenTitle>

      <div className="daily-score">
        <span>คะแนนภารกิจ: {points}</span>
        <img src={ASSETS.starBlue} alt="คะแนน" draggable="false" />
      </div>

      <div className="daily-missions">
        {dailyData.missions.map((mission, index) => (
          <div
            className={`daily-card ${mission.claimed ? "completed" : ""}`}
            key={mission.id}
            style={{ backgroundImage: `url(${ASSETS.missionBackground})` }}
          >
            <div className="daily-card-title">ภารกิจที่ {index + 1}</div>
            <div className="daily-card-description">{mission.description}</div>
            <div className="daily-card-progress">
              {Math.min(mission.progress, mission.target)}/{mission.target} {mission.unit ?? "ครั้ง"}
            </div>
            <div className="daily-card-reward">
              <span>รางวัล:</span>
              <img src={ASSETS.starBlue} alt="" draggable="false" />
              <span>x1</span>
              {mission.claimed && <span className="daily-claimed">สำเร็จ</span>}
            </div>
          </div>
                ))}

        <div className="daily-reset-timer">
          รีเซตในอีก {hours}:{minutes}:{seconds}
        </div>
      </div>
    </div>
  );
}


function DailyChallengeScreen({ dailyData, points, onStartChallenge }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = Math.max(0, dailyData.expiresAt - now);
  const hours = String(Math.floor(remaining / 3600000)).padStart(2, "0");
  const minutes = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, "0");
  const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");

    return (
    <div
      className="screen daily-screen challenge-screen"
      style={{ backgroundImage: `url(${ASSETS.wallpaperYellow})` }}
    >
      <ScreenTitle>ชาเล้นท์ประจำวัน</ScreenTitle>

      <div className="daily-score">
        <span>คะแนนภารกิจ: {points}</span>
        <img src={ASSETS.starBlue} alt="คะแนน" draggable="false" />
      </div>

      <div className="daily-missions">
        {dailyData.challenges.map((challenge) => (
          <div
            className={`daily-card challenge-card ${challenge.claimed ? "completed" : ""}`}
            key={challenge.id}
            style={{ backgroundImage: `url(${ASSETS.missionBackground})` }}
          >
            <div className="daily-card-title">
              ชาเล้นท์ {challenge.description}
            </div>

            <div className="daily-card-progress">
              ทำได้มากที่สุด: {challenge.best ?? 0} ครั้ง
            </div>

            {/* ดาวที่ได้รับสูงสุด: ได้แล้ว = สีเหลือง ยังไม่ถึง = สีเทา */}
            <Stars earned={challenge.stars ?? 0} className="challenge-stars" />

            {/* รางวัลได้รับครั้งเดียว จนกว่าจะรีเซตชาเล้นท์ใหม่ */}
            <div className="daily-card-reward">
              <span>รางวัล: 1</span>
              <img src={ASSETS.starBlue} alt="" draggable="false" />
              {challenge.claimed && <span className="daily-claimed">รับแล้ว</span>}
            </div>

            {/* ปุ่มเล่น: เล่นซ้ำได้เสมอ */}
            <button
              className="challenge-play-button"
              style={{ "--btn-image": `url(${ASSETS.button})` }}
              onClick={() => onStartChallenge(challenge)}
              data-sound="click"
            >
              <span>เล่น</span>
            </button>
          </div>
        ))}

        {/* เวลานับถอยหลัง อยู่ใต้การ์ดใบสุดท้าย ชิดมุมขวา */}
        <div className="daily-reset-timer">
          รีเซตในอีก {hours}:{minutes}:{seconds}
        </div>
      </div>
    </div>
  );
}


function StageScreen({ progress, bestTimes, onStartLevel, scrollMemory }) {
  const [selected, setSelected] = useState(null);
  const scrollRef = useRef(null);
  const popupRef = useRef(null);

  // เปิดมาให้เลื่อนไปที่ด่านถัดไปที่ยังไม่เคยเล่น
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const unit = el.clientWidth / 100; // 1cqw เป็นกี่พิกเซล

    // เคยเลื่อนไว้แล้ว: กลับไปตำแหน่งเดิม
    if (scrollMemory.current !== null) {
      el.scrollLeft = scrollMemory.current * unit;
      return;
    }

    // เปิดเกมครั้งแรก: เลื่อนไปที่ด่านถัดไปที่ยังไม่เคยเล่น
    let next = 1;
    while (next < TOTAL_LEVELS && (progress[next] ?? 0) > 0) next++;
    const pos = LEVEL_POSITIONS[next - 1];
    el.scrollLeft = Math.max(0, pos.x - 30) * unit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เมื่อกล่องเด้งขึ้น ให้เลื่อนจอให้เห็นกล่องเต็มๆ
  useEffect(() => {
    if (selected !== null && popupRef.current) {
      popupRef.current.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
    }
  }, [selected]);

  // หมุนลูกกลิ้งเมาส์ในแนวตั้ง = เลื่อนแผนที่ไปซ้าย/ขวา (สำหรับใช้บนคอม)
  function handleWheel(e) {
    const el = scrollRef.current;
    if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
  }

  // ตำแหน่งกล่องเด้ง: อยู่เหนือปุ่มที่เลือก และไม่ล้นขอบโลก/ขอบบน
  let popup = null;
  if (selected !== null) {
    const pos = LEVEL_POSITIONS[selected - 1];
    const popupH = (POPUP_WIDTH * 2398) / 1792;
    const left = Math.min(Math.max(pos.x - 22, 2), WORLD_WIDTH - POPUP_WIDTH - 2);
    const top = Math.max(8, pos.y - 10 - 1.5 - popupH);
    popup = (
      <div
        className="popup"
        ref={popupRef}
        style={{
          left: `${left}cqw`,
          top: `${top}cqw`,
          width: `${POPUP_WIDTH}cqw`,
          backgroundImage: `url(${ASSETS.popupBackground})`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="popup-head">
          <span className="popup-title">ด่านที่ {selected}</span>
          <Stars earned={progress[selected] ?? 0} className="popup-stars" />
        </div>

        <div className="popup-panel">
          <p className="popup-line">
            เวลาทำได้ดีสุด: {bestTimes[selected] ? formatTime(bestTimes[selected]) : "-"}
          </p>
          <p className="popup-line">มี {questCountText(selected)} ท่าภารกิจที่ต้องทำ</p>
          <ImageButton width={30} fontSize={6.2} onClick={() => onStartLevel(selected)}>
            เล่น
          </ImageButton>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      {/* กดที่ว่างบนแผนที่ = ปิดกล่องเด้ง */}
      <div
        className="stage-scroll"
        ref={scrollRef}
        onClick={() => setSelected(null)}
        onWheel={handleWheel}
        onScroll={(e) => {
          const el = e.currentTarget;
          scrollMemory.current = el.scrollLeft / (el.clientWidth / 100);
        }}
      >
        <div className="stage-world" style={{ width: `${WORLD_WIDTH}cqw` }}>
          {/* ฉากสีดำด้านซ้ายสุด */}
          <div
            className="stage-black-cap"
            style={{ left: 0, width: `${EDGE_BLACK_W + 1}cqw` }}
          />

          {/* รูปพื้นหลังเรียงต่อกัน */}
          {WORLDS.map((w, i) => (
            <div
              key={i}
              className="stage-bg"
              style={{
                left: `${worldLeft(i)}cqw`,
                width: `${WORLD_IMAGE_W}cqw`,
                backgroundImage: `url(${w.image})`,
                ...getWorldMaskStyle(i, WORLDS.length),
              }}
            />
          ))}

          {/* ฉากสีดำด้านขวาสุด */}
          <div
            className="stage-black-cap"
            style={{
              left: `${EDGE_BLACK_W + CONTENT_WIDTH - 1}cqw`,
              width: `${EDGE_BLACK_W + 1}cqw`,
            }}
          />

          {/* ปุ่มด่านตามทางเดินหญ้า */}
          {LEVEL_POSITIONS.map((pos, idx) => {
            const n = idx + 1;
            const unlocked = UNLOCK_ALL || n === 1 || (progress[n - 1] ?? 0) > 0;
            return (
              <div
                key={n}
                className="level-node"
                style={{ left: `${pos.x}cqw`, top: `${pos.y}cqw` }}
              >
                <button
                  className={`level-button ${unlocked ? "" : "locked"}`}
                  disabled={!unlocked}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(selected === n ? null : n);
                  }}
                >
                  <img src={ASSETS.levelButton} alt="" draggable="false" />
                  <span className="level-number">{n}</span>
                  <Stars earned={progress[n] ?? 0} className="level-stars" />
                </button>
              </div>
            );
          })}

          {popup}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   6) หน้าเล่นเกม: ภารกิจ 5 ท่าที่สุ่มจาก poses.js + ตรวจท่าด้วย PoseTracker
------------------------------------------------------------------ */

// ตำแหน่ง UI ในหน้าเล่น (หน่วย cqw = % ความกว้างกรอบเกม)
const MISSION_BOX_W = 76.5;
const MISSION_BOX_LEFT = (100 - MISSION_BOX_W) / 2;       // กล่องภารกิจอยู่กลางจอ ล่างสุด
const MISSION_BOX_BOTTOM = 2;                          // ระยะจากขอบล่างจอ
const MISSION_BOX_H = (MISSION_BOX_W * 512) / 1028;    // Background_Mission 1028x512
// กรอบ Background_Ingame ใหญ่เต็มจอ กล่องภารกิจวางทับบนส่วนบนของกรอบ
// ภาพกล้องอยู่ในกรอบ ใต้กล่องภารกิจ (ไม่ทับกัน)
const CAMERA_SIDE = 4;                                     // เว้นขอบ wallpaper เล็กน้อย
const CAMERA_TOP = 14;                                     // ภาพกล้องเริ่มใต้แถวปุ่มตั้งค่า/เวลา
const CAMERA_BOTTOM = MISSION_BOX_BOTTOM + MISSION_BOX_H - 6; // ภาพกล้องลงมาถึงกล่องภารกิจ (ซ้อนใต้กล่องเล็กน้อย)
const TIME_BOX_W = 22;                                 // ความกว้างกล่องเวลา

// เลือกรูปแบบวิดีโอที่เบราว์เซอร์นี้อัดได้ (Chrome/Android = webm, Safari/iOS = mp4)
function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return null;
  const types = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/* ------------------------------------------------------------------
   อัดคลิป "ภาพในเกมจริง": วาดหน้าจอเกม (พื้นหลัง กล่องภารกิจ ภาพกล้อง ดาว เวลา ฯลฯ) ลง canvas
   โดยอ่านตำแหน่ง/ข้อความ/รูปจาก DOM ของหน้าเล่นโดยตรง แล้วอัดจาก canvas ด้วย MediaRecorder
   (ไม่ต้องขออนุญาตแชร์หน้าจอ ใช้ได้ทั้งมือถือและคอม)
------------------------------------------------------------------- */
const clipImageCache = new Map();
function getClipImage(url) {
  let img = clipImageCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    clipImageCache.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function drawCover(ctx, source, sw, sh, x, y, w, h, mirror) {
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (mirror) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  ctx.restore();
}

function paintGameScene(ctx, root, W, H) {
  const rootRect = root.getBoundingClientRect();
  if (!rootRect.width) return;
  const k = W / rootRect.width;

  ctx.fillStyle = "#fff6f0";
  ctx.fillRect(0, 0, W, H);

  const rootBg = /url\("?([^")]+)"?\)/.exec(getComputedStyle(root).backgroundImage);
  if (rootBg) {
    const img = getClipImage(rootBg[1]);
    if (img) drawCover(ctx, img, img.naturalWidth, img.naturalHeight, 0, 0, W, H, false);
  }

  // วาดตามลำดับชั้น (z-index) ของลูกตรงของหน้า เหมือนที่เห็นบนจอจริง เช่น กล่องภารกิจอยู่เหนือภาพกล้อง
  const layers = Array.from(root.children)
    .map((child, index) => ({
      child,
      index,
      z: parseInt(getComputedStyle(child).zIndex, 10) || 0,
    }))
    .sort((a, b) => a.z - b.z || a.index - b.index);
  const ordered = layers.flatMap(({ child }) => [child, ...child.querySelectorAll("*")]);

  ordered.forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = (r.left - rootRect.left) * k;
    const y = (r.top - rootRect.top) * k;
    const w = r.width * k;
    const h = r.height * k;

    if (el.tagName === "VIDEO") {
      if (el.readyState >= 2 && el.videoWidth) {
        // ภาพกล้องถูกตัดมุมโค้งตามกรอบกล้อง และกลับซ้ายขวาเหมือนที่ผู้เล่นเห็น
        const radius = parseFloat(getComputedStyle(el.parentElement).borderRadius) * k || 0;
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
        else ctx.rect(x, y, w, h);
        ctx.clip();
        drawCover(ctx, el, el.videoWidth, el.videoHeight, x, y, w, h, true);
        ctx.restore();
      }
      return;
    }

    if (el.tagName === "IMG") {
      if (el.complete && el.naturalWidth) ctx.drawImage(el, x, y, w, h);
      return;
    }

    if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") {
      ctx.fillStyle = cs.backgroundColor;
      const radius = parseFloat(cs.borderRadius) * k || 0;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
      ctx.fill();
    }

    const bg = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage);
    if (bg) {
      const img = getClipImage(bg[1]);
      if (img) ctx.drawImage(img, x, y, w, h);
    }

    // ข้อความของ element นี้เอง (ไม่รวมลูก) วาดตามตำแหน่งจริงบนหน้าจอ
    el.childNodes.forEach((node) => {
      if (node.nodeType !== 3 || !node.textContent.trim()) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      const tr = range.getBoundingClientRect();
      if (!tr.width) return;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) * k}px ${cs.fontFamily}`;
      ctx.fillStyle = cs.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        node.textContent.trim(),
        (tr.left - rootRect.left) * k,
        (tr.top - rootRect.top + tr.height / 2) * k,
        tr.width * k
      );
    });
  });
}

function PlayScreen({ level, onFinish, challenge = null }) {
  const videoRef = useRef(null);
  const startTimeRef = useRef(0);       // เวลาที่เริ่มเล่น (หลังกล้องพร้อม)
  const finishedRef = useRef(false);    // กันจบด่านซ้ำสองรอบ
  const onFinishRef = useRef(onFinish);
  const missionIndexRef = useRef(0);    // กำลังทำภารกิจที่เท่าไร (เริ่มที่ 0)
  const completedRef = useRef(0);
  const trackerRef = useRef(null);      // ตัวติดตามท่าของภารกิจปัจจุบัน
  const repsRef = useRef(0);
  const hintRef = useRef("");
  const questPassedRef = useRef(false);  // โหมดด่าน: เควสปัจจุบันตรวจเจอว่าทำท่าถูกแล้วหรือยัง (ไม่แสดงให้ผู้เล่นเห็น)
  const questStartRef = useRef(0);       // โหมดด่าน: เวลาที่เควสปัจจุบันเริ่ม
  const phaseRef = useRef("countdown");  // countdown = เตรียมพร้อม 5 วินาที | playing = เริ่มเล่นจริง
  const countdownEndRef = useRef(0);     // เวลาที่การนับถอยหลังเตรียมพร้อมจบ
  const countdownShownRef = useRef(READY_SECONDS);

  // โหมดด่าน = จับเวลาต่อเควส / โหมดชาเล้นจ์ประจำวัน = นับถอยหลัง 60 วินาที แล้วนับจำนวนครั้งที่ทำถูก
  const questSeconds = challenge ? CHALLENGE_SECONDS : levelRule(level).seconds;

  // สุ่มภารกิจของด่านนี้ครั้งเดียวตอนเข้าด่าน
  // missions = ท่าของแต่ละเควส (ชาเล้นจ์มีท่าเดียว)
  const [{ missions }] = useState(() => {
    if (challenge) {
      const pose = POSES.find((item) => item.id === challenge.id);
      return { missions: pose ? [pose] : [] };
    }
    return { missions: pickMissions(level) };
  });
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorText, setErrorText] = useState("");
  const [missionIndex, setMissionIndex] = useState(0);
  const [stars, setStars] = useState(0); // ดาวที่ได้ตอนนี้ในด่าน (เริ่มที่ 0)
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState(questSeconds); // เวลาที่เหลือของเควสนี้ (วินาที)
  const [hint, setHint] = useState("");
  const [phase, setPhase] = useState("countdown");       // countdown | playing
  const [countdown, setCountdown] = useState(READY_SECONDS);

  // เก็บฟังก์ชันล่าสุดไว้ให้ลูปกล้องเรียกใช้
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  const recorderRef = useRef(null);      // ตัวอัดคลิป (อัดภาพกล้องของผู้เล่น)
  const chunksRef = useRef([]);
  const rootRef = useRef(null);          // กรอบหน้าเล่น (ใช้วาดลง canvas เพื่ออัดคลิป)
  const clipCanvasRef = useRef(null);
  const clipTimerRef = useRef(0);

  // เตรียม canvas สำหรับอัดคลิป (เรียกตอนกล้องพร้อม เพื่อให้รูปพื้นหลังโหลดทันก่อนเริ่มอัด)
  function prepareClipCanvas() {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (!rect.width) return;
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = Math.round((360 * rect.height) / rect.width);
    clipCanvasRef.current = canvas;
    paintGameScene(canvas.getContext("2d"), root, canvas.width, canvas.height);
  }

  // เริ่มอัดคลิปภาพในเกม (เรียกตอนครบเวลาเตรียมพร้อม) ถ้าอัดไม่ได้ก็ข้าม เกมเล่นต่อได้ปกติ
  function startRecording() {
    try {
      const mime = pickRecorderMime();
      const canvas = clipCanvasRef.current;
      const root = rootRef.current;
      if (mime === null || !canvas || !root || !canvas.captureStream) return;
      const ctx = canvas.getContext("2d");
      clipTimerRef.current = setInterval(
        () => paintGameScene(ctx, root, canvas.width, canvas.height),
        1000 / 15
      );
      const options = { videoBitsPerSecond: 1200000 };
      if (mime) options.mimeType = mime;
      const rec = new MediaRecorder(canvas.captureStream(15), options);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start(1000);
      recorderRef.current = rec;
    } catch (err) {
      console.error("อัดคลิปไม่สำเร็จ", err);
      clearInterval(clipTimerRef.current);
      recorderRef.current = null;
    }
  }

  // หยุดอัดแล้วส่งไฟล์คลิปให้ callback (ไม่มีคลิป = null)
  function stopRecording(callback) {
    clearInterval(clipTimerRef.current);
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec || rec.state === "inactive") {
      callback(null);
      return;
    }
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      chunksRef.current = [];
      callback(blob.size > 0 ? blob : null);
    };
    try {
      rec.stop();
    } catch {
      callback(null);
    }
  }

  // ไปภารกิจถัดไป หรือจบด่านถ้าเป็นภารกิจสุดท้าย
  // skipped=true คือกดข้าม (หัก 1 ดาว และไม่นับว่าทำเควสสำเร็จ)
  const advance = useCallback(
    (skipped) => {
      if (finishedRef.current) return;
      // กดข้าม = ไม่ผ่านเควสนี้เลย (ไม่หักดาว)
      // โหมดด่านหมดเวลา: นับเฉพาะเควสที่ตรวจเจอว่าทำท่าถูก (ชาเล้นจ์ใช้จำนวนครั้งแทน ไม่ผ่านตรงนี้)
      if (!skipped && !challenge && questPassedRef.current) completedRef.current += 1;

      if (missionIndexRef.current >= missions.length - 1) {
        finishedRef.current = true;
        const started = startTimeRef.current;
        const seconds = started
          ? Math.round((performance.now() - started) / 1000)
          : 0;
        // ดาวของด่าน = ดาวจากสัดส่วนเควสที่ผ่าน (กดข้ามไม่หักดาว แค่ไม่นับว่าผ่าน)
        // ชาเล้นจ์: ดาวจากจำนวนครั้งที่ทำถูกตลอด 60 วินาที
        const finalStars = challenge
          ? starsFromReps(repsRef.current)
          : starsFromPassed(completedRef.current, missions.length);
        const finalResult = {
          stars: finalStars,
          completed: completedRef.current,
          total: missions.length,
          reps: repsRef.current,
          seconds,
          challengeId: challenge?.id ?? null,
        };
        // หยุดอัดคลิปก่อน แล้วค่อยแจ้งผลจบเกม (แนบคลิปไปด้วย)
        stopRecording((clipBlob) => onFinishRef.current({ ...finalResult, clipBlob }));
        return;
      }

      missionIndexRef.current += 1;
      trackerRef.current = new PoseTracker(missions[missionIndexRef.current]);
      repsRef.current = 0;
      questPassedRef.current = false;
      questStartRef.current = performance.now();
      setStars(starsFromPassed(completedRef.current, missions.length));
      setMissionIndex(missionIndexRef.current);
      setRemaining(questSeconds);
      if (!challenge) playSound("quest"); // เควสถัดไปมาถึง
    },
    [missions, challenge, questSeconds]
  );

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let landmarker = null;
    let rafId = 0;
    let lastTime = -1;

    if (!trackerRef.current) {
      trackerRef.current = new PoseTracker(missions[missionIndexRef.current]);
    }

    // ปิดกล้องและโมเดล (เรียกซ้ำกี่รอบก็ไม่พัง)
    function cleanupAll() {
      cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      if (landmarker) {
        try {
          landmarker.close();
        } catch {
          /* ปิดไปแล้ว */
        }
        landmarker = null;
      }
    }

    function loop() {
      if (cancelled) return;
      const video = videoRef.current;

      // ช่วงเตรียมพร้อม: ยังไม่เริ่มภารกิจ ไม่จับเวลา และไม่นับท่า
      if (phaseRef.current === "countdown") {
        const left = countdownEndRef.current - performance.now();
        if (left > 0) {
          const n = Math.ceil(left / 1000);
          if (n !== countdownShownRef.current) {
            countdownShownRef.current = n;
            setCountdown(n);
          }
          rafId = requestAnimationFrame(loop);
          return;
        }
        // ครบเวลาเตรียมพร้อม: เริ่มภารกิจและเริ่มจับเวลา
        phaseRef.current = "playing";
        const now = performance.now();
        startTimeRef.current = now;
        questStartRef.current = now;
        trackerRef.current = new PoseTracker(missions[missionIndexRef.current]);
        repsRef.current = 0;
        startRecording(); // เริ่มอัดคลิปภาพในเกมหลังนับถอยหลังเตรียมพร้อมจบ
        setPhase("playing");
      }

      // หมดเวลา: โหมดด่าน -> ไปเควสถัดไป (ผ่านแล้วก็ต้องรอจนหมดเวลา) / ชาเล้นจ์ -> จบและสรุปผล
      if (performance.now() - questStartRef.current >= questSeconds * 1000) {
        advance(false);
        if (finishedRef.current) {
          cleanupAll(); // จบแล้ว ปิดกล้องและหยุดตรวจ
          return;
        }
      }

      if (video && video.readyState >= 2 && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());
        const aspect = video.videoWidth / video.videoHeight;
        const r = trackerRef.current.update(result.landmarks[0], aspect);

        // ข้อความช่วยเหลือบนภาพกล้อง
        let nextHint = "";
        if (r.status === "no_person") nextHint = "ไม่พบตัวคุณ ลองยืนให้อยู่ในกล้อง";
        else if (r.status === "not_visible") nextHint = "ถอยให้กล้องเห็นตัวคุณชัดขึ้น";
        else if (r.note) nextHint = r.note;
        if (nextHint !== hintRef.current) {
          hintRef.current = nextHint;
          setHint(nextHint);
        }

        if (!challenge) {
          // โหมดด่าน: ตรวจเจอว่าทำท่าถูกอย่างน้อย 1 ครั้ง = ผ่านเควสนี้ (ไม่มีเสียง)
          // ผ่านแล้วอัปเดตดาวบนหน้าจอทันที ถ้าสัดส่วนเควสที่ผ่านถึงเกณฑ์ดาวเพิ่ม
          if (r.reps >= 1 && !questPassedRef.current) {
            questPassedRef.current = true;
            setStars(starsFromPassed(completedRef.current + 1, missions.length));
          }
        } else if (r.reps !== repsRef.current) {
          // ชาเล้นจ์: นับจำนวนครั้งที่ทำถูกแบบเงียบๆ (ไม่แสดงตัวเลข ไม่มีเสียง)
          // ดาวบนหน้าจอเพิ่มตามเกณฑ์ (2 / 10 / 20 ครั้ง) เริ่มต้นที่ 0 ดาว
          repsRef.current = r.reps;
          setStars(starsFromReps(r.reps));
        }
      }
      rafId = requestAnimationFrame(loop);
    }

    async function start() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (cancelled) return cleanupAll();

        // ไม่ล็อกสัดส่วน 9:16 แล้ว เพราะมือถือจะตัด (crop) ภาพจากเซ็นเซอร์ให้แคบลง ทำให้ภาพดูซูม
        // ปล่อยให้ได้สัดส่วนเต็มของเซ็นเซอร์ (4:3) เหมือนแอปกล้องปกติ มุมมองจะกว้างที่สุด
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) return cleanupAll();

        // ถ้าเครื่องรองรับซูม (ส่วนใหญ่ Android) ให้ตั้งไปที่ซูมต่ำสุด = มุมกว้างสุด
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track.getCapabilities ? track.getCapabilities() : {};
          if (caps.zoom) {
            await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
          }
        } catch {
          /* ตั้งซูมไม่ได้ก็ข้ามไป */
        }

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return cleanupAll();

        // กล้องพร้อมแล้ว: เริ่มนับถอยหลังเตรียมพร้อม (เวลาเล่นจะเริ่มนับเมื่อครบ)
        phaseRef.current = "countdown";
        countdownEndRef.current = performance.now() + READY_SECONDS * 1000;
        countdownShownRef.current = READY_SECONDS;
        setCountdown(READY_SECONDS);
        setStatus("ready");
        setTimeout(prepareClipCanvas, 100); // รอให้หน้าวาดเสร็จก่อนค่อยเตรียม canvas
        rafId = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setErrorText(
          err && err.name === "NotAllowedError"
            ? "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณากดอนุญาตแล้วลองใหม่"
            : "เปิดกล้องหรือโหลดระบบตรวจจับไม่สำเร็จ"
        );
        setStatus("error");
      }
    }

    start();

    // ออกจากหน้านี้เมื่อไร ปิดกล้องทุกครั้ง
    return () => {
      cancelled = true;
      clearInterval(clipTimerRef.current);
      // ออกจากหน้ากลางคัน: ทิ้งคลิปที่อัดค้างอยู่
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive" && !finishedRef.current) {
        rec.onstop = null;
        try {
          rec.stop();
        } catch {
          /* หยุดไปแล้ว */
        }
        recorderRef.current = null;
      }
      cleanupAll();
    };
  }, [advance, missions, challenge, questSeconds]);

  // นาฬิกานับเวลาที่ใช้ (เริ่มเมื่อกล้องพร้อม)
  useEffect(() => {
    if (status !== "ready" || phase !== "playing") return;
    const id = setInterval(() => {
      if (!finishedRef.current) {
        setElapsed(Math.floor((performance.now() - startTimeRef.current) / 1000));
        const left = questSeconds - (performance.now() - questStartRef.current) / 1000;
        setRemaining(Math.max(0, Math.ceil(left)));
      }
    }, 250);
    return () => clearInterval(id);
  }, [status, phase, questSeconds]);

  const mission = missions[missionIndex];
  const shownStars = stars; // เริ่มที่ 0 ดาว แล้วเพิ่มตามเกณฑ์ที่ทำได้ (ทั้งด่านและชาเล้นจ์)

  return (
    <div
      ref={rootRef}
      className="screen"
      style={{ backgroundImage: `url(${ASSETS.wallpaperIngame})` }}
    >
      {/* กล่องภารกิจบนสุด */}
      <div
        className="mission-box"
        style={{
          left: `${MISSION_BOX_LEFT}cqw`,
          bottom: `${MISSION_BOX_BOTTOM}cqw`,
          width: `${MISSION_BOX_W}cqw`,
          aspectRatio: "1028 / 512",
          backgroundImage: `url(${ASSETS.missionBackground})`,
        }}
      >
<div className="mission-title">
  {challenge ? "ชาเล้นจ์ประจำวัน" : `ด่านที่ ${level} - เควสที่ ${missionIndex + 1}/${missions.length}`}
</div>

<div className="mission-detail">
  {`${missionName(mission)} เหลือ ${remaining} วินาที`}
</div>
       <div className="mission-footer">
  <Stars earned={shownStars} className="mission-stars" />

  {!challenge && (
    <ImageButton
      width={23}
      fontSize={4}
      sound="skip"
      onClick={() => phaseRef.current === "playing" && advance(true)}
    >
      ข้าม
    </ImageButton>
  )}
</div>
      </div>

      {/* ภาพกล้องขยายเต็มพื้นที่ใต้กล่องภารกิจ */}
      <div
        className="camera-window"
        style={{
          left: `${CAMERA_SIDE}cqw`,
          right: `${CAMERA_SIDE}cqw`,
          top: `${CAMERA_TOP}cqw`,
          bottom: `${CAMERA_BOTTOM}cqw`,
        }}
      >
        <video ref={videoRef} playsInline muted />
        {status === "loading" && (
          <div className="camera-message">กำลังเปิดกล้อง...</div>
        )}
        {status === "error" && <div className="camera-message">{errorText}</div>}
        {status === "ready" && phase === "playing" && hint && (
          <div className="camera-hint">{hint}</div>
        )}
        {status === "ready" && phase === "countdown" && (
          <div className="countdown-overlay">
            <span className="countdown-label">เตรียมพร้อม</span>
            <span className="countdown-number">{countdown}</span>
          </div>
        )}
      </div>

      {/* เวลาที่ใช้ มุมขวาล่าง */}
      <div className="time-box" style={{ width: `${TIME_BOX_W}cqw` }}>
        <img src={ASSETS.timeBackground} alt="" draggable="false" />
        <span>{formatClock(elapsed)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   7) หน้าสรุปผลหลังชนะ
------------------------------------------------------------------ */
/* ------------------------------------------------------------------
   คลิปย้อนหลังทั้งหมด เก็บใน IndexedDB ของเครื่อง (localStorage เล็กเกินไปสำหรับวิดีโอ)
   เก็บได้ MAX_CLIPS คลิป เกินแล้วคลิปเก่าสุดจะถูกลบ แล้วคลิปใหม่ขึ้นแทน
------------------------------------------------------------------- */
const MAX_CLIPS = 10;
const CLIP_DB_NAME = "sweet-moves-clips";
const CLIP_STORE = "clips";

function openClipDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CLIP_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(CLIP_STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ดึงคลิปทั้งหมด เรียงใหม่สุดก่อน
async function listClips() {
  const db = await openClipDb();
  try {
    const all = await idbRequest(db.transaction(CLIP_STORE).objectStore(CLIP_STORE).getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

// บันทึกคลิปใหม่ แล้วลบคลิปเก่าสุดที่เกิน MAX_CLIPS
async function saveClip({ blob, label, stars }) {
  const db = await openClipDb();
  try {
    const store = () => db.transaction(CLIP_STORE, "readwrite").objectStore(CLIP_STORE);
    await idbRequest(store().add({ blob, label, stars, createdAt: Date.now() }));
    const all = (await idbRequest(store().getAll())).sort((a, b) => b.createdAt - a.createdAt);
    for (const old of all.slice(MAX_CLIPS)) {
      await idbRequest(store().delete(old.id));
    }
  } finally {
    db.close();
  }
}

async function deleteClip(id) {
  const db = await openClipDb();
  try {
    await idbRequest(db.transaction(CLIP_STORE, "readwrite").objectStore(CLIP_STORE).delete(id));
  } finally {
    db.close();
  }
}

async function clearAllClips() {
  const db = await openClipDb();
  try {
    await idbRequest(db.transaction(CLIP_STORE, "readwrite").objectStore(CLIP_STORE).clear());
  } finally {
    db.close();
  }
}

// หน้ารวมคลิปย้อนหลังทั้งหมด (เข้าจากตั้งค่า)
function ClipsScreen({ onBack }) {
  const [clips, setClips] = useState(null); // null = กำลังโหลด
  const [playing, setPlaying] = useState(null); // { url } ของคลิปที่กำลังดู

  const reload = useCallback(() => {
    listClips()
      .then(setClips)
      .catch((err) => {
        console.error(err);
        setClips([]);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // คืนหน่วยความจำของคลิปที่เปิดดูเมื่อปิดหรือออกจากหน้า
  useEffect(() => {
    return () => {
      if (playing) URL.revokeObjectURL(playing.url);
    };
  }, [playing]);

  if (playing) {
    return <ReplayScreen clipUrl={playing.url} onBack={() => setPlaying(null)} />;
  }

  return (
    <div
      className="screen"
      style={{ backgroundImage: `url(${ASSETS.wallpaperIngame})` }}
    >
      <ScreenTitle>คลิปย้อนหลัง</ScreenTitle>

      <div className="clips-list">
        {clips === null && <p className="clips-empty">กำลังโหลด...</p>}
        {clips && clips.length === 0 && (
          <p className="clips-empty">ยังไม่มีคลิปบันทึกการเล่น</p>
        )}
        {clips &&
          clips.map((clip) => (
            <div className="clip-row" key={clip.id}>
              <button
                className="clip-main"
                onClick={() =>
                  setPlaying({ url: URL.createObjectURL(clip.blob) })
                }
              >
                <span className="clip-label">{clip.label}</span>
                <span className="clip-date">
                  {new Date(clip.createdAt).toLocaleString("th-TH", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <Stars earned={clip.stars ?? 0} className="clip-stars" />
              </button>
              <button
                className="clip-delete"
                onClick={() => deleteClip(clip.id).then(reload).catch(console.error)}
              >
                ลบ
              </button>
            </div>
          ))}
      </div>

      <p className="clips-note">เก็บได้สูงสุด {MAX_CLIPS} คลิป</p>

      <div className="replay-buttons">
        <ImageButton width={48} fontSize={5.2} onClick={onBack}>
          ย้อนกลับ
        </ImageButton>
      </div>
    </div>
  );
}

// หน้าดูคลิปย้อนหลัง (คลิปภาพกล้องของผู้เล่น ตั้งแต่เริ่มเล่นหลังนับถอยหลังจนจบ)
function ReplayScreen({ clipUrl, onBack }) {
  return (
    <div
      className="screen"
      style={{ backgroundImage: `url(${ASSETS.wallpaperIngame})` }}
    >
      <div className="replay-box">
        <video
          className="replay-video"
          src={clipUrl}
          controls
          autoPlay
          playsInline
          onLoadedMetadata={(e) => {
            // คลิปจาก MediaRecorder (webm) มักไม่มีความยาวในไฟล์ ทำให้ลากแถบเวลาไม่ได้ ต้องกระตุ้นให้คำนวณความยาว
            const v = e.currentTarget;
            if (v.duration === Infinity) {
              v.currentTime = 1e101;
              v.addEventListener(
                "timeupdate",
                () => {
                  v.currentTime = 0;
                },
                { once: true }
              );
            }
          }}
        />
      </div>
      <div className="replay-buttons">
        <ImageButton width={48} fontSize={5.2} onClick={onBack}>
          ย้อนกลับ
        </ImageButton>
      </div>
    </div>
  );
}

function ResultScreen({ result, onBackToMenu, onReplay, onWatchClip, hasClip = false, isChallenge = false }) {
  if (isChallenge) {
    const passed = result.stars > 0;
    return (
      <div
        className="screen"
        style={{ backgroundImage: `url(${ASSETS.wallpaperIngame})` }}
      >
        <img className="ingame-panel" src={ASSETS.ingamePanel} alt="" draggable="false" />

        <div className="result-content">
          <Stars earned={result.stars} className="result-stars" />
          <p className="result-title">
            {passed ? `สำเร็จ! ได้รับ ${result.stars} ดาว` : "ชาเล้นจ์ไม่สำเร็จ"}
          </p>
          <p className="result-line">ทำท่าถูกต้อง: {result.reps ?? 0} ครั้ง</p>
          <p className="result-line">
            {!passed
              ? "ไม่ได้รับรางวัล ลองใหม่อีกครั้ง"
              : result.rewarded
              ? "ได้รับรางวัล: 1 คะแนนภารกิจ"
              : "รับรางวัลชาเล้นจ์นี้ไปแล้ว"}
          </p>
        </div>

        <div className="result-buttons">
          {hasClip && (
            <ImageButton width={48} fontSize={5.2} onClick={onWatchClip}>
              ดูคลิปย้อนหลัง
            </ImageButton>
          )}
          <ImageButton width={48} fontSize={5.2} onClick={onBackToMenu}>
            กลับสู่ชาเล้นจ์
          </ImageButton>
          <ImageButton width={48} fontSize={5.2} onClick={onReplay}>
            เล่นอีกครั้ง
          </ImageButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className="screen"
      style={{ backgroundImage: `url(${ASSETS.wallpaperIngame})` }}
    >
      <img className="ingame-panel" src={ASSETS.ingamePanel} alt="" draggable="false" />

      <div className="result-content">
        <Stars earned={result.stars} className="result-stars" />
        <p className="result-title">ได้รับ {result.stars} ดาว!</p>
        <p className="result-line">
          ทำเควสสำเร็จ: {result.completed}/{result.total}
        </p>
        <p className="result-line">เวลาที่ใช้: {formatTime(result.seconds)}</p>
      </div>

      <div className="result-buttons">
        {hasClip && (
          <ImageButton width={48} fontSize={5.2} onClick={onWatchClip}>
            ดูคลิปย้อนหลัง
          </ImageButton>
        )}
        <ImageButton width={48} fontSize={5.2} onClick={onBackToMenu}>
          กลับสู่เมนูหลัก
        </ImageButton>
        <ImageButton width={48} fontSize={5.2} onClick={onReplay}>
          เล่นอีกครั้ง
        </ImageButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   8) หน้าเปล่าจากแถบเมนู (อันดับ / หีบสมบัติ / ภารกิจ) ยังไม่มีเนื้อหา
------------------------------------------------------------------ */
function BlankScreen({ wallpaper }) {
  return (
    <div className="screen" style={{ backgroundImage: `url(${wallpaper})` }} />
  );
}

/* ------------------------------------------------------------------
   9) แถบเมนูด้านล่าง (Background_Button เป็นพื้นหลังแถบ มีไอคอน 3 อันเรียงซ้ายไปขวา)
------------------------------------------------------------------ */
// ตัดขอบโปร่งใสรอบรูปออก (ถ้ามี) เพื่อให้ได้เฉพาะตัวแถบจริงๆ
// คืนค่า { url, ratio } เมื่อพร้อม (ratio = กว้าง/สูง) หรือ null ระหว่างโหลด
function useTrimmedImage(src) {
  const [trimmed, setTrimmed] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    const img = new Image();

    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;

        // หากรอบของส่วนที่ไม่โปร่งใส
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 20) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return; // รูปโปร่งใสทั้งภาพ

        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const out = document.createElement("canvas");
        out.width = cw;
        out.height = ch;
        out.getContext("2d").drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
        out.toBlob((blob) => {
          if (!blob || cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setTrimmed({ url: objectUrl, ratio: cw / ch });
        });
      } catch {
        /* ตัดไม่ได้ก็ใช้รูปเดิม */
      }
    };
    img.src = src;

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return trimmed;
}

function BottomNav({ active, onSelect }) {
  const trimmed = useTrimmedImage(ASSETS.navBackground);

  // ถ้าตัดขอบแล้วได้แถบยาวจริง ใช้สัดส่วนนั้น
  // ถ้ารูปไม่ได้เป็นแถบยาว (เช่น เต็มสี่เหลี่ยม) ยืดให้เป็นแถบตามรูปตัวอย่างดีไซน์
  const isWideBar = trimmed && trimmed.ratio >= 2.5;
  const barUrl = isWideBar ? trimmed.url : ASSETS.navBackground;
  const ratio = isWideBar ? trimmed.ratio : NAV_FALLBACK_RATIO;
  const barHeight = NAV_WIDTH / ratio; // cqw

  return (
    <nav
      className="bottom-nav"
      style={{
        width: `${NAV_WIDTH}cqw`,
        height: `${barHeight}cqw`,
        backgroundImage: `url(${barUrl})`,
        "--icon-h": `${barHeight * NAV_ICON_SCALE}cqw`,
      }}
    >
      {NAV_TABS.map((tab) => (
        <button
          key={tab.id}
          className={`nav-button ${active === tab.id ? "active" : ""}`}
          aria-label={tab.label}
          onClick={() => onSelect(tab.id)}
        >
          <img src={tab.icon} alt="" draggable="false" />
        </button>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------
   10) หน้าต่างตั้งค่า (อยู่ชั้นบนสุดของจอ)
------------------------------------------------------------------ */
function SettingsPanel({ values, onToggle, onClose, isInGame, onExitGame, onLogout, onOpenClips, hideClips }) {
  const [confirming, setConfirming] = useState(false);

  // หน้าต่างยืนยันออกจากระบบ
  if (confirming) {
    return (
      <div className="settings-backdrop" onClick={() => setConfirming(false)}>
        <div
          className="settings-panel confirm-panel"
          style={{ backgroundImage: `url(${ASSETS.settingsBackground})` }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="settings-title">ออกจากระบบ</h2>
          <p className="confirm-text">
            ต้องการออกจากระบบหรือไม่?
            <br />
            ข้อมูลของผู้เล่นจะถูกลบทั้งหมดและกู้คืนไม่ได้
          </p>
          <div className="confirm-buttons">
            <ImageButton width={44} fontSize={4.6} onClick={onLogout}>
              ยืนยันออกระบบ
            </ImageButton>
            <ImageButton width={44} fontSize={4.6} onClick={() => setConfirming(false)}>
              ยกเลิก
            </ImageButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    // กดพื้นที่ด้านนอกกล่อง = ปิด
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-panel"
        style={{ backgroundImage: `url(${ASSETS.settingsBackground})` }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="settings-title">ตั้งค่า</h2>

        <div className="settings-rows">
          {SETTINGS_OPTIONS.map((opt) => {
            const isOn = values[opt.id];
            return (
              <div className="settings-row" key={opt.id}>
                <span className="settings-label">{opt.label}</span>
                <button
                  className="toggle-button"
                  aria-pressed={isOn}
                  onClick={() => onToggle(opt.id)}
                >
                  <img
                    src={isOn ? ASSETS.buttonOpen : ASSETS.buttonClose}
                    alt={isOn ? "เปิด" : "ปิด"}
                    draggable="false"
                  />
                </button>
              </div>
            );
          })}
        </div>

        <div className="settings-logout">
          {!isInGame && !hideClips && (
       <ImageButton width={40} fontSize={5.2} onClick={onOpenClips}>
        ดูคลิปย้อนหลัง
       </ImageButton>
)}
          {isInGame ? (
            <ImageButton width={40} fontSize={5.2} onClick={onExitGame}>
              ออกจากเกม
            </ImageButton>
          ) : (
            <ImageButton width={40} fontSize={5.2} onClick={() => setConfirming(true)}>
              ออกจากระบบ
            </ImageButton>
          )}
        </div>
      </div>
    </div>
  );
}
/* ------------------------------------------------------------------
   หน้าตั้งชื่อเล่น (ขึ้นครั้งแรกที่เข้าเกม)
------------------------------------------------------------------ */
function NameScreen({ onSubmit }) {
  const [value, setValue] = useState("");
  const clean = value.trim().slice(0, 20);

  return (
    <div
      className="screen name-screen"
      style={{ backgroundImage: `url(${ASSETS.wallpaperYellow})` }}
    >
      <div className="name-box">
        <p className="name-title">ตั้งชื่อเล่นของคุณ</p>
        <input
          className="name-input"
          value={value}
          maxLength={20}
          placeholder="กรอกชื่อของคุณ"
          onChange={(e) => setValue(e.target.value)}
        />
        <ImageButton width={40} fontSize={5.2} onClick={() => clean && onSubmit(clean)}>
          ตกลง
        </ImageButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   หน้าอันดับประจำเดือน (10 อันดับแรก)
------------------------------------------------------------------ */
function RankScreen({ playerName, points }) {
  const [rows, setRows] = useState(null); // null = กำลังโหลด
  const [me, setMe] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTop10(), fetchMyScore()])
      .then(([top, mine]) => {
        if (cancelled) return;
        setRows(top);
        setMe(mine);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const myUid = me?.uid;
  const inTop = rows?.some((r) => r.uid === myUid);

  return (
    <div className="screen" style={{ backgroundImage: `url(${ASSETS.wallpaperCastle})` }}>
      <ScreenTitle>อันดับประจำเดือน</ScreenTitle>

      <div className="rank-panel">
        {/* แถบผู้เล่น (List_Player.png): ชื่อผู้เล่น ---- คะแนนภารกิจที่มี + ดาวสีน้ำเงิน */}
        <div
          className="rank-player"
          style={{ backgroundImage: `url(${ASSETS.listPlayer})` }}
        >
          <span className="rank-player-name">{playerName}</span>
          <span className="rank-player-score">
            {points}
            <img src={ASSETS.starBlue} alt="" draggable="false" />
          </span>
        </div>

        {failed && <p className="rank-empty">โหลดอันดับไม่สำเร็จ ลองใหม่อีกครั้ง</p>}
        {!failed && rows === null && <p className="rank-empty">กำลังโหลด...</p>}
        {rows?.length === 0 && <p className="rank-empty">ยังไม่มีใครมีคะแนนในเดือนนี้</p>}

        {rows?.map((r) => (
          <div className={`rank-row ${r.uid === myUid ? "me" : ""}`} key={r.uid}>
            <span className="rank-no">{r.rank}</span>
            <span className="rank-name">{r.name}</span>
            <span className="rank-score">
              {r.points}
              <img src={ASSETS.starBlue} alt="" draggable="false" />
            </span>
          </div>
        ))}

        {rows && me && !inTop && (
          <div className="rank-row me rank-mine">
            <span className="rank-no">-</span>
            <span className="rank-name">{playerName}</span>
            <span className="rank-score">
              {me.points}
              <img src={ASSETS.starBlue} alt="" draggable="false" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
/* ------------------------------------------------------------------
   11) App: คุมว่าตอนนี้อยู่หน้าไหน
------------------------------------------------------------------ */
const NAME_KEY = "sweet-moves-player-name";

function loadPlayerName() {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

function savePlayerName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* เซฟไม่ได้ก็ข้ามไป */
  }
}

export default function App() {
  const [screen, setScreen] = useState("stage"); // "stage" | "play" | "result"
  const [currentLevel, setCurrentLevel] = useState(1);
  const [progress, setProgress] = useState(loadProgress); // { เลขด่าน: จำนวนดาว }
  const [bestTimes, setBestTimes] = useState(loadBestTimes); // { เลขด่าน: วินาทีที่เร็วที่สุด }
  const [dailyData, setDailyData] = useState(loadDailyData);
  const [points, setPoints] = useState(loadPoints);
  const [playerName, setPlayerName] = useState(loadPlayerName);
  const stageScrollRef = useRef(null); // ตำแหน่งเลื่อนล่าสุดของแผนที่ (หน่วย cqw)
const [result, setResult] = useState(null);
const [activeChallenge, setActiveChallenge] = useState(null);
const [clipUrl, setClipUrl] = useState(null); // คลิปย้อนหลังของรอบล่าสุด
const [clipsReturnScreen, setClipsReturnScreen] = useState("stage"); // หน้าที่กลับไปหลังปิดหน้ารวมคลิป
const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS); // ยังไม่มีผลกับเกมจริง

  // โหลดเสียงไว้ล่วงหน้าตอนเปิดเกม beta
  useEffect(() => {
    preloadSounds();
  }, []);

  // ปุ่ม "เสียง" ในหน้าตั้งค่า เปิด/ปิดเสียง effect จริง
  useEffect(() => {
    setSfxEnabled(settings.sfx);
  }, [settings.sfx]);

  // ค่าล่าสุดที่ตัวจับเวลา (interval) ต้องใช้ เก็บใน ref เพราะ interval ถูกสร้างครั้งเดียว
  const dailyRef = useRef(dailyData);
  dailyRef.current = dailyData;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;
  const onlineRef = useRef(dailyData.onlineSeconds ?? 0); // วินาทีออนไลน์ของวันนี้
  const onlineDayRef = useRef(dailyData.createdAt);
  const lastTickRef = useRef(Date.now());

  // ทุก 1 วินาที: เปลี่ยนชุดภารกิจเมื่อครบวัน + นับเวลาออนไลน์ (นับเฉพาะตอนหน้าเกมเปิดอยู่)
  useEffect(() => {
    const timer = setInterval(() => {
      const nowMs = Date.now();
      const elapsed = Math.min((nowMs - lastTickRef.current) / 1000, 5);
      lastTickRef.current = nowMs;
      const current = dailyRef.current;

      if (current.expiresAt <= nowMs) {
        const fresh = createDailyData();
        saveDailyData(fresh);
        dailyRef.current = fresh;
        setDailyData(fresh);
        return;
      }

      // เริ่มวันใหม่ -> เริ่มนับเวลาออนไลน์ใหม่
      if (onlineDayRef.current !== current.createdAt) {
        onlineDayRef.current = current.createdAt;
        onlineRef.current = current.onlineSeconds ?? 0;
      }
      if (document.visibilityState === "visible") onlineRef.current += elapsed;

      // อัปเดตและเซฟทุก 15 วินาที (ไม่ต้องเซฟทุกวินาที)
      const bucket = Math.floor(onlineRef.current / 15) * 15;
      if (bucket === (current.onlineSeconds ?? 0)) return;
      const { daily: updated, earned } = applyMissionEvent(
        { ...current, onlineSeconds: bucket },
        { type: "online", seconds: bucket }
      );
      dailyRef.current = updated;
      setDailyData(updated);
      saveDailyData(updated);
      if (earned > 0) {
        setPoints((prev) => {
          const next = prev + earned;
          savePoints(next);
          return next;
        });
        addMonthlyPoints(playerNameRef.current, earned).catch(console.error);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function startLevel(level) {
  setCurrentLevel(level);
  setClip(null);
  setScreen("play");
}

  function startChallenge(challenge) {
  setActiveChallenge(challenge);
  setResult(null);
  setClip(null);
  setScreen("challengePlay");
}

  // เก็บคลิปรอบล่าสุดเป็น object URL และคืนหน่วยความจำของคลิปเก่า
  function setClip(blob) {
    setClipUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }

  // เก็บคลิปของรอบนี้ลงที่เก็บคลิปทั้งหมด (เกิน 10 คลิปจะลบเก่าสุดให้เอง)
  function archiveClip(blob, label, stars) {
    if (!blob) return;
    saveClip({ blob, label, stars }).catch((err) => console.error("บันทึกคลิปไม่สำเร็จ", err));
  }

  // ออกจากระบบ: ลบข้อมูลผู้เล่นคนนี้ทั้งหมดทันที แล้วกลับไปหน้าตั้งชื่อใหม่
  function logout() {
    try {
      [STORAGE_KEY, TIMES_KEY, DAILY_MISSIONS_KEY, POINTS_KEY, NAME_KEY].forEach((key) =>
        localStorage.removeItem(key)
      );
    } catch {
      /* ลบไม่ได้ก็ข้ามไป */
    }
    const fresh = createDailyData();
    saveDailyData(fresh);
    dailyRef.current = fresh;
    onlineRef.current = 0;
    setProgress({});
    setBestTimes({});
    setDailyData(fresh);
    setPoints(0);
    setPlayerName("");
    setResult(null);
    setClip(null);
    clearAllClips().catch(console.error);
    setActiveChallenge(null);
    stageScrollRef.current = null;
    setSettingsOpen(false);
    setScreen("stage");
  }

  function replayChallenge() {
    setResult(null);
    setClip(null);
    setScreen("challengePlay");
  }

  function toggleSetting(id) {
    setSettings((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // เล่นเสียงทุกครั้งที่กดปุ่มในเกม (ดักที่กรอบเกมกรอบเดียว) beta
  function handleFrameClick(e) {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    const type = btn.dataset.sound;
    if (type === "none") return;
    playSound(type || "click");
  }

  // กดปุ่มบนแถบเมนู: กดปุ่มของหน้าที่เปิดอยู่ซ้ำ = กลับหน้าเลือกด่าน
  function selectTab(tabId) {
    setScreen(screen === tabId ? "stage" : tabId);
  }

  function finishLevel(res) {
    // เก็บดาวสูงสุดที่เคยได้ในด่านนั้น
    const best = Math.max(progress[currentLevel] ?? 0, res.stars);
    const next = { ...progress, [currentLevel]: best };
    setProgress(next);
    saveProgress(next);

    // ภารกิจประจำวันแบบ "ผ่านด่านได้ x ดาว" (ตั้งให้นับเฉพาะด่านใหม่ได้ที่ MISSION_NEW_LEVEL_ONLY)
    const isNewLevel = !(progress[currentLevel] > 0);
    if (res.stars > 0 && (!MISSION_NEW_LEVEL_ONLY || isNewLevel)) {
      const currentDaily = dailyData.expiresAt > Date.now() ? dailyData : createDailyData();
      const { daily: updatedDaily, earned } = applyMissionEvent(currentDaily, {
        type: "level",
        stars: res.stars,
      });
      setDailyData(updatedDaily);
      saveDailyData(updatedDaily);
      if (earned > 0) {
        const updatedPoints = points + earned;
        setPoints(updatedPoints);
        savePoints(updatedPoints);
        addMonthlyPoints(playerName, earned).catch(console.error);
      }
    }

    // บันทึกเวลาที่เร็วที่สุดของด่านนี้
    const countsTime =
      res.seconds > 0 && (!TIME_COUNTS_ONLY_WITHOUT_SKIP || res.completed === res.total);
    const prevBest = bestTimes[currentLevel];
    if (countsTime && (!prevBest || res.seconds < prevBest)) {
      const nextTimes = { ...bestTimes, [currentLevel]: res.seconds };
      setBestTimes(nextTimes);
      saveBestTimes(nextTimes);
    }
    if (res.stars > 0) playSound("win"); // ได้ 1-3 ดาวเท่านั้นถึงมีเสียงชนะ
    setClip(res.clipBlob);
    archiveClip(res.clipBlob, `ด่านที่ ${currentLevel}`, res.stars);
    setResult(res);
    setScreen("result");
  }
  function finishChallenge(res) {
    // ผ่านชาเล้นจ์เมื่อได้ตั้งแต่ 1 ดาว (ทำถูกอย่างน้อย 2 ครั้ง) / 0 ดาว = ไม่ผ่าน ไม่ได้รางวัล
    // เล่นซ้ำได้เสมอ: เก็บสถิติ (ครั้งสูงสุด/ดาวสูงสุด) ทุกรอบ แต่รางวัลได้ครั้งเดียวต่อชาเล้นจ์
    const passed = res.stars > 0;
    let rewarded = false;

    const currentDaily =
      dailyData.expiresAt > Date.now() ? dailyData : createDailyData();
    const challenge = currentDaily.challenges.find(
      (item) => item.id === activeChallenge?.id
    );

    if (challenge) {
      rewarded = passed && !challenge.claimed;
      let updatedDaily = {
        ...currentDaily,
        challenges: currentDaily.challenges.map((item) =>
          item.id === challenge.id
            ? {
                ...item,
                best: Math.max(item.best ?? 0, res.reps ?? 0),
                stars: Math.max(item.stars ?? 0, res.stars),
                claimed: item.claimed || passed,
              }
            : item
        ),
      };

      if (rewarded) {
        // ภารกิจประจำวันแบบ "เล่นชาเล้นจ์" นับเพิ่ม 1 ครั้ง (นับตอนผ่านครั้งแรกของแต่ละชาเล้นจ์)
        const applied = applyMissionEvent(updatedDaily, { type: "challenge" });
        updatedDaily = applied.daily;

        // รางวัลชาเล้นจ์ 1 คะแนน + คะแนนจากภารกิจประจำวันที่สำเร็จ
        const gained = 1 + applied.earned;
        const updatedPoints = points + gained;
        setPoints(updatedPoints);
        savePoints(updatedPoints);
        addMonthlyPoints(playerName, gained).catch(console.error);
      }

      setDailyData(updatedDaily);
      saveDailyData(updatedDaily);
    }

    if (passed) playSound("win");
    setClip(res.clipBlob);
    archiveClip(res.clipBlob, `ชาเล้นจ์ ${activeChallenge?.description ?? ""}`.trim(), res.stars);
    setResult({ ...res, rewarded });
    setScreen("challengeResult");
  }

  return (
    <div
      className="game-frame"
      onPointerDownCapture={unlockAudio}
      onClickCapture={handleFrameClick}
    >
      {/* ป้ายเวอร์ชันมุมซ้ายบน แสดงทุกหน้า */}
      <div className="version-badge">Sweet Moves V1.0</div>

      {!playerName && (
        <NameScreen
          onSubmit={(name) => {
            savePlayerName(name);
            setPlayerName(name);
          }}
        />
      )}
      {screen === "stage" && (
        <StageScreen
          progress={progress}
          bestTimes={bestTimes}
          onStartLevel={startLevel}
          scrollMemory={stageScrollRef}
        />
      )}
      {screen === "play" && (
        <PlayScreen key={currentLevel} level={currentLevel} onFinish={finishLevel} />
      )}
      {screen === "challengePlay" && activeChallenge && (
    <PlayScreen
      key={`challenge-${activeChallenge.id}`}
     level={currentLevel}
     challenge={activeChallenge}
     onFinish={finishChallenge}
  />
)}
      {screen === "result" && result && (
        <ResultScreen
          result={result}
          hasClip={!!clipUrl}
          onWatchClip={() => setScreen("replay")}
          onBackToMenu={() => {
            setClip(null);
            setScreen("stage");
          }}
          onReplay={() => startLevel(currentLevel)}
        />
      )}
      {screen === "challengeResult" && result && (
        <ResultScreen
          result={result}
          isChallenge
          hasClip={!!clipUrl}
          onWatchClip={() => setScreen("challengeReplay")}
          onBackToMenu={() => {
            setClip(null);
            setScreen("chest");
          }}
          onReplay={replayChallenge}
        />
      )}
      {screen === "clips" && <ClipsScreen onBack={() => setScreen(clipsReturnScreen)} />}
      {/* ดูคลิปย้อนหลัง: กดย้อนกลับแล้วกลับมาหน้าสรุปเดิม */}
      {screen === "replay" && clipUrl && (
        <ReplayScreen clipUrl={clipUrl} onBack={() => setScreen("result")} />
      )}
      {screen === "challengeReplay" && clipUrl && (
        <ReplayScreen clipUrl={clipUrl} onBack={() => setScreen("challengeResult")} />
      )}
      {screen === "chest" && (
  <DailyChallengeScreen
    dailyData={dailyData}
    points={points}
    onStartChallenge={startChallenge}
  />
)}
      {screen === "rank" && <RankScreen playerName={playerName} points={points} />}
      {screen === "mission" && <DailyMissionScreen dailyData={dailyData} points={points} />}

      {NAV_SCREENS.includes(screen) && (
        <BottomNav active={screen} onSelect={selectTab} />
      )}

      {/* ปุ่มตั้งค่ามุมซ้ายบน แสดงทุกหน้า */}
      <button
        className="settings-icon-button"
        aria-label="ตั้งค่า"
        onClick={() => setSettingsOpen((open) => !open)}
      >
        <img src={ASSETS.iconSettings} alt="" draggable="false" />
      </button>

      {/* หน้าต่างตั้งค่า ชั้นบนสุด */}
      {settingsOpen && (
        <SettingsPanel
          values={settings}
          onToggle={toggleSetting}
          onClose={() => setSettingsOpen(false)}
          isInGame={screen === "play" || screen === "challengePlay"}
          hideClips={screen === "clips"}
          onLogout={logout}
          onOpenClips={() => {
            setClipsReturnScreen(screen);
            setSettingsOpen(false);
            setScreen("clips");
          }}
          onExitGame={() => {
            setSettingsOpen(false);
            setScreen("stage");
          }}
        />
      )}
    </div>
  );
}