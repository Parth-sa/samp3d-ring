import ARCameraManager, { CAM_STATE } from './ARCameraManager.js';
import HandTrackingManager from './HandTrackingManager.js';
import FingerPoseEstimator from './FingerPoseEstimator.js';
import RingTransformController from './RingTransformController.js';
import RingOcclusionManager from './RingOcclusionManager.js';
import LightingEstimator from './LightingEstimator.js';
import ARRenderManager from './ARRenderManager.js';
import CaptureManager from './CaptureManager.js';
import TryOnUIManager from './TryOnUIManager.js';
import TryOnCalibrationManager from './TryOnCalibrationManager.js';
import TryOnDebug from './TryOnDebug.js';

const TRACK_MS = 66; // ~15fps inference

export default class VirtualTryOnManager {
    constructor(opts = {}) {
        this.product = opts.product;
        this.mount = opts.mount || document.body;
        this.video = opts.video;
        this.canvas = opts.canvas;
        this.exitUrl = opts.exitUrl || null;
        this.debugLog = opts.debugLog || ((...a) => console.debug(...a));
        this.occlusionEnabled = opts.occlusion !== false;

        this.state = 'idle';
        this.selectedHand = 'auto';
        this.active = false;
        this._lastTrack = 0;
        this._renderHash = 0;

        // calibration from ?cal=
        this.calibration = this._mergeCalibration(this.product);
        try {
            this.render = new ARRenderManager({
                canvas: this.canvas,
                video: this.video,
                product: this.product,
                modelUrl: this.product.modelUrl,
                envUrl: this.product.envUrl,
                debugLog: this.debugLog
            });
        } catch (e) {
            this.render = null;
        }

        this.debug = new TryOnDebug({ enabled: opts.debug, always: opts.diag });
        this.camera = new ARCameraManager({
            element: this.video,
            prefer: opts.cameraPrefer || 'back',
            debugLog: this.debugLog,
            onState: (s, err) => this._onCamState(s, err)
        });
        this.tracker = new HandTrackingManager({ video: this.video, debugLog: this.debugLog });
        this.estimator = new FingerPoseEstimator({ fovDeg: 55 });
        this.lighting = new LightingEstimator({ video: this.video });
        this.capture = new CaptureManager({ video: this.video, glCanvas: this.canvas, debugLog: this.debugLog });
        this.calibrationUI = new TryOnCalibrationManager({
            onSet: (v) => {
                this.calibration.tryOn.positionOffset = v.pos;
                this.calibration.tryOn.rotationOffset = v.rot;
                this.calibration.tryOn.scaleMultiplier = v.scale;
                this.calibration.tryOn.anchorRatio = v.anchor;
                this.controller.reset && this.controller.reset();
            },
            onSaved: (json, link) => {
                this.debugLog('CAL', 'saved', json, link);
                try { navigator.clipboard && navigator.clipboard.writeText(json); } catch (e) {}
            }
        });

        this.ui = new TryOnUIManager({
            mount: this.mount,
            onClose: () => this.close(),
            onSwitchCam: () => this._switchCam(),
            onHand: (h) => { this.selectedHand = h; this._onHandChange(); },
            onCapture: () => this._capture(),
            onRetake: () => this._retake(),
            onSave: () => this.capture.download(),
            onShare: () => this._share(),
            onReset: () => this._resetPose(),
            onStartTryOn: (btn) => this._begin(btn),
            onRetry: () => this._retry()
        });
    }

    _mergeCalibration(product) {
        const base = JSON.parse(JSON.stringify(product));
        base.tryOn = Object.assign(
            { enabled: true, finger: 'ring', anchorRatio: 0.5, positionOffset: { x: 0, y: 0, z: 0 }, rotationOffset: { x: 0, y: 0, z: 0 }, scaleMultiplier: 1 },
            base.tryOn || {}
        );
        const p = new URLSearchParams(location.search);
        const c = p.get('cal');
        if (c) {
            try { Object.assign(base.tryOn, JSON.parse(decodeURIComponent(c)).tryOn || {}); } catch (e) {}
        }
        return base;
    }

    async preload() {
        if (!this.render || this.render.loaded) return;
        try { await this.render.load(); this._postLoad(); } catch (e) { this.debugLog('VTO', 'preload failed', e); }
    }

    _postLoad() {
        this.controller = new RingTransformController({
            anchor: this.render.ringTryOnAnchor,
            camera: this.render.camera,
            canvasEl: this.render.canvas,
            product: this.product,
            modelDiag: this.render.modelDiag,
            debugLog: this.debugLog
        });
        this.occluder = this.occlusionEnabled ? new RingOcclusionManager({ scene: this.render.scene, modelDiag: this.render.modelDiag }) : null;
        this.calibrationUI.setProductCal(this.calibration);
    }

    show() {
        this.ui.show(true);
    }

    start() {
        this.ui.hideError();
        return this._begin(null);
    }

    async _begin(btn) {
        this._lastTrack = 0;
        this._resetPose();
        if (btn) { btn.disabled = true; btn.textContent = 'Starting camera…'; }

        // 1. Request camera permission + start the feed FIRST — the browser prompt must
        //    appear immediately on tap and the camera must show right away.
        if (!this.camera.isOpen) {
            try {
                await this.camera.open();
            } catch (e) {
                this._resetBootBtn(btn);
                const denied = this.camera.state === CAM_STATE.DENIED;
                const nf = this.camera.state === CAM_STATE.UNAVAILABLE;
                return this._failBoot(
                    nf ? 'No camera available'
                       : denied ? 'Camera permission denied'
                                : 'Unable to open camera',
                    nf ? 'No camera was found on this device. Continue in the 3D viewer instead.'
                       : denied ? 'Allow camera access in your browser settings, then tap Try Again.'
                                : (e.message || 'Unknown camera error')
                );
            }
        }

        // Camera stream is now live — bind to backdrop and reveal immediately.
        if (this.render && this.render.setStream) this.render.setStream(this.camera.stream);
        if (this.render && this.render.setMirror) this.render.setMirror(this.camera.mirrored);
        this.ui.hideBoot();
        this.ui.hideError();

        // 2. Load 3D model + env (usually already preloaded in background).
        try {
            if (!this.render) throw new Error('WebGL unavailable');
            if (!this.render.loaded) await this.preload();
        } catch (e) {
            this._resetBootBtn(btn);
            return this._failBoot('Virtual Try-On isn\'t available on this device', e.message);
        }

        // 3. Load hand tracking model.
        try { await this.tracker.init(); }
        catch (e) { this._resetBootBtn(btn); return this._failBoot('Virtual Try-On isn\'t available on this device', 'Hand tracking model could not load.'); }

        // Show the product immediately (large, centered teaser); the ring glides
        // onto the finger as soon as the first hand pose is detected.
        if (this.controller) { this.controller.startPreview(); }

        this.ui.hideBoot();
        this.ui.hideError();
        this.active = true;
        this.ui.show(false);
        this.lighting.onUpdate = (o) => {
            if (!this.render) return;
            this.render.scene.environmentIntensity = o.env;
            this.render.renderer.toneMappingExposure = o.exposure;
            this._lastLight = o;
        };
        this.lighting.start();
        this.state = 'waiting';
        this.ui.setState('waiting');
        this._loop = setInterval(() => this._track(), TRACK_MS);
        this._renderLoop();
        this.debugLog('VTO', 'try-on started');
    }

    _failBoot(title, body) {
        this.ui.show(false);
        this.ui.showError(title, body || 'Continue viewing the ring in the 3D viewer.', 'Try Again');
        return null;
    }

    _resetBootBtn() {
        this.ui.hideBoot && this.ui.hideBoot();
    }

    _retry() {
        this.ui.hideError();
        this.ui.show(true);
    }

    _onCamState(s) {
        if (this.active && (s === CAM_STATE.FAILED || s === CAM_STATE.DENIED || s === CAM_STATE.STOPPED)) {
            this._cleanup();
            this.ui.showError('Camera unavailable', 'Virtual Try-On can\'t continue with the camera off.', 'Try Again');
        }
    }

    async _switchCam() {
        if (!this.active) return;
        try {
            await this.camera.switchCamera();
            if (this.render && this.render.setStream) this.render.setStream(this.camera.stream);
            if (this.render && this.render.setMirror) this.render.setMirror(this.camera.mirrored);
            if (this.controller) this.controller.reset();
            this.debugLog('VTO', 'camera switched');
        } catch (e) { this.debugLog('VTO', 'switch failed', e); }
    }

    _onHandChange() { /* selection applied next track tick */ }
    _resetPose() { if (this.controller) { this.controller.reset(); } }

    _select(hands) {
        if (!hands.length) return null;
        if (this.selectedHand === 'auto') return hands[0];
        const want = this.selectedHand === 'left' ? 'Left' : 'Right';
        const found = hands.find((h) => h.label === want);
        if (found) return found;
        this._multiConflict = true;
        return null;
    }

    _track() {
        if (!this.active || !this.camera.isOpen || !this.controller) return;
        const now = performance.now();
        if (now - this._lastTrack < TRACK_MS - 5) return;
        this._lastTrack = now;
        const res = this.tracker.detect(now);
        if (!res) return;
        this._lastResult = res;
        if (!this._handsSeen && res.hands.length) { this._handsSeen = true; this.debugLog('VTO', 'hand detected'); }
        if (this._handsSeen && !this._poseSeen && this._trackRunStart) {
            const live = performance.now() - this._trackRunStart;
            if (live > 6000) {
                this.debugLog('VTO', 'hands seen but no pose for 6s — surfacing hint');
                this.ui.setState('fingerhidden');
            }
        }
        if (this._trackRunStart == null) this._trackRunStart = performance.now();

        const hands = res.hands.slice().sort((a, b) => b.score - a.score);
        const hand = this._select(hands);
        const annotated = hands.map((h) => Object.assign(h, { selected: h === hand }));

        let pose = null;
        if (hand && this.render) {
            const ratio = (this.calibration.tryOn.anchorRatio != null ? this.calibration.tryOn.anchorRatio : 0.5);
            pose = this.estimator.estimate(hand, this.render.canvas, ratio);
        }

        const dt = 0.06;
        const out = this.controller.update(pose, this.calibration, dt, !!(this.camera && this.camera.mirrored));

        // state machine
        let state;
        if (this.selectedHand !== 'auto' && this._multiConflict && !pose) state = 'multi';
        else if (!pose) {
            state = out.alpha < 0.01 ? 'detecting' : 'lost';
        } else if (pose.tooClose) state = 'tooclose';
        else if (pose.tooFar) state = 'toofar';
        else if (this._multiConflict) state = 'multi';
        else if (pose.score < 0.45) state = 'lowconf';
        else state = 'tracking';
        this.state = state;
        this.ui.setState(state);

        this._snapshot = {
            state, score: pose ? pose.score : null,
            poseOk: !!pose, alpha: this.controller.alpha,
            scale: this.controller.scale, depth: pose ? pose.depth : null,
            anchor: pose ? { x: pose.anchorX, y: pose.anchorY } : null,
            axis: pose ? { x: pose.fwd[0], y: pose.fwd[1] } : null,
            hands: annotated, occlusion: this.occlusionEnabled,
            camState: this.camera.state,
            saveCanvas: this.canvas
        };
    }

    _renderLoop() {
        if (this._raf) cancelAnimationFrame(this._raf);
        const tick = (time) => {
            if (!this.active) return;
            try {
                if (this.render) {
                    this.render.resize(window.innerWidth, window.innerHeight);
                    if (this.render.loaded) {
                        if (this.controller && this.controller.alpha > 0.01) {
                            this.occluder && this.occluder.update(this.controller, this.calibration);
                        }
                        // Always render: in-canvas backdrop shows the live video even
                        // before a hand pose is detected (alpha 0 ring stays hidden).
                        this.render.render();
                    } else {
                        this.render.clear();
                    }
                }
            } catch (e) { /* render hiccup */ }
            const snap = this._snapshot;
            if (snap) {
                snap.camRes = [this.camera.videoWidth, this.camera.videoHeight];
                snap.infFps = 1000 / TRACK_MS;
                this.debug.draw(snap);
            }
            this._raf = requestAnimationFrame(tick);
        };
        this._raf = requestAnimationFrame(tick);
    }

    async _capture() {
        if (!this.active || !this.camera.isOpen) return;
        this.ui.setState('tracking');
        try {
            const shot = await this.capture.capture();
            this.debugLog('VTO', 'captured', shot.width + 'x' + shot.height);
            this.ui.showCapture(shot.url);
        } catch (e) {
            this.debugLog('VTO', 'capture failed', e);
        }
    }

    _retake() {
        this.capture.reset();
        this.ui.hideCapture();
    }

    async _share() {
        const ok = await this.capture.share();
        if (!ok && this.capture.url) this.capture.download('larajewels-tryon.png');
    }

    // --- config API (live customization while tracking) ---
    setMetalProfile(hex, overrides = null) {
        if (this.render) this.render.setMetal(hex, overrides);
    }

    setDiamondConfig(cfg) {
        if (this.render) this.render.setDiamond(cfg);
    }

    setOcclusion(on) {
        this.occlusionEnabled = !!on;
        if (this.occluder) this.occluder.mesh.visible = on;
    }

    setCalibration(obj) {
        if (obj && obj.tryOn) Object.assign(this.calibration.tryOn, obj.tryOn);
        this.calibrationUI.setProductCal(this.calibration);
        if (this.controller) this.controller.reset();
    }

    openCalibration() { this.calibrationUI.show(); }

    _cleanup() {
        this.active = false;
        if (this._loop) clearInterval(this._loop);
        if (this._raf) cancelAnimationFrame(this._raf);
        this.lighting.stop();
        this.camera.stop();
        this.capture.reset();
    }

    close() {
        this._cleanup();
        this.ui.hide();
        this._snapshot = null;
        this.state = 'idle';
        if (this.render) this.render.clear();
        if (this.exitUrl && !/debug|cal=/.test(location.search)) location.href = this.exitUrl;
        this.debugLog('VTO', 'closed');
    }

    destroy() {
        this.close();
        if (this.tracker) this.tracker.close();
        if (this.occluder) this.occluder.dispose();
    }
}