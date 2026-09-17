import { clamp, lerp } from './landmarks.js';

export default class OneEuroSmoother {
    constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this._prev = null;
        this._prevDeriv = 0;
        this._prevTime = null;
    }

    _alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / Math.max(dt, 1e-3));
    }

    filter(value, time = performance.now()) {
        if (this._prevTime === null || this._prev === null) {
            this._prev = value;
            this._prevTime = time;
            return value;
        }
        const dt = (time - this._prevTime) / 1000;
        const dx = (value - this._prev) / Math.max(dt, 1e-6);
        const deriv = this._prevDeriv + this._alpha(this.dCutoff, dt) * (dx - this._prevDeriv);
        const cutoff = this.minCutoff + this.beta * Math.abs(deriv);
        const out = this._prev + this._alpha(cutoff, dt) * (value - this._prev);
        this._prev = out;
        this._prevDeriv = deriv;
        this._prevTime = time;
        return out;
    }

    reset(value = null) {
        this._prev = value;
        this._prevDeriv = 0;
        this._prevTime = null;
    }
}

export class SmoothedScalar {
    constructor(k = 0.25) {
        this.k = k;
        this.v = null;
    }
    update(x) {
        if (this.v === null) { this.v = x; return x; }
        this.v = lerp(this.v, x, clamp(this.k, 0.01, 1));
        return this.v;
    }
    reset() { this.v = null; }
}