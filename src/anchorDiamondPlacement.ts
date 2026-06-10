import {
    Mesh,
    Object3D,
    Vector3,
    Quaternion,
    MeshPhysicalMaterial,
    Color,
    IcosahedronGeometry,
    CylinderGeometry,
    ViewerApp
} from './webgi-re-exports';

export const MAIN_ANCHOR_NAME = 'MainAnchor';
export const SIDE_ANCHOR_PREFIX = 'RND_SIDE_Anchor';

export interface AnchorData {
    name: string;
    worldPosition: Vector3;
    worldRotation: Quaternion;
    worldScale: Vector3;
}

export interface DiamondConfig {
    type: 'round' | 'princess' | 'cushion' | 'oval' | 'emerald';
    size: number;
    color: string;
    zOffset: number;
    placeMain: boolean;
    placeSide: boolean;
    maintainOrientation: boolean;
    tableUp: boolean;
}

export interface PlacedDiamond {
    name: string;
    mesh: Mesh;
    anchorName: string;
    config: Partial<DiamondConfig>;
}

export class DiamondPlacementSystem {
    private viewer: ViewerApp | null = null;
    private ringModel: Object3D | null = null;
    private placedDiamonds: PlacedDiamond[] = [];
    private anchors: AnchorData[] = [];

    constructor(viewer?: ViewerApp) {
        this.viewer = viewer || null;
    }

    setViewer(viewer: ViewerApp): void {
        this.viewer = viewer;
    }

    setRingModel(model: Object3D): void {
        this.ringModel = model;
    }

    detectAnchors(): AnchorData[] {
        if (!this.ringModel) {
            this.anchors = [];
            return [];
        }

        const anchorRegex = new RegExp(`^${MAIN_ANCHOR_NAME}$|^${SIDE_ANCHOR_PREFIX}_?\\d*$`, 'i');
        const foundAnchors: Object3D[] = [];

        const traverse = (obj: Object3D): void => {
            if (obj.name && anchorRegex.test(obj.name)) {
                foundAnchors.push(obj);
            }
            obj.children?.forEach(traverse);
        };

        traverse(this.ringModel);

        this.anchors = foundAnchors.map(anchor => ({
            name: anchor.name,
            worldPosition: new Vector3(),
            worldRotation: new Quaternion(),
            worldScale: new Vector3()
        })).sort((a, b) => {
            if (a.name === MAIN_ANCHOR_NAME) return -1;
            if (b.name === MAIN_ANCHOR_NAME) return 1;
            const numA = parseInt(a.name.replace(/\D/g, '') || '0');
            const numB = parseInt(b.name.replace(/\D/g, '') || '0');
            return numA - numB;
        });

        foundAnchors.forEach((anchor, index) => {
            anchor.getWorldPosition(this.anchors[index].worldPosition);
            anchor.getWorldQuaternion(this.anchors[index].worldRotation);
            anchor.getWorldScale(this.anchors[index].worldScale);
        });

        return this.anchors;
    }

    getAnchors(): AnchorData[] {
        return this.anchors;
    }

    createDiamondGeometry(type: string, size: number): any {
        const scaledSize = size * 0.001;

        switch (type) {
            case 'round':
            case 'oval':
                return new IcosahedronGeometry(scaledSize * 0.5, 2);
            case 'princess':
                return new CylinderGeometry(scaledSize * 0.45, scaledSize * 0.45, scaledSize * 0.35, 4);
            case 'cushion':
                return new IcosahedronGeometry(scaledSize * 0.48, 1);
            case 'emerald':
                return new CylinderGeometry(scaledSize * 0.4, scaledSize * 0.35, scaledSize * 0.4, 6);
            default:
                return new IcosahedronGeometry(scaledSize * 0.5, 2);
        }
    }

    createDiamondMaterial(color: string): MeshPhysicalMaterial {
        const material = new MeshPhysicalMaterial({
            color: new Color(color).convertSRGBToLinear(),
            metalness: 0,
            roughness: 0,
            transmission: 0.95,
            ior: 2.6,
            envMapIntensity: 2.3,
            clearcoat: 0,
            clearcoatRoughness: 0,
            transparent: true,
            opacity: 1,
            specularIntensity: 1,
        });
        (material as any).thickness = 0.45;
        (material as any).dispersion = 0.012;
        (material as any).attenuationDistance = 50;
        (material as any).attenuationColor = new Color(0xffffff);
        (material as any).reflectivity = 0.5;
        // Add WEBGI_materials_diamond extension for DiamondPlugin
        (material as any).extensions = {
            WEBGI_materials_diamond: {
                metadata: { version: 4.6, type: 'DiamondMaterial', generator: 'DiamondMaterial.toJSON' },
                name: 'diamond-white-1',
                color: new Color(color).getHex(),
                envMapIntensity: 2.3,
                envMapIndex: 0,
                envMapRotationOffset: 0,
                dispersion: 0.012,
                squashFactor: 0.98,
                geometryFactor: 0.5,
                gammaFactor: 1.0,
                absorptionFactor: 1.0,
                reflectivity: 0.5,
                refractiveIndex: 2.6,
                rayBounces: 5,
                diamondOrientedEnvMap: 0,
                boostFactors: { x: 0.892, y: 0.892, z: 0.986, isVector3: true },
                transmission: 0.95,
                isDiamondMaterialParameters: true,
                type: 'DiamondMaterial',
                userData: { separateEnvMapIntensity: true }
            }
        };
        return material;
    }

    calculateTableUpRotation(currentRotation: Quaternion): Quaternion {
        const neg90X = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
        const result = new Quaternion();
        result.multiplyQuaternions(currentRotation, neg90X);
        return result;
    }

    placeDiamonds(config: DiamondConfig): PlacedDiamond[] {
        this.removeAllDiamonds();

        if (this.anchors.length === 0 || !this.ringModel) {
            console.warn('No anchors detected or no ring model set');
            return [];
        }

        const geometry = this.createDiamondGeometry(config.type, config.size);
        const material = this.createDiamondMaterial(config.color);
        const placed: PlacedDiamond[] = [];

        this.anchors.forEach((anchor, index) => {
            const isMain = anchor.name === MAIN_ANCHOR_NAME;

            if (isMain && !config.placeMain) return;
            if (!isMain && !config.placeSide) return;

            const diamond = new Mesh(geometry, material);

            diamond.name = isMain ? 'Center_Diamond' : `Side_Diamond_${String(index).padStart(3, '0')}`;

            const position = anchor.worldPosition.clone();
            position.z += config.zOffset;
            diamond.position.copy(position);

            if (config.maintainOrientation) {
                if (config.tableUp) {
                    diamond.quaternion.copy(this.calculateTableUpRotation(anchor.worldRotation));
                } else {
                    diamond.quaternion.copy(anchor.worldRotation);
                }
            } else if (config.tableUp) {
                diamond.rotation.set(-Math.PI / 2, 0, 0);
            }

            const avgScale = (anchor.worldScale.x + anchor.worldScale.y + anchor.worldScale.z) / 3;
            const scaleMultiplier = config.size / 4;
            diamond.scale.setScalar(avgScale * scaleMultiplier);

            this.ringModel.add(diamond);

            const placedDiamond: PlacedDiamond = {
                name: diamond.name,
                mesh: diamond,
                anchorName: anchor.name,
                config: { ...config }
            };

            this.placedDiamonds.push(placedDiamond);
            placed.push(placedDiamond);
        });

        if (this.viewer) {
            this.viewer.setDirty();
        }

        return placed;
    }

    removeAllDiamonds(): void {
        this.placedDiamonds.forEach(diamond => {
            if (diamond.mesh.parent) {
                diamond.mesh.parent.remove(diamond.mesh);
            }
            diamond.mesh.geometry?.dispose();
            if (Array.isArray(diamond.mesh.material)) {
                diamond.mesh.material.forEach(m => m.dispose());
            } else {
                diamond.mesh.material?.dispose();
            }
        });

        this.placedDiamonds = [];

        if (this.viewer) {
            this.viewer.setDirty();
        }
    }

    updateDiamondMaterial(color: string): void {
        this.placedDiamonds.forEach(diamond => {
            if (diamond.mesh.material) {
                const materials = Array.isArray(diamond.mesh.material) ? diamond.mesh.material : [diamond.mesh.material];
                materials.forEach(mat => {
                    if (mat instanceof MeshPhysicalMaterial) {
                        mat.color = new Color(color).convertSRGBToLinear();
                        mat.needsUpdate = true;
                    }
                });
            }
        });

        if (this.viewer) {
            this.viewer.setDirty();
        }
    }

    getPlacedDiamonds(): PlacedDiamond[] {
        return [...this.placedDiamonds];
    }

    getDiamondCount(): { main: number; side: number; total: number } {
        let main = 0;
        let side = 0;
        
        this.placedDiamonds.forEach(d => {
            if (d.anchorName === MAIN_ANCHOR_NAME) main++;
            else side++;
        });

        return { main, side, total: main + side };
    }

    exportPlacementData(): any {
        return {
            anchors: this.anchors.map(a => ({
                name: a.name,
                position: { x: a.worldPosition.x, y: a.worldPosition.y, z: a.worldPosition.z },
                rotation: { x: a.worldRotation.x, y: a.worldRotation.y, z: a.worldRotation.z, w: a.worldRotation.w },
                scale: { x: a.worldScale.x, y: a.worldScale.y, z: a.worldScale.z }
            })),
            diamonds: this.placedDiamonds.map(d => ({
                name: d.name,
                anchor: d.anchorName,
                position: { x: d.mesh.position.x, y: d.mesh.position.y, z: d.mesh.position.z }
            })),
            count: this.getDiamondCount()
        };
    }
}

export function createDefaultDiamondConfig(): DiamondConfig {
    return {
        type: 'round',
        size: 4,
        color: '#ffffff',
        zOffset: 0,
        placeMain: true,
        placeSide: true,
        maintainOrientation: true,
        tableUp: true
    };
}
