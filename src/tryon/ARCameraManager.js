export const CAM_STATE = {
    IDLE: 'idle',
    OPENING: 'opening',
    RUNNING: 'running',
    DENIED: 'denied',
    UNAVAILABLE: 'unavailable',
    BUSY: 'busy',
    FAILED: 'failed',
    STOPPED: 'stopped'
};

export default class ARCameraManager {
    constructor(opts = {}) {
        this.element = opts.element || null;
        this.debugLog = opts.debugLog || (() => {});
        this.state = CAM_STATE.IDLE;
        this.stream = null;
        this.desired = (opts.prefer || 'back'); // 'back' | 'front'
        this.currentFacing = null; // 'user' | 'environment'
        this.mirrored = false;
        this.videoWidth = 0;
        this.videoHeight = 0;
        this.lastError = null;
        this.onState = opts.onState || (() => {});
    }

    _set(state, err = null) {
        this.state = state;
        this.lastError = err;
        this.onState(state, err);
        this.debugLog('CAM', state, err ? err.message || err : '');
    }

    get isOpen() {
        return this.state === CAM_STATE.RUNNING;
    }

    async _open(facing) {
        const attempts = [
            { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
            { facingMode: { ideal: facing }, width: { ideal: 960 }, height: { ideal: 720 } },
            { facingMode: facing }
        ];
        let lastErr = null;
        for (const frame of attempts) {
            try {
                return await navigator.mediaDevices.getUserMedia({ video: frame, audio: false });
            } catch (e) {
                lastErr = e;
                if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) throw e; // do not bypass permission rejection
            }
        }
        throw lastErr || new Error('camera request failed');
    }

    async open() {
        if (this.isOpen) return this.stream;
        if (this.state === CAM_STATE.OPENING || this.state === CAM_STATE.BUSY) {
            throw new Error('camera busy');
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this._set(CAM_STATE.UNAVAILABLE, new Error('unsupported'));
            throw this.lastError;
        }
        if (!window.isSecureContext) {
            this._set(CAM_STATE.UNAVAILABLE, new Error('insecure context requires https'));
            throw this.lastError;
        }

        this._set(CAM_STATE.OPENING);
        const order = this.desired === 'front' ? ['user', 'environment'] : ['environment', 'user'];
        let stream = null;
        let used = null;
        for (const f of order) {
            try {
                stream = await this._open(f);
                used = f;
                break;
            } catch (e) {
                this.lastError = e;
                if (e && e.name === 'NotAllowedError') break; // permission denied — do not fall back silently
            }
        }
        if (!stream) {
            const err = this.lastError || new Error('no camera available');
            this._set(err && err.name === 'NotAllowedError' ? CAM_STATE.DENIED
                : (err && (err.name === 'NotSupportedError' || err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) ? CAM_STATE.UNAVAILABLE
                : CAM_STATE.FAILED, err);
            throw err;
        }
        this.stream = stream;
        this.currentFacing = used;
        this.mirrored = used === 'user';
        if (this.element) this.element.srcObject = stream;

        // Bind metadata + playback robustly across browsers (Safari/iOS included).
        if (this.element) {
            try {
                await new Promise((res, rej) => {
                    const el = this.element;
                    const done = () => { clearTimeout(t); el.removeEventListener('loadedmetadata', onMeta); el.removeEventListener('loadeddata', onMeta); res(); };
                    const onMeta = () => done();
                    const t = setTimeout(() => {
                        // Some Safari builds fire 'loadeddata' inside play(); if metadata alone
                        // never fires but canplay did, still proceed.
                        if (el.readyState >= 2) { done(); } else rej(new Error('video metadata timeout'));
                    }, 6000);
                    el.addEventListener('loadedmetadata', onMeta, { once: true });
                    el.addEventListener('loadeddata', onMeta, { once: true });
                    el.muted = true;
                    el.playsInline = true;
                    el.setAttribute('playsinline', '');
                    el.setAttribute('muted', '');
                });
                await this._play(this.element);
            } catch (e) {
                this.debugLog('CAM', 'video bind issue (recoverable)', e && e.message);
            }
            this.videoWidth = this.element.videoWidth || 0;
            this.videoHeight = this.element.videoHeight || 0;
        }
        this._set(CAM_STATE.RUNNING);
        return stream;
    }

    async _play(el) {
        try {
            if (el.paused || el.ended) await el.play();
        } catch (e) {
            this.debugLog('CAM', 'play blocked, waiting for gesture', e && e.message);
            // Retry on next interaction (some mobile browsers need a user gesture).
            const playAgain = () => { el.play().catch(() => {}); cleanup(); };
            const cleanup = () => {
                window.removeEventListener('pointerdown', playAgain);
                window.removeEventListener('touchend', playAgain);
            };
            window.addEventListener('pointerdown', playAgain);
            window.addEventListener('touchend', playAgain);
        }
    }

    async switchCamera() {
        if (!this.isOpen) return null;
        const next = this.currentFacing === 'user' ? 'environment' : 'user';
        const old = this.stream;
        this.stream = null;
        if (old) old.getTracks().forEach((t) => t.stop());
        this.desired = next === 'user' ? 'front' : 'back';
        this._set(CAM_STATE.OPENING);
        try {
            await this.open();
            return this.currentFacing;
        } catch (e) {
            this._set(CAM_STATE.FAILED, e);
            throw e;
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
            this.stream = null;
        }
        if (this.element) {
            this.element.srcObject = null;
            this.element.pause && this.element.pause();
        }
        this.currentFacing = null;
        this.mirrored = false;
        this._set(CAM_STATE.STOPPED);
    }
}