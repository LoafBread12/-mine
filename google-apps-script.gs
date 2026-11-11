/**
 * مهمة الكواكب الخمسة: ربط اللعبة بجدول Google
 * ------------------------------------------------
 * يحفظ هذا السكربت في الجدول:
 *   - ملخّصًا عامًّا يقرؤه الطلاب: الكواكب المفتوحة، وأسماء الأنشطة، وكريستالات كل مجموعة.
 *   - قاعدة كل مجموعة في ورشة البناء.
 *   - درجات الطلاب كاملة، ولا يقرؤها إلا المعلّم بالرقم السري.
 *
 * طريقة التركيب:
 *   ١. أنشئ جدول Google جديدًا (sheets.new).
 *   ٢. من القائمة: الإضافات (Extensions) ← Apps Script.
 *   ٣. احذف ما في المحرّر، والصق هذا الملف كله، ثم غيّر الرقم السري أدناه.
 *   ٤. احفظ، ثم: نشر (Deploy) ← نشر جديد (New deployment) ← النوع: تطبيق ويب (Web app).
 *        - التنفيذ بصفتي (Execute as: Me)
 *        - من يمكنه الوصول: أي شخص (Who has access: Anyone)
 *   ٥. وافق على الأذونات، وانسخ رابط تطبيق الويب (ينتهي بـ /exec) وضعه في syncUrl في index.html.
 *
 * عند تعديل السكربت لاحقًا: نشر ← إدارة عمليات النشر ← تعديل ← إصدار جديد، حتى يبقى الرابط نفسه.
 */

// الرقم السري للمعلّم: نفس الرقم الذي يُدخله في «دخول المعلّم». غيّره.
const TEACHER_PIN = "1447";

// رموز دخول ورشة البناء لكل مجموعة (نفس الرموز في index.html).
const GROUP_CODES = { g1: "4821", g2: "7395", g3: "2164", g4: "5937" };

// أسعار وحدات القاعدة (نفس الأسعار في index.html). يتحقّق السكربت ألّا تصرف مجموعة أكثر مما كسبت.
const COSTS = { pad: 10, solar: 12, tank: 14, dome: 16, antenna: 18, lab: 20, scope: 22, tower: 26, sat: 32, beacon: 40 };
const EMBLEMS = ["star", "comet", "galaxy", "diamond", "crescent", "ringed", "bolt"];

/* ---------------- الطلبات ---------------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "grades") {
    if (String(p.key) !== TEACHER_PIN) return out_({ ok: false, error: "key" });
    return out_({ ok: true, grades: read_("grades") });
  }
  const bases = {};
  Object.keys(GROUP_CODES).forEach(g => { bases[g] = read_("base:" + g); });
  return out_({ ok: true, public: read_("public"), bases: bases });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: "json" }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const teacher = String(d.key || "") === TEACHER_PIN;

    // المعلّم يحفظ الدرجات والملخّص العام
    if (d.type === "teacher") {
      if (!teacher) return out_({ ok: false, error: "key" });
      if (d.grades && typeof d.grades === "object") write_("grades", d.grades);
      if (d.public && typeof d.public === "object") write_("public", cleanPublic_(d.public));
      return out_({ ok: true });
    }

    // مجموعة تبني في الورشة (أو المعلّم يمسح القواعد)
    if (d.type === "base") {
      const g = String(d.group || "");
      if (!GROUP_CODES[g]) return out_({ ok: false, error: "group" });
      if (!teacher && String(d.code || "") !== GROUP_CODES[g]) return out_({ ok: false, error: "code" });
      const b = d.base || {};
      const built = (Array.isArray(b.built) ? b.built : []).filter((x, i, a) => COSTS[x] != null && a.indexOf(x) === i);
      const spent = built.reduce((s, x) => s + COSTS[x], 0);
      const pub = read_("public") || {};
      const earned = Number((pub.earned || {})[g]) || 0;
      if (!teacher && spent > earned) return out_({ ok: false, error: "crystals", earned: earned });
      write_("base:" + g, {
        built: built,
        name: String(b.name || "").slice(0, 24),
        emblem: EMBLEMS.indexOf(b.emblem) >= 0 ? b.emblem : ""
      });
      return out_({ ok: true });
    }
    return out_({ ok: false, error: "type" });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- أدوات ---------------- */

function cleanPublic_(p) {
  const earned = {};
  Object.keys(GROUP_CODES).forEach(g => { earned[g] = Math.max(0, Math.round(Number((p.earned || {})[g]) || 0)); });
  return {
    open: (Array.isArray(p.open) ? p.open : []).slice(0, 10).map(v => v !== false),
    titles: (Array.isArray(p.titles) ? p.titles : []).slice(0, 10).map(t => String(t || "").slice(0, 40)),
    earned: earned
  };
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("data");
  if (!sh) {
    sh = ss.insertSheet("data");
    sh.getRange(1, 1, 1, 3).setValues([["المفتاح", "القيمة", "آخر تحديث"]]).setFontWeight("bold");
    sh.setColumnWidth(2, 600);
  }
  return sh;
}

function row_(sh, key) {
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const keys = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) if (keys[i][0] === key) return i + 2;
  return 0;
}

function read_(key) {
  const sh = sheet_(), r = row_(sh, key);
  if (!r) return null;
  try { return JSON.parse(sh.getRange(r, 2).getValue()); } catch (x) { return null; }
}

function write_(key, value) {
  const sh = sheet_();
  let r = row_(sh, key);
  if (!r) { r = sh.getLastRow() + 1; sh.getRange(r, 1).setValue(key); }
  sh.getRange(r, 2, 1, 2).setValues([[JSON.stringify(value), new Date()]]);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
