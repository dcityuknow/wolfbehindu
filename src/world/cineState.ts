/** Cờ cảnh mở đầu 3D đang chạy (module lá): camera.ts / main.ts nhường quyền điều khiển camera, sương mù, ánh sáng cho cine3d.ts. */
export const CINE = { active: false };

/** Trạng thái lồng tiếng: speaker = id lính đang nói (-1 = không ai; để khuôn mặt mấp máy miệng), glitch = đang nhiễu sóng bộ đàm. */
export const VO = { speaker: -1, glitch: 0 };
