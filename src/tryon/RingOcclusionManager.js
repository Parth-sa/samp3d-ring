import * as THREE from 'three';

export default class RingOcclusionManager {
    constructor(opts = {}) {
        this.scene = opts.scene;
        this.modelDiag = opts.modelDiag || 1;
        this.factor = opts.factor != null ? opts.factor : 1.18; // cylinder radius multiplier over finger

        const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, true);
        const mat = new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            depthTest: true
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = -10;
        this.mesh.name = 'fingerOccluder';
        // default cylinder axis is +Y -> rotate so +Y maps to ring axis (+Z in model space)
        this.mesh.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    update(controller, cal) {
        const anchor = controller.anchor;
        const pose = controller.pose;
        if (!controller.alpha || !pose || !anchor.visible) {
            this.mesh.visible = false;
            return;
        }
        const s = controller.scale;
        const segM = (pose.raw ? pose.raw.segM : 25) / 1000; // meters
        const fingerWidthMM = pose.fingerWidthMM || s * 2000;

        // Occluder must fit inside the ring's INNER hole, not the finger width.
        // Ring outer dia in scene == finger width (by RingScaleEstimator fit), so:
        //   outerSceneR = fingerWidthMM/2000
        //   holeSceneR  = outerSceneR * innerMM/outerMM
        // If the cylinder pokes out past the hole it depth-occludes the whole
        // band and the ring vanishes.  Small margin keeps only finger + far band
        // occluded.
        const pd = (cal && cal.physicalDimensions) || {};
        const outerMM = pd.outerDiameterMM || 20;
        const innerMM = pd.innerDiameterMM || outerMM * 0.88;
        const holeSceneR = (fingerWidthMM / 2000) * (innerMM / outerMM) * 0.92;
        const localR = Math.max(1e-4, holeSceneR / 0.5);
        const localL = Math.max(1e-4, (segM / s) * 1.15);

        this.mesh.visible = true;
        this.mesh.position.set(anchor.position.x, anchor.position.y, anchor.position.z);
        this.mesh.quaternion.copy(anchor.quaternion);
        this.mesh.scale.set(localR, localL, localR);
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.scene.remove(this.mesh);
    }
}