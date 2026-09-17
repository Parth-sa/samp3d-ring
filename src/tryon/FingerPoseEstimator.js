import { LM, FINGER_TO_LM, clamp, lerp } from './landmarks.js';

export default class FingerPoseEstimator {
    constructor(opts = {}) {
        this.fovDeg = opts.fovDeg || 55;
        this.fingerWidthRatio = opts.fingerWidthRatio || 0.9; // finger width vs base->mid world length
    }

    _f(inMm, px, camH) {
        // apparent px for a world length at depth d:  px = f*camH*inMm/ (2*d*tan(fov/2)*1000)
        // preserve: depth (m)     = (camH*inMm) / (2*px*tan(fov/2)*1000)
        return (camH * inMm) / (2 * px * Math.tan((this.fovDeg * Math.PI) / 180 / 2) * 1000);
    }

    estimate(hand, canvas, anchorRatio = 0.5) {
        const { ndc, world, score } = hand;
        const camW = canvas.clientWidth || 1;
        const camH = canvas.clientHeight || 1;
        const f = FINGER_TO_LM.ring;
        const segPx = Math.hypot(
            (ndc[f.base][0] - ndc[f.mid][0]) * camW,
            (ndc[f.base][1] - ndc[f.mid][1]) * camH
        );

        const segM = Math.hypot(
            world[f.base][0] - world[f.mid][0],
            world[f.base][1] - world[f.mid][1],
            world[f.base][2] - world[f.mid][2]
        ) * 1000; // mm

        const segMValid = Number.isFinite(segM) && segM > 0.1;
        const effSegM = segMValid ? segM : 30; // world landmarks unavailable -> fall back to typical finger segment

        const depth = this._f(effSegM, Math.max(segPx, 1), camH);
        if (!(depth > 0.05 && depth < 4)) depth = Math.max(0.05, Math.min(4, depth || 0.35));
        if (!Number.isFinite(depth) || depth <= 0) return null;

        const r = Math.max(0, Math.min(1, anchorRatio)); // base->mid anchor ratio
        const anchorX = lerp(ndc[f.base][0], ndc[f.mid][0], r);
        const anchorY = lerp(ndc[f.base][1], ndc[f.mid][1], r);

        const fingerWidthMM = effSegM * this.fingerWidthRatio;

        // --- 3D orientation from world landmarks (meters, hand-rooted) ---
        const v = (a, b) => [
            world[b][0] - world[a][0],
            world[b][1] - world[a][1],
            world[b][2] - world[a][2]
        ];
        const fwd = v(f.base, f.mid);
        const len = Math.hypot(...fwd);
        if (len < 1e-6) { fwd[0] = 0; fwd[1] = -1; fwd[2] = 0; } else { [fwd[0], fwd[1], fwd[2]] = [fwd[0] / len, fwd[1] / len, fwd[2] / len]; }

        // palm normal from wrist -> middle/ring metacarpals plane
        const w = world[LM.WRIST];
        const a1 = [world[LM.MIDDLE_MCP][0] - w[0], world[LM.MIDDLE_MCP][1] - w[1], world[LM.MIDDLE_MCP][2] - w[2]];
        const a2 = [world[LM.INDEX_MCP][0] - w[0], world[LM.INDEX_MCP][1] - w[1], world[LM.INDEX_MCP][2] - w[2]];
        let n = cross(a1, a2);
        const nLen = Math.hypot(...n);
        if (!Number.isFinite(nLen) || nLen < 1e-6) n = [0, 0, 1]; // world unavailable — face camera
        else n = [n[0] / nLen, n[1] / nLen, n[2] / nLen];

        // depth responsible for too close / too far
        const spanMm = segM;
        const tooClose = depth < 0.25;
        const tooFar = depth > 0.9;

        const palmSpanPx = Math.hypot(
            (ndc[LM.WRIST][0] - ndc[LM.MIDDLE_MCP][0]) * camW,
            (ndc[LM.WRIST][1] - ndc[LM.MIDDLE_MCP][1]) * camH
        );

        return {
            anchorX, anchorY,
            depth,
            fingerWidthMM,
            fwd,
            normal: n,
            score,
            tooClose,
            tooFar,
            palmSpanPx,
            worldUsable: segMValid,
            raw: { segPx, segM: effSegM }
        };
    }
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}