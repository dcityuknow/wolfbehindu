/**
 * Đa ngôn ngữ + tự nhận quốc gia theo IP (lấy cách làm của game tham khảo "Block Arena").
 *  - Lần đầu vào: đoán quốc gia từ IP (api.country.is → ipapi.co), không được thì theo ngôn ngữ trình duyệt.
 *  - Người chơi bấm chọn ngôn ngữ ở menu → lưu lại (localStorage) và tải lại trang: lúc đó ngôn ngữ + lính đại diện đổi theo.
 *  - Lính đại diện của bạn (SQUAD[0] trong config.ts) = lính của quốc gia đó (11 quân phục có sẵn trong world/soldier.ts).
 * File này KHÔNG import file nào khác của game (boot.ts gọi resolveLocale() TRƯỚC khi nạp phần còn lại).
 */
export const LANGS = [
  ["vi", "Tiếng Việt", "🇻🇳"], ["en", "English", "🇺🇸"], ["ru", "Русский", "🇷🇺"], ["ng", "Nigerian (Pidgin)", "🇳🇬"], ["bn", "বাংলা", "🇧🇩"], ["id", "Bahasa Indonesia", "🇮🇩"],
  ["hi", "हिन्दी", "🇮🇳"], ["zh", "中文", "🇨🇳"], ["fil", "Filipino", "🇵🇭"], ["uk", "Українська", "🇺🇦"], ["ko", "한국어", "🇰🇷"],
] as const;
export type Lang = (typeof LANGS)[number][0];
const isLang = (x: unknown): x is Lang => LANGS.some((l) => l[0] === x);

/** Quốc gia (mã ISO) → ngôn ngữ. */
const CC_LANG: Record<string, Lang> = {
  US: "en", GB: "en", AU: "en", CA: "en", IE: "en", NZ: "en", ZA: "en", VN: "vi", RU: "ru", BY: "ru", KZ: "ru", NG: "ng", BD: "bn", ID: "id",
  IN: "hi", CN: "zh", TW: "zh", HK: "zh", SG: "zh", PH: "fil", UA: "uk", KR: "ko",
};
/** Quốc gia có sẵn quân phục → mã lính (soldier.ts). */
const CC_NATION: Record<string, string> = { VN: "vn", US: "us", RU: "ru", NG: "ng", BD: "bd", ID: "id", IN: "in", CN: "cn", PH: "ph", UA: "ua", KR: "kr" };
/** Ngôn ngữ → lính đại diện (dùng khi chọn tay, hoặc nước không có quân phục riêng như UK/AU → lính theo ngôn ngữ). */
export const NATION_OF_LANG: Record<Lang, string> = { vi: "vn", en: "us", ru: "ru", ng: "ng", bn: "bd", id: "id", hi: "in", zh: "cn", fil: "ph", uk: "ua", ko: "kr" };

export const locale = { lang: "en" as Lang, nation: "us", cc: "", manual: false };

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* chế độ riêng tư */ } },
};

function navLang(): Lang {
  const n = (navigator.language || "en").toLowerCase();
  if (n === "en-ng") return "ng";
  const m: Record<string, Lang> = { en: "en", vi: "vi", ru: "ru", bn: "bn", id: "id", hi: "hi", zh: "zh", fil: "fil", tl: "fil", uk: "uk", ko: "ko" };
  return m[n.split("-")[0]] ?? "en";
}

/** Hỏi IP → mã quốc gia 2 chữ (thử 2 dịch vụ miễn phí, mỗi cái tối đa 2,5 giây). Lỗi/mạng chặn → "" */
async function ipCountry(): Promise<string> {
  const tryF = async (u: string, txt: boolean) => {
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 2500);
    try { const r = await fetch(u, { signal: ac.signal }); const v = txt ? (await r.text()).trim() : (await r.json()).country; return /^[A-Za-z]{2}$/.test(String(v)) ? String(v).toUpperCase() : ""; }
    catch { return ""; } finally { clearTimeout(to); }
  };
  return (await tryF("https://api.country.is/", false)) || (await tryF("https://ipapi.co/country/", true));
}

/** Gọi 1 lần ở boot.ts, trước khi nạp game. Xác định ngôn ngữ + lính đại diện. */
export async function resolveLocale() {
  const saved = ls.get("si_lang");
  if (isLang(saved)) { locale.lang = saved; locale.manual = true; locale.nation = NATION_OF_LANG[saved]; }
  else {
    let cc = "";
    const c = (ls.get("si_cc") || "").split("|");                       // nhớ quốc gia 12 giờ để không phải hỏi IP mỗi lần mở game
    if (c[0] && Date.now() - Number(c[1] || 0) < 12 * 3600e3) cc = c[0];
    else { cc = await ipCountry(); if (cc) ls.set("si_cc", cc + "|" + Date.now()); }
    locale.cc = cc;
    locale.lang = CC_LANG[cc] ?? navLang();
    locale.nation = CC_NATION[cc] ?? NATION_OF_LANG[locale.lang];
  }
  document.documentElement.lang = locale.lang === "ng" ? "en" : locale.lang;
}

/** Người chơi chọn ngôn ngữ ở menu: lưu → tải lại để cả chữ lẫn lính đại diện đổi theo. */
export function chooseLang(l: Lang) {
  if (l === locale.lang && locale.manual) return;
  ls.set("si_lang", l);
  try { sessionStorage.setItem("si_step", sessionStorage.getItem("si_stepnow") || "0"); } catch { /* bỏ qua */ }
  location.reload();
}

/* ───────────── Bộ dịch ───────────── */
export type Entry = string | string[] | ((...a: any[]) => string);
export type Dict = Record<string, Entry>;
const PACKS: Partial<Record<Lang, Dict>> = {};
let EN: Dict = {};
export function registerPacks(en: Dict, packs: Partial<Record<Lang, Dict>>) { EN = en; Object.assign(PACKS, packs); }

/** thay {0} {1} … trong chuỗi mẫu */
export const fmt = (s: string, ...a: unknown[]) => s.replace(/\{(\d)\}/g, (_, i) => String(a[+i] ?? ""));

const pick = (key: string): Entry | undefined => PACKS[locale.lang]?.[key] ?? EN[key];
/** t("khoá", ...tham số) — thiếu bản dịch thì dùng tiếng Anh. */
export function t(key: string, ...a: unknown[]): string {
  const v = pick(key);
  if (v === undefined) return key;
  return typeof v === "function" ? v(...a) : Array.isArray(v) ? v.join("") : fmt(v, ...a);
}
export const has = (key: string) => PACKS[locale.lang]?.[key] !== undefined;

/**
 * Ghi đè các hằng chữ trong story.ts theo đường dẫn ("UI.tasks", "ROLE.spy.title", "TASKS.radio.name"…).
 * Giá trị mẫu có {0}… sẽ được bọc thành hàm nếu mục gốc là hàm. Mảng (CHAT_LINES…) thay nguyên nội dung.
 */
export function applyPaths(roots: Record<string, any>) {
  const d = PACKS[locale.lang]; if (!d) return;
  for (const [path, val] of Object.entries(d)) {
    const parts = path.split("."); if (!(parts[0] in roots)) continue;
    let o: any = roots[parts[0]];
    for (let i = 1; i < parts.length - 1 && o; i++) o = o[parts[i]];
    const k = parts[parts.length - 1]; if (o == null) continue;
    if (parts.length === 1) { if (Array.isArray(o) && Array.isArray(val)) o.splice(0, o.length, ...val); continue; }
    if (Array.isArray(o[k]) && Array.isArray(val)) { o[k].splice(0, o[k].length, ...val); continue; }
    if (typeof o[k] === "function" && typeof val === "string") { const tpl = val; o[k] = (...a: unknown[]) => fmt(tpl, ...a); }
    else if (typeof val === "function" || typeof val === "string") o[k] = val;
  }
}

/** Dịch chữ tĩnh trong index.html: <b data-i18n="khoá"> (hoặc data-i18n-ph="khoá" cho placeholder). */
export function applyStatic() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((e) => { e.textContent = t(e.dataset.i18n!); });
  document.querySelectorAll<HTMLInputElement>("[data-i18n-ph]").forEach((e) => { e.placeholder = t(e.dataset.i18nPh!); });
  document.title = t("html.title");
}
