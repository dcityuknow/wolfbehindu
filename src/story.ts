import type { TaskType } from "./types";
/**
 * Toàn bộ chữ/kịch bản của game nằm ở đây (theme: lính nhảy dù · bão · đảo hoang · gián điệp).
 * Muốn đổi lời thoại, tên nhiệm vụ, câu chat… chỉ cần sửa file này.
 */
export const GAME = { logo: "🪂 Lost Island", title: "Lost Island · Gián Điệp Giữa Đội", op: "CHIẾN DỊCH MŨI DÙI ĐEN", squad: "Biệt đội ALPHA" };

/** Tên gọi (callsign) — [0] là người chơi. Dùng cho nhãn đầu người, chat, bảng bỏ phiếu. */
export const CALLSIGNS = ["Bạn", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"];

export const ROLE = {
  crew: { name: "BIỆT KÍCH", badge: "🎖 BIỆT KÍCH", color: "#5f9", title: "BẠN LÀ BIỆT KÍCH", sub: "Hoàn thành 3 nhiệm vụ sinh tồn và tìm ra gián điệp trong 6 đồng đội còn lại. Đừng tin ai." },
  spy: { name: "GIÁN ĐIỆP", badge: "🕵 GIÁN ĐIỆP", color: "#f55", title: "BẠN LÀ GIÁN ĐIỆP", sub: "Giữ vỏ bọc. Rình lúc ai đó đi lẻ rồi ám sát (Q). Chui hang bí mật (E) để lẩn đi, làm nhiệm vụ giả để không bị nghi." },
};

/** Nhiệm vụ / mini-game. Khoá = TaskType (nhánh trong minigames.ts). */
export const TASKS: Record<TaskType, { name: string; icon: string; prompt: string; hint: string }> = {
  radio: { name: "Sửa radio liên lạc", icon: "📻", prompt: "[E] 📻 Sửa radio liên lạc", hint: "Nối các dây cùng màu để khôi phục ăng-ten." },
  decode: { name: "Giải mã bản tin mật", icon: "🔐", prompt: "[E] 🔐 Giải mã bản tin mật", hint: "Ghi nhớ mã — nó biến mất sau 3 giây — rồi nhập lại." },
  fire: { name: "Nhóm lửa tín hiệu", icon: "🔥", prompt: "[E] 🔥 Nhóm lửa tín hiệu", hint: "Giữ nút để thổi lửa. Buông tay là lửa yếu đi." },
  water: { name: "Lọc nước biển", icon: "💧", prompt: "[E] 💧 Vận hành máy lọc nước", hint: "Bật các van theo đúng thứ tự 1 → 5. Bấm sai là phải làm lại." },
  supply: { name: "Thu hồi kiện tiếp tế", icon: "📦", prompt: "[E] 📦 Thu hồi kiện tiếp tế", hint: "Bấm CẮT khi vạch chạy vào vùng xanh — 3 lần liên tiếp." },
};

/** HUD / nút / hành động */
export const UI = {
  roleLabel: (spy: boolean) => `Vai trò: <b style="color:${spy ? "#f55" : "#5f9"}">${spy ? ROLE.spy.badge : ROLE.crew.badge}</b>`,
  tasks: (n: number) => `Nhiệm vụ: ${n}/3`,
  round: (n: number) => `Lượt ${n}`,
  kill: "🔪 Ám sát (Q)", killUsed: "🔪 Đã ra tay (lượt này)",
  report: "[E] 🚨 Báo cáo thi thể", vent: "[E] Chui hang bí mật", meeting: "[E] Triệu tập họp khẩn",
  ventToast: "🕳 Bạn chui vào hang bí mật!",
  ghostToast: "💀 Bạn đã bị ám sát — giờ bạn chỉ còn là bóng ma trên đảo, vẫn quan sát được",
  bodyFound: "Thi thể bị phát hiện!", callMeeting: "Triệu tập họp khẩn quanh lửa trại!",
  botReport: (n: string) => `📢 ${n} phát hiện thi thể!`,
  help: "❓ Huấn thị", check: "🏁 Kiểm tra chiến dịch", checkNone: "Chiến dịch vẫn tiếp diễn — chưa bên nào thắng.",
  checkLine: "Chưa bên nào thắng.",
  meetTitle: "HỌP KHẨN QUANH LỬA TRẠI", chatPh: "Nói gì đó…", send: "Gửi", skip: "Bỏ qua — không ai bị loại", confirm: "Xác nhận phiếu",
  picked: (n: string) => `Đã chọn ${n}`,
  sealing: "🔐 Đang niêm phong & gửi phiếu…", tally: "📊 Các đồng đội bỏ phiếu — đang kiểm phiếu niêm phong (FHE)…",
  sysName: "Đài chỉ huy", sysVote: "Phiếu của bạn đã được niêm phong (mã hoá on-chain). Không ai biết bạn bỏ cho ai.",
  tieSplash: "Đội không thống nhất — không ai bị loại",
  ejected: (n: string, spy: boolean) => (spy ? `${n} bị loại khỏi đội — LÀ GIÁN ĐIỆP 🎯` : `${n} bị loại — KHÔNG phải gián điệp. Đã loại nhầm đồng đội 💔`),
  again: "Tái chiến",
};

/** Màn kết thúc */
export const ENDING = {
  crew: { title: "🎖 BIỆT KÍCH THẮNG", desc: "Tín hiệu cầu cứu vút lên bầu trời đảo — hoặc gián điệp đã bị vạch mặt. Trực thăng cứu hộ đang tới." },
  spy: { title: "🕵 GIÁN ĐIỆP THẮNG", desc: "Đội bị tiêu hao đến mức không còn đủ sức chống lại. Chiến dịch thất bại — kẻ phản bội hoàn thành sứ mệnh." },
  win: "🎉 Bạn thắng!", lose: "Bạn thua.",
};

/** Lời thoại bot khi họp. {n} = tên người bị nghi. */
export const CHAT_LINES = [
  "{n}, lúc nãy cậu đi đâu một mình? Tôi không thấy ai đi cùng hướng.",
  "Tôi thấy {n} lảng vảng gần cái hang cát. Giải thích đi.",
  "Khai báo vị trí: tôi ở khu rừng, vừa xong radio. {n} thì sao?",
  "{n} im lặng đáng ngờ. Người trong sạch thì không việc gì phải giấu miệng.",
  "Không có bằng chứng, nhưng linh cảm của một người lính mách bảo tôi là {n}.",
  "Bình tĩnh. Loại nhầm một đồng đội là chúng ta chết thêm một người.",
  "Ai thấy {n} làm nhiệm vụ chưa? Tôi chưa thấy lần nào.",
  "Tôi vừa thấy {n} lau lưỡi dao. Đừng nói là để gọt khoai.",
  "Điểm danh từng người: ai ở đâu lúc thi thể được tìm thấy?",
  "Gián điệp ở ngay trong lửa trại này. {n}, nhìn vào mắt tôi mà nói.",
  "Tôi ngồi canh lửa suốt, {n} làm chứng được. Đừng đổ cho tôi.",
  "Skip đi, chưa đủ cơ sở. Mỗi lần bỏ phiếu sai là mất thêm một người.",
  "{n}, mật khẩu đợt thả của chúng ta là gì? Trả lời nhanh.",
  "Tôi không tin ai nữa. Kể cả {n}. Kể cả các cậu.",
  "Radio vẫn chết, nước sắp hết, mà các cậu còn cãi nhau. Có kẻ đang cười đấy.",
  "{n} đáp xuống gần tôi nhất, nhưng sao lại ra khỏi khu rừng sớm vậy?",
];
/** Câu mở đầu cuộc họp (bot đầu tiên nói) */
export const OPENERS = {
  body: ["Tôi vừa thấy thi thể ngoài kia. Ai đó đã ra tay — và là người trong đội.", "Có người chết. Không có bão, không có thú dữ — là một nhát dao."],
  emergency: ["Tôi cho họp để chốt lại: đội mình đang bị thao túng từ bên trong.", "Có chuyện không ổn. Mọi người lại gần lửa, nói chuyện cho rõ."],
};

/** Kịch bản mở đầu (cutscene) — mỗi đoạn: tag (dòng thời gian/địa điểm), art (hình minh hoạ), lines (lời dẫn hiện từng chữ). */
export const CUTSCENE: { tag: string; art: "cabin" | "jump" | "storm" | "lost" | "island" | "briefing"; lines: string[] }[] = [
  { tag: `02:14 · ĐỘ CAO 12.000 FT · ${GAME.op}`, art: "cabin", lines: [
    "Khoang C-130 rung lên trong thứ ánh sáng đỏ quạch. Bảy bóng người ngồi dọc hai bên thân máy bay, dù chính đã siết chặt, súng áp sát ngực.",
    "«Biệt đội ALPHA, còn mười phút tới vùng thả. Mục tiêu: trạm liên lạc bị bỏ hoang trên cao nguyên. Lấy dữ liệu, rút lui, không để lại dấu vết.»",
    "Không ai nói gì. Trước giờ lên máy bay, chỉ huy chỉ dặn đúng một câu: trong đội có một kẻ đã được cài vào từ trước." ] },
  { tag: "02:26 · ĐÈN XANH · CỬA SAU MỞ", art: "jump", lines: [
    "Đèn đỏ chuyển xanh. Cửa sau mở toang, gió gào xé tan mọi âm thanh. «NHẢY! NHẢY! NHẢY!»",
    "Từng người một lao vào màn đêm. Dù chính bung ra, nở như những đoá hoa đen giữa bầu trời." ] },
  { tag: "02:31 · BÃO", art: "storm", lines: [
    "Không ai thấy cơn bão cho đến khi nó nuốt chửng cả bầu trời. Sét xé toạc tầng mây, những luồng gió giật cuốn cả đội đi như lá khô.",
    "Dây dù quấn vào nhau. Đèn tín hiệu chớp rồi tắt. Radio rít lên trong nhiễu: «…Alpha… hủy… nhảy… mất liên—»" ] },
  { tag: "02:40 · MẤT LIÊN LẠC", art: "lost", lines: [
    "Rồi chỉ còn im lặng. Bảy chiếc dù trôi dạt hàng chục cây số khỏi mục tiêu, cuốn thẳng về phía một vệt đen đơn độc giữa đại dương." ] },
  { tag: "BÌNH MINH · ĐẢO HOANG", art: "island", lines: [
    "Họ tỉnh dậy trên bãi cát trắng, biển xanh vô tận bốn bề. Bộ đàm chết cứng, bản đồ nhoè nước, máy bay đã biến mất. Dạt vào bờ chỉ còn xác dù, vài kiện tiếp tế… và bảy người sống sót." ] },
  { tag: "NHIỆM VỤ SINH TỒN", art: "briefing", lines: [
    "Muốn sống, họ phải sửa radio, giải mã bản tin mật, nhóm lửa tín hiệu, lọc nước biển và thu hồi kiện tiếp tế.",
    "Nhưng có một điều chỉ huy chưa kịp nói hết: kẻ phản bội cũng đã đáp xuống hòn đảo này. Hắn đang đứng ngay cạnh bạn.",
    "Đừng tin ai. Hãy sống sót." ] },
];
