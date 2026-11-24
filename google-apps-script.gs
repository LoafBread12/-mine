/**
 * مهمة الكواكب الخمسة: ربط اللعبة بجدول Google
 * ------------------------------------------------
 * يحفظ هذا السكربت في الجدول:
 *   - ملخّصًا عامًّا يقرؤه الطلاب: الكواكب المفتوحة، وأسماء الأنشطة، وكريستالات كل مجموعة.
 *   - قاعدة كل مجموعة في ورشة البناء.
 *   - درجات الطلاب كاملة، ولا يقرؤها إلا المعلّم بكلمة السر.
 *
 * طريقة التركيب:
 *   ١. أنشئ جدول Google جديدًا (sheets.new).
 *   ٢. من القائمة: الإضافات (Extensions) ← Apps Script.
 *   ٣. احذف ما في المحرّر، والصق هذا الملف كله، ثم اكتب كلمة سر المعلّم ومعرّف جدولك أدناه.
 *   ٤. احفظ، ثم: نشر (Deploy) ← نشر جديد (New deployment) ← النوع: تطبيق ويب (Web app).
 *        - التنفيذ بصفتي (Execute as: Me)
 *        - من يمكنه الوصول: أي شخص (Who has access: Anyone)
 *   ٥. وافق على الأذونات، وانسخ رابط تطبيق الويب (ينتهي بـ /exec) وضعه في syncUrl في index.html.
 *
 * عند تعديل السكربت لاحقًا: نشر ← إدارة عمليات النشر ← تعديل ← إصدار جديد، حتى يبقى الرابط نفسه.
 */

// كلمة سر المعلّم: نفس ما يكتبه في «دخول المعلّم» في ملف المعلّم. ١٠ أحرف على الأقل، فيها حروف وأرقام.
// لا ترفعها إلى GitHub ولا تكتبها في أي ملف آخر.
const TEACHER_PIN = "اكتب-كلمة-السر-هنا";
// بعد ١٠ محاولات خاطئة يُقفل دخول المعلّم ١٥ دقيقة، حتى لا يمكن تخمين كلمة السر.
const MAX_FAILS = 10, LOCK_SECONDS = 900;

// رموز دخول ورشة البناء لكل مجموعة (نفس الرموز في index.html).
const GROUP_CODES = { g1: "4821", g2: "7395", g3: "2164", g4: "5937" };

// أسعار وحدات القاعدة (نفس الأسعار في index.html). يتحقّق السكربت ألّا تصرف مجموعة أكثر مما كسبت.
const COSTS = { pad: 10, solar: 12, tank: 14, dome: 16, antenna: 18, lab: 20, scope: 22, tower: 26, sat: 32, beacon: 40 };
const EMBLEMS = ["star", "comet", "galaxy", "diamond", "crescent", "ringed", "bolt"];

// جدول «تقييم الفصل»: منه تأخذ اللعبة أسماء الطلاب ومجموعاتهم، وفيه تكتب درجاتهم.
const CLASS_SHEET_ID = "ضع-معرّف-جدول-تقييم-الفصل-هنا";   // الجزء بين /d/ و /edit في رابط الجدول
const CLASS_TAB = "Sheet1";
const FIRST_ROW = 3;      // أوّل صف فيه اسم طالب
const NAME_COL = 8;       // H: اسم الطالب
const GROUP_COL = 7;      // G: اسم مجموعته (الشهاب، المجرّة، النيزك، السديم)
// الدرجات تُكتب في الأعمدة B إلى F بجانب الاسم:
// F الحضور، E الانضباط، D نتائج المجموعة، C المجموع، B الترتيب
const GROUP_IDS = { "الشهاب": "g1", "المجرة": "g2", "المجرّة": "g2", "النيزك": "g3", "السديم": "g4" };

/* ---------------- الطلبات ---------------- */

// يتحقّق من كلمة السر، ويقفل الدخول بعد محاولات خاطئة كثيرة. يرجع "ok" أو "key" أو "locked".
function checkKey_(key) {
  const c = CacheService.getScriptCache();
  const fails = Number(c.get("fails") || 0);
  if (fails >= MAX_FAILS) return "locked";
  if (String(key || "").length >= 8 && String(key) === TEACHER_PIN && TEACHER_PIN.indexOf("اكتب") !== 0) return "ok";
  c.put("fails", String(fails + 1), LOCK_SECONDS);
  Utilities.sleep(1000);
  return fails + 1 >= MAX_FAILS ? "locked" : "key";
}

// الطلاب: الملخّص العام وقواعد المجموعات فقط (بلا أسماء ولا درجات)
function doGet(e) {
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
    const auth = d.key ? checkKey_(d.key) : "none";   // الطالب لا يرسل كلمة سر، فلا تُحسب عليه محاولة
    const teacher = auth === "ok";
    if (d.key && !teacher && d.type !== "base") return out_({ ok: false, error: auth });

    // المعلّم يقرأ الأسماء والدرجات (كلمة السر داخل الطلب، لا في الرابط)
    if (d.type === "grades") {
      if (!teacher) return out_({ ok: false, error: "key" });
      let roster = null;
      try { roster = roster_(); } catch (x) { roster = null; }   // إن تعذّر فتح «تقييم الفصل» تبقى الأسماء الافتراضية
      return out_({ ok: true, grades: read_("grades"), roster: roster });
    }

    // المعلّم يحفظ الدرجات والملخّص العام
    if (d.type === "teacher") {
      if (!teacher) return out_({ ok: false, error: "key" });
      if (d.grades && typeof d.grades === "object") write_("grades", d.grades);
      if (d.public && typeof d.public === "object") write_("public", cleanPublic_(d.public));
      if (Array.isArray(d.report)) { try { writeReport_(d.report); } catch (x) {} }
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

/* ---------------- جدول «تقييم الفصل» ---------------- */

function classSheet_() {
  return SpreadsheetApp.openById(CLASS_SHEET_ID).getSheetByName(CLASS_TAB);
}

// أسماء الطلاب (H) ومجموعاتهم (G). لا تُرسَل إلا للمعلّم بالرقم السري.
function roster_() {
  const sh = classSheet_(), n = sh.getLastRow() - FIRST_ROW + 1;
  if (n < 1) return [];
  return sh.getRange(FIRST_ROW, GROUP_COL, n, 2).getValues()
    .filter(r => String(r[1]).trim())
    .map(r => ({ name: String(r[1]).trim(), group: GROUP_IDS[String(r[0]).trim()] || "" }));
}

// يكتب درجات كل طالب في صفّه (يُطابَق بالاسم في العمود H)
function writeReport_(rows) {
  const sh = classSheet_(), n = sh.getLastRow() - FIRST_ROW + 1;
  if (n < 1) return;
  const byName = {};
  rows.forEach(r => { if (r && r.name) byName[String(r.name).trim()] = r; });
  const names = sh.getRange(FIRST_ROW, NAME_COL, n, 1).getValues();
  const out = names.map(([nm]) => {
    const r = byName[String(nm).trim()];
    if (!r) return ["", "", "", "", ""];
    return [num_(r.rank), num_(r.total), num_(r.res), num_(r.mor), num_(r.att)];   // B C D E F
  });
  sh.getRange(FIRST_ROW, 2, n, 5).setValues(out);
  sh.getRange(FIRST_ROW - 1, 2, 1, 5).setValues([["الترتيب", "المجموع /٤٥", "نتائج المجموعة /١٥", "الانضباط /١٥", "الحضور /١٥"]]);
}

function num_(v) { const x = Number(v); return isFinite(x) ? x : ""; }

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

/**
 * للتجربة من المحرّر: اختر checkSheet من القائمة أعلى المحرّر واضغط Run (تشغيل).
 * أول مرة يطلب Google الإذن بفتح جدول «تقييم الفصل»؛ وافق. ثم يكتب في السجلّ عدد الطلاب ومجموعاتهم.
 */
function checkSheet() {
  const r = roster_();
  const count = {};
  r.forEach(x => { count[x.group || "بلا مجموعة"] = (count[x.group || "بلا مجموعة"] || 0) + 1; });
  Logger.log("عدد الطلاب: " + r.length + " — " + JSON.stringify(count));
  Logger.log("أول اسم: " + (r[0] ? r[0].name : "لا يوجد"));
}
