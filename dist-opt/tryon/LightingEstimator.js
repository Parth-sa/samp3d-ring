import { clamp } from './landmarks.js';

export default class LightingEstimator {
    constructor(opts = {}) {
        this.video = opts.video;
        this.onUpdate = opts.onUpdate || (() => {});
        this.active = false;
        this._interval = null;
        this._c = document.createElement('canvas');
        this._ctx = this._c.getContext('2d', { willReadFrequently: true });
        this.last = null;
    }

    start() {
        if (this.active) return;
        this.active = true;
        this._tick();
        this._interval = setInterval(() => this._tick(), 1500);
    }

    stop() {
        this.active = false;
        if (this._interval) clearInterval(this._interval);
        this._interval = null;
    }

    _tick() {
        if (!this.active || !this.video || this.video.readyState < 2) return;
        const w = 16, h = 12;
        this._c.width = w; this._c.height = h;
        try {
            this._ctx.drawImage(this.video, 0, 0, w, h);
            const d = this._ctx.getImageData(0, 0, w, h).data;
            let luma = 0, rWarm = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                luma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
                rWarm += (r - b);
                n++;
            }
            luma /= n; rWarm /= n;
            const env = clamp(0.45 + (luma / 255) * 1.15, 0.4, 1.55);
            const temp = clamp(1 - rWarm / 60, 0.93, 1.06); // >0 cools, <1 warms
            const exposure = clamp(0.95 + (luma / 255) * 0.35, 0.9, 1.3);
            const out = { luma, env, temp, exposure };
            this.last = out;
            this.onUpdate(out);
        } catch (e) { /* frame not ready */ }
    }
}