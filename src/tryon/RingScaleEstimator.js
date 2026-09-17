import { clamp } from './landmarks.js';

export default class RingScaleEstimator {
    constructor(opts = {}) {
        this.modelDiag = opts.modelDiag || 1;
    }

    estimate(pose, cal) {
        const pd = cal.physicalDimensions || {};
        const outerMM = pd.outerDiameterMM || 20;
        const base = (outerMM / 1000) / Math.max(this.modelDiag, 1e-6);
        const fit = pose.fingerWidthMM / outerMM;
        let s = base * fit * (cal.tryOn.scaleMultiplier || 1);
        const lo = (cal.tryOn.minScale != null ? cal.tryOn.minScale : 0.35);
        const hi = (cal.tryOn.maxScale != null ? cal.tryOn.maxScale : 3);
        s = clamp(s, lo, hi);
        return s;
    }
}