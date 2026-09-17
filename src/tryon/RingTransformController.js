import * as THREE from 'three';
import { clamp, lerp } from './landmarks.js';
import OneEuroSmoother, { SmoothedScalar } from './smoothing.js';
import RingScaleEstimator from './RingScaleEstimator.js';

export default class RingTransformController {
    constructor(opts = {}) {
        this.anchor = opts.anchor;           // THREE.Group ringTryOnAnchor
        this.camera = opts.camera;
        this.canvasEl = opts.canvasEl;
        this.product = opts.product;
        this.displayCanvas = opts.displayCanvas;
        this.debugLog = opts.debugLog || (() => {});
        this.scaleEstimator = new RingScaleEstimator({ modelDiag: opts.modelDiag || 1 });
        this.modelDiag = opts.modelDiag || 1;

        this.smX = new OneEuroSmoother(1.2, 0.04, 1.0);
        this.smY = new OneEuroSmoother(1.2, 0.04, 1.0);
        this.smDepth = new OneEuroSmoother(1.0, 0.05, 1.0);
        this.smScale = new SmoothedScalar(0.18);

        this.curQuat = new THREE.Quaternion();
        this.quatInit = false;
        this.alpha = 0;
        this.pos = new THREE.Vector3();
        this.quat = new THREE.Quaternion();
        this.scale = 1;
        this.pose = null;
        this.moving = 0;
        this.previewActive = false;
        this._spin = 0;
        this._exitGlide = 0;
        this._prevP = null;

        this._tmpQ0 = new THREE.Quaternion();
        this._tmpQ1 = new THREE.Quaternion();
        this._euler = new THREE.Euler();
        this._V = new THREE.Vector3(0, 0, 1);
        this._Y = new THREE.Vector3(0, 1, 0);
        this._z = new THREE.Vector3();
        this._n = new THREE.Vector3();
    }

    // Introduce the product BEFORE any hand tracking exists: render the ring
    // large & centered so the user sees it immediately, then glide it onto the
    // finger as soon as the first pose arrives.
    startPreview() {
        this.previewActive = true;
        this._spin = 0;
        this.alpha = Math.max(this.alpha, 0.15);
    }

    reset() {
        this.smX.reset(); this.smY.reset(); this.smDepth.reset(); this.smScale.reset();
        this.quatInit = false;
        this.alpha = 0;
        this.pose = null;
        this.previewActive = false;
        this._spin = 0;
    }

    _previewFrame(cal, dt) {
        // Scale: start from the tracked-scale estimate for a typical 20mm
        // finger, then inflate so the teaser ring dominates the screen.
        const est = this.scaleEstimator.estimate({ fingerWidthMM: 20, depth: 0.5, score: 1 }, cal);
        const target = Math.max(0.05, est * 11);
        this.scale = Math.max(0.02, this.smScale.update(target));

        this._spin += dt * 0.6;
        this._euler.set(0, 0, this._spin);
        this.quat.setFromEuler(this._euler);

        const off = (cal.tryOn || {}).positionOffset || {};
        this.pos.set(off.x || 0, 0.03 + (off.y || 0), -0.55 + (off.z || 0));

        this.alpha = Math.min(1, this.alpha + (1 - this.alpha) * Math.min(1, dt * 5));
        this._apply();
    }

    /**
     * @param {object|null} pose
     * @param {object} cal
     * @param {number} dt
     * @param {boolean} mirrored
     */
    update(pose, cal, dt, mirrored = false) {
        this.pose = pose;
        const tryOn = cal.tryOn || {};

        if (!pose) {
            if (this.previewActive) {
                this._previewFrame(cal, dt);
                return { alpha: this.alpha, visible: true, preview: true };
            }
            this.alpha = Math.max(0, this.alpha - dt * 1.4);
            this._apply();
            return { alpha: this.alpha, visible: this.alpha > 0.01 };
        }

        // First real pose — leave preview; the smoothers tween center -> finger.
        if (this.previewActive) {
            this.previewActive = false;
            this._exitGlide = 0.55;
            this._prevP = this.pos.clone();
        }

        // ---- position (tracking space, smoothed) ----
        // NDC is raw sensor space; when the displayed feed is mirrored
        // (front camera backdrop scaleX -1) flip x so the ring lands on the
        // correct (mirrored) finger.
        const rawX = mirrored ? 1 - pose.anchorX : pose.anchorX;
        const ax = this.smX.filter(rawX);
        const ay = this.smY.filter(pose.anchorY);
        const depth = this.smDepth.filter(pose.depth);

        const halfFov = (this.camera.fov * Math.PI / 180) / 2;
        const aspect = this.canvasEl.clientWidth / this.canvasEl.clientHeight;

        // calibration offsets (world-space, meters scaled to ring)
        const off = tryOn.positionOffset || {};

        const offX = (off.x || 0);
        const offY = (off.y || 0);
        const offZ = (off.z || 0);
        const TMP = new THREE.Vector3(
            (ax * 2 - 1) * aspect * Math.tan(halfFov) * depth + offX,
            (1 - ay * 2) * Math.tan(halfFov) * depth + offY,
            -depth + offZ
        );

        // glide from preview position to the finger over ~0.55s
        if (this._exitGlide > 0) {
            this._exitGlide = Math.max(0, this._exitGlide - dt);
            const k = this._exitGlide / 0.55;
            TMP.x = TMP.x * (1 - k) + (this._prevP ? this._prevP.x : 0) * k;
            TMP.y = TMP.y * (1 - k) + (this._prevP ? this._prevP.y : 0) * k;
            TMP.z = TMP.z * (1 - k) + (this._prevP ? this._prevP.z : 0) * k;
        }

        // ---- orientation ----
        const fwd = new THREE.Vector3(pose.fwd[0], pose.fwd[1], pose.fwd[2]);
        const nrm = new THREE.Vector3(pose.normal[0], pose.normal[1], pose.normal[2]);
        this._qFromBasis(fwd, nrm);

        // rotation calibration offset (degrees, local axis)
        const rOff = tryOn.rotationOffset || {};
        this._euler.set(
            (rOff.x || 0) * Math.PI / 180,
            (rOff.y || 0) * Math.PI / 180,
            (rOff.z || 0) * Math.PI / 180
        );
        this._tmpQ1.setFromEuler(this._euler);
        this._tmpQ0.multiply(this._tmpQ1);

        if (!this.quatInit) {
            this.curQuat.copy(this._tmpQ0);
            this.quatInit = true;
        } else {
            const rot = this.curQuat.angleTo(this._tmpQ0);
            const k = clamp(1 - rot / 6, 0.12, 0.6); // more smoothing when camera/pose still
            this.curQuat.slerp(this._tmpQ0, k);
        }

        // adaptive movement metric
        this.moving = this._tmpQ0.angleTo(this.curQuat) + Math.abs(pose.depth - depth) * 4;

        // ---- scale ----
        const s = this.smScale.update(this.scaleEstimator.estimate(pose, cal));
        this.scale = Math.max(0.02, s);

        // ---- visibility fade ----
        const want = pose.score > 0.45 ? 1 : 0.2;
        this.alpha = clamp(this.alpha + (want - this.alpha) * (pose.score > 0.45 ? Math.min(1, dt * 6) : dt * 2), 0, 1);

        this.pos.copy(TMP);
        this.quat.copy(this.curQuat);

        this._apply();
        return { alpha: this.alpha, visible: this.alpha > 0.01 };
    }

    _qFromBasis(fwd, normal) {
        this._z.copy(fwd).normalize();
        // right = forward x normal (y-down NDCSpace already handled by mirror)
        this._tmpQ0.setFromUnitVectors(this._V, this._z);
        const nLocal = this._n.copy(normal).applyQuaternion(this._tmpQ0.clone().invert());
        this._tmpQ1.setFromUnitVectors(this._Y, nLocal);
        this._tmpQ0.multiply(this._tmpQ1);
    }

    _apply() {
        this.anchor.position.copy(this.pos);
        this.anchor.quaternion.copy(this.quat);
        this.anchor.scale.setScalar(this.scale);
        this.anchor.children.forEach((c) => { c.visible = this.alpha > 0.01; });
        this.anchor.visible = this.alpha > 0.01;
    }
}