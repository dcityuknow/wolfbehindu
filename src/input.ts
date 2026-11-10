export const keys: Record<string, boolean> = {};
export function bindInput(h: { onInteract(): void; onKill(): void; onJump(): void; onView(): void }) {
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.code === "KeyE") h.onInteract();
    if (e.code === "KeyQ") h.onKill();
    if (e.code === "KeyV") h.onView();
    if (e.code === "Space") { h.onJump(); e.preventDefault(); }
  });
  addEventListener("keyup", (e) => (keys[e.code] = false));
}
export const clearKeys = () => { for (const k in keys) keys[k] = false; };
