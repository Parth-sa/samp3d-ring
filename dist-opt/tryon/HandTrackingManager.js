const TASKS_VERSION = '0.10.14';
const JSDELIVR_TASKS = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`;
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export default class HandTrackingManager {
    constructor(opts = {}) {
        this.video = opts.video || null;
        this.debugLog = opts.debugLog || (() => {});
        this.landmarker = null;
        this.ready = false;
        this.error = null;
        this.onResult = opts.onResult || (() => {});
        this.inferenceMs = 0;
        this.lastResult = null;
        this.numHands = opts.numHands || 2;
        this.worldUsable = true;
        this._badWorld = 0;
        this._recreated = false;
        const ua = navigator.userAgent || '';
        this.isIOS = /iPhone|iPad|iPod/.test(ua);
    }

    async init() {
        if (this.ready) return;
        try {
            const { FilesetResolver, HandLandmarker } = await import(/* @vite-ignore */ JSDELIVR_TASKS);
            const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
            const fallbackToCPU = this.isIOS;
            this.HandLandmarker = HandLandmarker;
            this.fileset = fileset;
            this.landmarker = await this._create(fallbackToCPU ? 'CPU' : 'GPU');
            this.ready = true;
        } catch (e) {
            this.error = e;
            this.debugLog('TRACK', 'init failed', e && e.message);
            throw e;
        }
    }

    async _create(delegate) {
        const opts = {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: 'VIDEO',
            numHands: this.numHands,
            minHandDetectionConfidence: 0.65,
            minHandPresenceConfidence: 0.6,
            minTrackingConfidence: 0.5
        };
        try {
            return await this.HandLandmarker.createFromOptions(this.fileset, opts);
        } catch (e) {
            if (delegate === 'GPU') {
                this.debugLog('TRACK', 'GPU delegate failed, falling back to CPU');
                return await this.HandLandmarker.createFromOptions(this.fileset, Object.assign({}, opts, { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' } }));
            }
            throw e;
        }
    }

    detect(now) {
        if (!this.ready || !this.video || this.video.readyState < 2) return null;
        try {
            const t0 = performance.now();
            const res = this.landmarker.detectForVideo(this.video, now);
            this.inferenceMs = performance.now() - t0;
            const out = this._shape(res);
            this.lastResult = out;
            this._watchWorld(out);
            this.onResult(out);
            return out;
        } catch (e) {
            this.debugLog('TRACK', 'detect failed', e && e.message);
            return null;
        }
    }

    // iOS/WebGL sometimes returns world landmarks as NaN — recreate on CPU so 3D pose/scale still work
    _watchWorld(out) {
        let bad = 0;
        for (const h of out.hands) {
            for (const p of h.world) {
                if (!Number.isFinite(p[0])) { bad++; break; }
            }
            if (bad) break;
        }
        if (!out.hands.length || !out.hands[0].world.length) bad = 3;
        this.worldUsable = bad === 0;
        if (bad > 0) {
            this._badWorld++;
            if (this._badWorld > 4 && !this._recreated && this.landmarker) {
                this._recreated = true;
                this.debugLog('TRACK', 'world landmarks missing — recreating on CPU');
                this._create('CPU').then((lm) => {
                    try { this.landmarker.close(); } catch (e) {}
                    this.landmarker = lm;
                    this._badWorld = 0;
                }).catch((e) => this.debugLog('TRACK', 'CPU recreate failed', e && e.message));
            }
        } else {
            this._badWorld = 0;
        }
    }

    _shape(res) {
        const hands = [];
        const n = Math.min((res.landmarks || []).length, (res.worldLandmarks || []).length);
        for (let i = 0; i < n; i++) {
            const ndc = res.landmarks[i];      // [[x,y,z], ...21] normalized
            const world = res.worldLandmarks[i]; // meters, hand-rooted
            const score = (res.handedness && res.handedness[i]) ? res.handedness[i][0].score : 0;
            const label = (res.handedness && res.handedness[i]) ? res.handedness[i][0].categoryName : 'Unknown';
            hands.push({ ndc, world, score, label });
        }
        return { hands, timestamp: performance.now() };
    }

    close() {
        if (this.landmarker) { try { this.landmarker.close(); } catch (e) {} }
        this.landmarker = null;
        this.ready = false;
    }
}