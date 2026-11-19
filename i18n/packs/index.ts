import { registerPacks } from "../index";
import { EN } from "./en";
import { VI } from "./vi";
import { ALL } from "./full";

/** Đăng ký mọi bản dịch. Muốn thêm ngôn ngữ mới: thêm vào LANGS (i18n/index.ts) + bảng MORE (more.ts). */
registerPacks(EN, { vi: VI, ...ALL });
