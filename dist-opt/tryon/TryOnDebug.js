import { LM } from './landmarks.js';

export default class TryOnDebug {
    constructor(opts = {}) {
        this.enabled = opts.enabled || /[?&]debug=1|[?&]debug=true/.test(location.search);
        this.always = opts.always || /[?&]diag=1/.test(location.search);
        this.fps = 0;
        this.infFps = 0;
        this._frames = 0;
        this._t0 = performance.now();
        if (!this.enabled && !this.always) return;
        this._build();
    }

    _build() {
        if (this.always && !this.enabled) {
            const info = document.createElement('div');
            info.style.cssText = 'position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:48;background:rgba(0,0,0,.7);color:#ff6;font:10px monospace;padding:6px 8px;border-radius:8px;pointer-events:none;white-space:pre-line;text-align:right;';
            document.body.appendChild(info);
            this.info = info;
            return;
        }
        const cv = document.createElement('canvas');
        cv.id = 'tryon-debug';
        cv.style.cssText = 'position:fixed;inset:0;z-index:45;pointer-events:none;';
        document.body.appendChild(cv);
        this.cv = cv;
        this.ctx = cv.getContext('2d');

        const info = document.createElement('div');
        info.style.cssText = 'position:fixed;left:10px;top:10px;z-index:46;background:rgba(0,0,0,.7);color:#0f0;font:11px monospace;padding:8px;border-radius:8px;pointer-events:none;white-space:pre-line;';
        document.body.appendChild(info);
        this.info = info;

        const toggle = document.createElement('button');
        toggle.textContent = 'Hide Debug';
        toggle.style.cssText = 'position:fixed;right:10px;top:10px;z-index:47;cursor:pointer;background:#222;color:#0f0;border:1px solid #444;border-radius:6px;padding:4px 8px;font:11px monospace;';
        document.body.appendChild(toggle);
        toggle.addEventListener('click', () => {
            const on = cv.style.display === 'none';
            cv.style.display = on ? 'block' : 'none';
            info.style.display = on ? 'block' : 'none';
            toggle.textContent = on ? 'Hide Debug' : 'Show Debug';
        });

        const fit = () => {
            cv.width = window.innerWidth; cv.height = window.innerHeight;
        };
        window.addEventListener('resize', fit);
        fit();
    }

    tick() {
        this._frames++;
        const now = performance.now();
        if (now - this._t0 > 1000) {
            this.fps = Math.round((this._frames * 1000) / (now - this._t0));
            this._frames = 0;
            this._t0 = now;
        }
    }

    draw(snap) {
        if (!this.enabled) return;
        this.tick();
        const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
        ctx.clearRect(0, 0, W, H);

        const hands = snap.hands || [];
        hands.forEach((h) => {
            const l = h.ndc;
            ctx.strokeStyle = h.selected ? '#0f0' : 'rgba(0,255,0,.45)';
            ctx.lineWidth = 1;
            // hand bbox
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            l.forEach((p, i) => {
                const x = p[0] * W, y = p[1] * H;
                x0 = Math.min(x0, x); y0 = Math.min(y0, y);
                x1 = Math.max(x1, x); y1 = Math.max(y1, y);
                if (i === LM.RING_MCP || i === LM.RING_PIP || i === LM.RING_DIP || i === LM.RING_TIP) {
                    ctx.fillStyle = '#0ff';
                    ctx.fillRect(x - 2, y - 2, 4, 4);
                } else if (i === LM.WRIST) {
                    ctx.fillStyle = '#ff0'; ctx.fillRect(x - 3, y - 3, 6, 6);
                } else {
                    ctx.fillStyle = 'rgba(255,255,255,.7)';
                    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
                }
            });
            ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = '11px monospace';
            ctx.fillText(h.label + ' ' + (h.score && h.score.toFixed(2)), x0, Math.max(10, y0 - 4));
        });

        if (snap.anchor != null) {
            const ax = snap.anchor.x * W, ay = snap.anchor.y * H;
            ctx.strokeStyle = '#f0f';
            ctx.beginPath();
            if (snap.axis) {
                ctx.moveTo(ax, ay);
                ctx.lineTo(ax + snap.axis.x * 60, ay + snap.axis.y * 60);
            }
            ctx.stroke();
            ctx.fillStyle = '#f0f';
            ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
        }

        this.info.textContent = this.always && !this.enabled
            ? [
                'cap ' + (snap.camState || '-'),
                'vidsize ' + (snap.camRes ? snap.camRes[0] + 'x' + snap.camRes[1] : '-'),
                'state ' + snap.state,
                'hands ' + (snap.hands ? snap.hands.length : '-'),
                'pose ' + (snap.poseOk ? 'Y' : 'N'),
                'infer ' + snap.infFps.toFixed(1) + 'fps',
                'alpha ' + (snap.alpha != null ? snap.alpha.toFixed(2) : '-')
            ].join('  ')
            : [
                'render ' + this.fps + ' fps',
                'infer ' + this.infFps.toFixed(1) + ' fps',
                'state ' + snap.state,
                'conf ' + (snap.score != null ? snap.score.toFixed(2) : '-'),
                'scale ' + (snap.scale != null ? snap.scale.toFixed(3) : '-'),
                'depth ' + (snap.depth != null ? snap.depth.toFixed(2) + 'm' : '-'),
                'cam  ' + (snap.camRes ? snap.camRes[0] + 'x' + snap.camRes[1] : '-'),
                'occl ' + (snap.occlusion ? 'on' : 'off'),
                'hands ' + hands.length + (snap.selectedHand ? ' / sel ' + snap.selectedHand : '')
            ].join('\n');
    }
}