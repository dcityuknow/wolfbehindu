import { resolveLocale } from "./i18n";

/**
 * Điểm vào của game: xác định ngôn ngữ + quốc gia (theo IP) TRƯỚC, rồi mới nạp phần còn lại —
 * vì quân phục lính đại diện và mọi dòng chữ được dựng ngay lúc các module khác nạp.
 */
void (async () => {
  try { await resolveLocale(); } catch { /* lỗi gì cũng cứ vào game bằng tiếng Anh */ }
  await import("./main");
})();
