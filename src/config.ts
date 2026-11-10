/** Hằng số game — chỉnh cân bằng/giao diện tại đây. */
export const NO_TARGET = 255;          // = NO_TARGET trong contract (skip vote / kill giả)
export const TASKS_PER_PLAYER = 3;     // = TASKS_PER_PLAYER trong contract
export const CEN = [-13.5, 0, 13.5];   // tâm 3 hàng/cột phòng
export const VIS = 11;                 // tầm nhìn tối đa (m)
export const KILL_RANGE = 2.2;
export const PLAYER_SPEED = 6;
export const BOT_SPEED = 3.2;
export const COLORS = [0xff4d4d, 0x4da6ff, 0x4dff88, 0xffd24d];
export const NAMES = ["Bạn", "Bot-1", "Bot-2", "Bot-3"];
export const CHAT_LINES = [
  "Mình thấy {n} đi một mình khá lâu.", "{n} cứ lảng vảng gần phòng điện…", "Mình nghi {n}.",
  "Mình đang làm task, {n} đâu rồi?", "Chưa đủ bằng chứng, skip đi.", "{n} im lặng đáng ngờ đấy.",
];
// Ánh sáng ngoài trời (three >= r155, đơn vị vật lý). Tối/sáng quá thì chỉnh ở đây.
export const LIGHT = { ambient: 1.6, sun: 3.2, torch: 18, torchRange: 12, fogPlay: 0.011, fogGhost: 0.006 };
