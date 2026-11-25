/** Cờ cảnh mở đầu 3D đang chạy (module lá): camera.ts / main.ts nhường quyền điều khiển camera, sương mù, ánh sáng cho cine3d.ts. */
export const CINE = { active: false, hero: false };   // hero = đang chạy cú máy điện ảnh bung dù: cine3d.ts tự đặt ánh sáng mặt trời (main.ts không được followSun đè lên)

/** Trạng thái lồng tiếng: speaker = id lính đang nói (-1 = không ai; để khuôn mặt mấp máy miệng), glitch = đang nhiễu sóng bộ đàm. */
export const VO = { speaker: -1, glitch: 0 };

/** Cờ phiên tòa ở đống lửa (gameplay/tribunal.ts) đang chạy: camera.ts nhường quyền camera cho tribunal. */
export const TRIB = { active: false };
