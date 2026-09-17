const FIELDS = [
    ['pX', 'Pos X', -0.05, 0.05, 0.001], ['pY', 'Pos Y', -0.05, 0.05, 0.001], ['pZ', 'Pos Z', -0.05, 0.05, 0.001],
    ['rX', 'Rot X', -180, 180, 1], ['rY', 'Rot Y', -180, 180, 1], ['rZ', 'Rot Z', -180, 180, 1],
    ['sM', 'Scale', 0.4, 1.8, 0.01], ['aR', 'Anchor', 0.0, 1.0, 0.01]
];

export default class TryOnCalibrationManager {
    constructor(opts = {}) {
        this.visible = false;
        this.onSet = opts.onSet || (() => {});
        this.onSaved = opts.onSaved || (() => {});
        this.sel = null;
        this._build();
    }

    _build() {
        if (this.el) return;
        const el = document.createElement('div');
        el.id = 'tryon-cal';
        el.style.cssText = [
            'position:fixed;left:10px;top:50%;transform:translateY(-50%);z-index:60;display:none;',
            'background:rgba(18,18,18,.94);border:1px solid rgba(255,255,255,.15);border-radius:12px;',
            'padding:12px 14px;color:#eee;font-family:monospace;font-size:11px;width:210px'
        ].join(' ');
        el.innerHTML = '<div style="font-weight:700;margin-bottom:8px;letter-spacing:.05em">Ring Calibration</div>';
        const wrap = document.createElement('div');
        FIELDS.forEach(([id, label, lo, hi, step]) => {
            wrap.innerHTML += '<label style="display:flex;align-items:center;gap:6px;margin:4px 0"><span style="width:52px;color:#aaa">' + label + '</span>' +
                '<input type="range" min="' + lo + '" max="' + hi + '" step="' + step + '" id="cal-' + id + '" style="flex:1;accent-color:#b98a2f">' +
                '<span id="cal-val-' + id + '" style="width:52px;text-align:right;color:#fff"></span></label>';
        });
        el.appendChild(wrap);
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:6px;margin-top:10px;justify-content:space-between';
        bar.innerHTML = '<button id="cal-save" style="' + this._btn() + '">Save JSON</button>' +
            '<button id="cal-close" style="' + this._btn() + '">Close</button>';
        el.appendChild(bar);
        document.body.appendChild(el);
        this.el = el;
        this.wrap = wrap;

        FIELDS.forEach(([id]) => {
            el.querySelector('#cal-' + id).addEventListener('input', () => this._read());
        });
        el.querySelector('#cal-save').addEventListener('click', () => this._save());
        el.querySelector('#cal-close').addEventListener('click', () => this.hide());
    }

    _btn() { return 'cursor:pointer;border:1px solid #555;background:#333;color:#eee;border-radius:6px;padding:5px 8px;font-size:10px'; }

    _read() {
        const vals = {};
        FIELDS.forEach(([id]) => {
            const v = parseFloat(this.el.querySelector('#cal-' + id).value);
            this.el.querySelector('#cal-val-' + id).textContent = v.toFixed(3);
            vals[id] = v;
        });
        this._emit(vals);
    }

    _emit(vals) {
        const pos = { x: vals.pX, y: vals.pY, z: vals.pZ };
        const rot = { x: vals.rX, y: vals.rY, z: vals.rZ };
        this.onSet({ pos, rot, scale: vals.sM, anchor: vals.aR });
        this.lastVals = vals;
    }

    _save() {
        const json = JSON.stringify({
            positionOffset: this.lastVals ? { x: this.lastVals.pX, y: this.lastVals.pY, z: this.lastVals.pZ } : { x: 0, y: 0, z: 0 },
            rotationOffset: this.lastVals ? { x: this.lastVals.rX, y: this.lastVals.rY, z: this.lastVals.rZ } : { x: 0, y: 0, z: 0 },
            scaleMultiplier: this.lastVals ? this.lastVals.sM : 1,
            anchorRatio: this.lastVals ? this.lastVals.aR : 0.5
        });
        const link = location.origin + location.pathname + '?cal=' + encodeURIComponent(JSON.stringify({
            tryOn: JSON.parse(json)
        }));
        this.onSaved(json, link);
    }

    setProductCal(cal) {
        const t = cal.tryOn || {};
        const io = t.rotationOffset || {};
        const po = t.positionOffset || {};
        const map = { pX: po.x || 0, pY: po.y || 0, pZ: po.z || 0, rX: io.x || 0, rY: io.y || 0, rZ: io.z || 0, sM: t.scaleMultiplier || 1, aR: t.anchorRatio != null ? t.anchorRatio : 0.5 };
        FIELDS.forEach(([id, , lo, hi, step]) => {
            const inp = this.el.querySelector('#cal-' + id);
            inp.value = String(Math.min(hi, Math.max(lo, map[id])));
            this.el.querySelector('#cal-val-' + id).textContent = inp.value;
        });
        this.lastVals = map;
    }

    show() { this._build(); this.el.style.display = 'block'; this.visible = true; }
    hide() { if (this.el) this.el.style.display = 'none'; this.visible = false; }
    get isVisible() { return this.visible; }
}