// Overlay for the first-person walk (src/ui/camera/firstPerson.ts): a controls hint, a centre dot while
// the mouse is captured, and the touch stick. Pure DOM in #ui (outside .th-ui), pointer-transparent.

import './walk.css';

const IS_TOUCH = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && !window.matchMedia?.('(pointer: fine)').matches;

export class WalkHud {
  readonly el: HTMLDivElement;
  private hint: HTMLDivElement;
  private cross: HTMLDivElement;
  private stick: HTMLDivElement;
  private knob: HTMLDivElement;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'th-walk';
    this.hint = document.createElement('div');
    this.hint.className = 'th-walk-hint';
    this.cross = document.createElement('div');
    this.cross.className = 'th-walk-cross';
    this.stick = document.createElement('div');
    this.stick.className = 'th-walk-stick';
    this.knob = document.createElement('div');
    this.knob.className = 'th-walk-knob';
    this.stick.appendChild(this.knob);
    this.el.append(this.hint, this.cross, this.stick);
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
    if (!on) {
      this.setHint(null);
      this.setLocked(false);
      this.setStick(null);
    }
  }

  /** controls hint for the current state (null hides it); fades out after `secs` */
  setHint(kind: 'enter' | 'free' | null, secs = 9): void {
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = null;
    if (!kind) {
      this.hint.classList.remove('show');
      return;
    }
    const sep = '<i class="dot"></i>';
    const parts = IS_TOUCH
      ? ['<span><em>Left thumb</em> walk</span>', '<span><em>Drag</em> to look</span>', '<span><em>Tap</em> what you see</span>', '<span>Walk button to stop</span>']
      : kind === 'enter'
        ? ['<span><em>W A S D</em> walk</span>', '<span><em>Shift</em> jog</span>', '<span><em>Mouse</em> look</span>', '<span><em>Esc</em> frees the mouse</span>', '<span><em>V</em> stop walking</span>']
        : ['<span><em>Drag</em> or <em>click</em> to look around</span>', '<span><em>Click</em> people &amp; things</span>', '<span><em>Esc</em> / <em>V</em> stop walking</span>'];
    this.hint.innerHTML = parts.join(sep);
    this.hint.classList.add('show');
    this.hintTimer = setTimeout(() => this.hint.classList.remove('show'), secs * 1000);
  }

  setLocked(on: boolean): void {
    this.cross.classList.toggle('show', on);
  }

  /** touch stick at (x, y) CSS px with the knob offset (dx, dy), or null */
  setStick(s: { x: number; y: number; dx: number; dy: number } | null): void {
    if (!s) {
      this.stick.classList.remove('show');
      return;
    }
    this.stick.style.left = `${s.x}px`;
    this.stick.style.top = `${s.y}px`;
    this.knob.style.transform = `translate(${s.dx}px, ${s.dy}px)`;
    this.stick.classList.add('show');
  }

  dispose(): void {
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.el.remove();
  }
}
