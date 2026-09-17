import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const DIAMOND_RE = /diamond|gem|emerald|sapphire|ruby|solitaire|stone/i;
const DRACO_URL = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';

export default class ARRenderManager {
    constructor(opts = {}) {
        this.canvas = opts.canvas;
        this.video = opts.video || null;
        this.product = opts.product || null;
        this.modelUrl = opts.modelUrl;
        this.envUrl = opts.envUrl;
        this.debugLog = opts.debugLog || (() => {});
        this.dprCap = opts.dprCap || 1.6;
        this.videoBackground = opts.videoBackground !== false;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: !this.videoBackground,
            antialias: true,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true
        });
        this.renderer.setClearColor(0x000000, this.videoBackground ? 1 : 0);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 12);
        this.camera.position.set(0, 0, 0);

        const key = new THREE.DirectionalLight(0xffffff, 2.0);
        key.position.set(5, 7, 9);
        this.scene.add(key);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // ring anchor — tracking updates ONLY this group
        this.ringTryOnAnchor = new THREE.Group();
        this.ringTryOnAnchor.name = 'ringTryOnAnchor';
        this.scene.add(this.ringTryOnAnchor);

        // Video background plane (drawn in-canvas for robust mobile compositing)
        if (this.videoBackground && this.video) {
            this._setupVideoBackdrop();
        }

        this.modelRoot = null;
        this.modelDiag = 1;
        this.metalMaterials = [];
        this.diamondMaterials = [];
        this.metalConfig = { color: '#c2c2c3', overrides: null };
        this.diamondConfig = null;
        this.metalDefaults = {
            envIntensity: 2.6, specularIntensity: 1, roughness: 0.06,
            clearcoat: 0.12, clearcoatRoughness: 0.09, emissive: null
        };
        this.loaded = false;
    }

    _setupVideoBackdrop() {
        this.backVideo = document.createElement('video');
        this.backVideo.setAttribute('playsinline', '');
        this.backVideo.setAttribute('muted', '');
        this.backVideo.muted = true;
        this.backVideo.playsInline = true;
        this.backVideo.crossOrigin = 'anonymous';
        this.backTexture = new THREE.VideoTexture(this.backVideo);
        this.backTexture.colorSpace = THREE.SRGBColorSpace;
        this.backTexture.minFilter = THREE.LinearFilter;
        this.backTexture.magFilter = THREE.LinearFilter;
        this.backTexture.mapping = null;

        const geo = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshBasicMaterial({ map: this.backTexture, depthTest: false, depthWrite: false });
        this.backPlane = new THREE.Mesh(geo, mat);
        this.backPlane.frustumCulled = false;
        this.backPlane.matrixAutoUpdate = false;
        this.backPlane.renderOrder = -1000; // always behind ring
        this.backPlane.onBeforeRender = () => {
            mat.visible = true;
        };
        this.scene.add(this.backPlane);

        // Kept private for mirror handling
        this._backG = geo;
        this._backM = mat;
    }

    // Bind the ARCameraManager stream to the backdrop video (duplicated so the
    // primary #cam element keeps a visible feed too).
    setStream(stream) {
        if (this.backVideo) {
            this.backVideo.srcObject = stream;
            this.backVideo.play().catch(() => {});
        }
    }

    // Resize backdrop plane to cover the current camera aspect (object-fit: cover).
    // Placed at far plane so the ring (depth 0.05..4) always renders in front.
    _layoutBackdrop() {
        if (!this.backVideo || !this.backVideo.videoWidth) return;
        const vw = this.backVideo.videoWidth, vh = this.backVideo.videoHeight;
        const zDist = 9; // behind ring range
        const vA = vw / vh;
        const vFov = this.camera.fov * Math.PI / 180;
        const camH = 2 * Math.tan(vFov / 2) * zDist;
        const camW = camH * this.camera.aspect;
        let qw = 1, qh = 1;
        if (vA >= this.camera.aspect) { qh = camH; qw = qh * vA; } else { qw = camW; qh = qw / vA; }
        this.backPlane.scale.set(this._mirrored ? -qw : qw, qh, 1);
        this.backPlane.position.set(0, 0, -zDist);
        this.backPlane.matrixAutoUpdate = true;
        this.backPlane.updateMatrix();
    }

    async load() {
        try {
            const rl = new RGBELoader();
            const envMap = await rl.loadAsync(this.envUrl);
            envMap.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = envMap;

            const draco = new DRACOLoader();
            draco.setDecoderPath(DRACO_URL);
            const gltf = new GLTFLoader();
            gltf.setDRACOLoader(draco);
            const cube = await gltf.loadAsync(this.modelUrl);

            const box = new THREE.Box3().setFromObject(cube.scene);
            if (box.isEmpty()) throw new Error('empty model bounds');
            const center = box.getCenter(new THREE.Vector3());
            this.modelDiag = box.getSize(new THREE.Vector3()).length() || 1;

            this.modelRoot = cube.scene;
            this.modelRoot.position.sub(center);

            // AR orientation: the product model is authored standing flat in
            // WebGI (hole axis = +Y, classic top-down ring view). A finger
            // points along +Z in tracking space, so rotate the hole axis onto
            // +Z. Without this the ring is seen edge-on — a few-pixel sliver
            // that looks like nothing on the hand.
            const modelAxis = ((this.product && this.product.tryOn && this.product.tryOn.modelAxis) || 'y').toLowerCase();
            if (modelAxis === 'y') {
                this.modelRoot.rotation.x = Math.PI / 2; // +Y -> +Z
            } else if (modelAxis === 'x') {
                this.modelRoot.rotation.z = -Math.PI / 2; // +X -> +Z
            }

            this.ringTryOnAnchor.add(this.modelRoot);
            this._buildMaterials();
            this.loaded = true;
        } catch (e) {
            this.debugLog('RENDER', 'load failed', e.message);
            throw e;
        }
    }

    _buildMaterials() {
        this.metalMaterials = [];
        this.diamondMaterials = [];
        this.modelRoot.traverse((c) => {
            if (!c.isMesh) return;
            const name = (c.name || '').toLowerCase();
            if (DIAMOND_RE.test(name)) {
                const d = new THREE.MeshPhysicalMaterial({
                    color: 0xffffff, metalness: 0, roughness: 0.05,
                    transmission: 0.92, thickness: 1.4, ior: 2.41,
                    envMapIntensity: 2.8, attenuationColor: 0xffffff, attenuationDistance: 2,
                    specularIntensity: 1.2, dispersion: 0.015, flatShading: false
                });
                c.material = d;
                this.diamondMaterials.push(d);
            } else {
                const m = this._makeMetal();
                c.material = m;
                this.metalMaterials.push(m);
            }
        });
    }

    _makeMetal() {
        const cfg = this.metalConfig.overrides || {};
        const def = this.metalDefaults;
        const m = new THREE.MeshPhysicalMaterial({
            color: this.metalConfig.color,
            metalness: 1,
            roughness: cfg.roughness != null ? cfg.roughness : def.roughness,
            envMapIntensity: cfg.envIntensity != null ? cfg.envIntensity : def.envIntensity,
            clearcoat: cfg.clearcoat != null ? cfg.clearcoat : def.clearcoat,
            clearcoatRoughness: cfg.clearcoatRoughness != null ? cfg.clearcoatRoughness : def.clearcoatRoughness,
            specularIntensity: cfg.specularIntensity != null ? cfg.specularIntensity : def.specularIntensity
        });
        const em = cfg.emissive != null ? cfg.emissive : def.emissive;
        if (em) { m.emissive = new THREE.Color(em); m.emissiveIntensity = 0.35; }
        return m;
    }

    setMetal(hex, overrides = null) {
        this.metalConfig.color = hex;
        this.metalConfig.overrides = overrides;
        this.metalMaterials.forEach((m) => {
            const cfg = overrides || {};
            m.color.set(hex);
            m.envMapIntensity = cfg.envIntensity != null ? cfg.envIntensity : this.metalDefaults.envIntensity;
            m.specularIntensity = cfg.specularIntensity != null ? cfg.specularIntensity : this.metalDefaults.specularIntensity;
            m.roughness = cfg.roughness != null ? cfg.roughness : this.metalDefaults.roughness;
            m.clearcoat = cfg.clearcoat != null ? cfg.clearcoat : this.metalDefaults.clearcoat;
            m.clearcoatRoughness = cfg.clearcoatRoughness != null ? cfg.clearcoatRoughness : this.metalDefaults.clearcoatRoughness;
            const em = cfg.emissive != null ? cfg.emissive : this.metalDefaults.emissive;
            if (em) m.emissive.set(em); else m.emissive.setHex(0x000000);
        });
    }

    setDiamond(cfg) {
        this.diamondConfig = cfg || {};
        const ds = this.diamondConfig;
        const rx = this.diamondConfig.rx || {};
        this.diamondMaterials.forEach((m) => {
            m.color.set(ds.color || 0xffffff);
            m.ior = ds.ior || rx.ior || 2.41;
            m.transmission = ds.transmission != null ? ds.transmission : (rx.transmission != null ? rx.transmission : 0.92);
            m.envMapIntensity = ds.envIntensity != null ? ds.envIntensity : (rx.envIntensity != null ? rx.envIntensity : 2.8);
            m.dispersion = rx.dispersion != null ? rx.dispersion : 0.015;
            m.thickness = rx.thickness != null ? rx.thickness : 1.4;
            if (rx.attenuationColor) m.attenuationColor.set(rx.attenuationColor);
            m.specularIntensity = rx.specularIntensity != null ? rx.specularIntensity : 1.2;
            m.attenuationDistance = rx.attenuationDistance != null ? rx.attenuationDistance : 2;
            if ('needsUpdate' in m) m.needsUpdate = true;
        });
    }

    resize(w, h) {
        const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this._layoutBackdrop();
    }

    setMirror(mirrored) {
        if (!this.backPlane) return;
        this._mirrored = !!mirrored;
        this._layoutBackdrop();
    }

    render() {
        // keep backdrop texture fresh from the bound camera stream
        if (this.backTexture && this.backVideo && this.backVideo.readyState >= 2) {
            this.backTexture.needsUpdate = true;
            if (!this._backLaid) { this._layoutBackdrop(); this._backLaid = true; }
        }
        if (this.videoBackground) {
            this.renderer.setClearColor(0x000000, 1);
        } else {
            this.renderer.setClearColor(0x000000, 0);
        }
        this.renderer.render(this.scene, this.camera);
    }

    clear() {
        this.renderer.setClearColor(0x000000, this.videoBackground ? 1 : 0);
        this.renderer.clear(true, false, false);
    }
}