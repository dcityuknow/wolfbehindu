import type * as THREE from "three";
export type Phase = "menu" | "play" | "meet" | "end";
export type TaskType = "radio" | "decode" | "fire" | "water" | "supply";
export interface Entity { i: number; g: THREE.Group; x: number; z: number; rot: number; vy: number; y: number; dead: boolean; out: boolean; wait: number; tx: number; tz: number; /** ghế đang ngồi quanh lửa trại (-1 = đang đứng) */ seat: number;
  /** Chiến đấu: máu · thời gian ngất (s) · mức giơ súng ngắm 0..1 · góc ngẩng/cúi · độ giật · tiến độ nạp đạn · nháy đỏ khi trúng đạn */
  /** vị trí hợp lệ ở lần va chạm trước (để chặn leo vách / lội xuống biển) */ px: number; pz: number;
  hp: number; stun: number; aim: number; pitch: number; kick: number; rel: number; flash: number }
export interface Body { x: number; z: number; g: THREE.Group; own?: boolean }
export interface Station { x: number; z: number; type: TaskType; m: THREE.Mesh; active: boolean; done: boolean }
export interface GameState {
  phase: Phase; slot: number; role: 0 | 1 | null; round: number; acted: boolean; killUsed: boolean;
  tasks: number; dead: Set<number>; mini: boolean; voted: boolean; ghost: boolean; cpRound: number;
  reporting: boolean; scheduleTimer?: number;
  /** Cuộc họp đang được gọi: ai gọi, lý do, giây còn lại để mọi người chạy tới lửa trại · bot đang đi báo xác · đã thấy xác chưa */
  call: null | { why: string; caller: number; t: number }; reporter: number; bodyKnown: boolean;
}
