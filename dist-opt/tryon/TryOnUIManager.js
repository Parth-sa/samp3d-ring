const STATE_MESSAGES = {
    starting: 'Initializing virtual try-on…',
    waiting: 'Place your hand in front of the camera',
    detecting: 'Show your ring finger',
    tracking: 'Great — move your hand to see the ring follow',
    lowconf: 'Move your hand into better lighting',
    tooclose: 'Move your hand slightly farther away',
    toofar: 'Move your hand closer to the camera',
    lost: 'Show your hand to continue',
    multi: 'Show your selected hand',
    fingerhidden: 'Keep your ring finger visible',
    error: 'Virtual Try-On isn\'t available on this device'
};

export default class TryOnUIManager {
    constructor(opts = {}) {
        this.mount = opts.mount;
        this.onClose = opts.onClose || (() => {});
        this.onSwitchCam = opts.onSwitchCam || (() => {});
        this.onHand = opts.onHand || (() => {});
        this.onCapture = opts.onCapture || (() => {});
        this.onRetake = opts.onRetake || (() => {});
        this.onSave = opts.onSave || (() => {});
        this.onShare = opts.onShare || (() => {});
        this.onReset = opts.onReset || (() => {});
        this.onStartTryOn = opts.onStartTryOn || (() => {});
        this.activeHand = 'auto';
        this.state = 'idle';
        this._showCapture = false;
    }

    _el() {
        if (this.mountEl) return this.mountEl;
        const w = document.createElement('div');
        w.id = 'tryon-ui';
        w.style.cssText = [
            'position:fixed;inset:0;z-index:50;pointer-events:none;display:none;',
            'font-family:Arial,Helvetica,sans-serif;color:#fff;'
        ].join('');

        const brand = document.createElement('div');
        brand.style.cssText = 'position:absolute;top:16px;left:0;right:0;text-align:center;pointer-events:none;';
        brand.innerHTML = '<div style="font-family:Georgia,serif;font-size:22px;letter-spacing:.18em;text-transform:uppercase;text-shadow:0 1px 8px rgba(0,0,0,.45)">Larajewels</div>' +
            '<div style="font-size:10px;letter-spacing:.32em;color:rgba(255,255,255,.75);margin-top:2px">Virtual Try-On</div>';

        const instr = document.createElement('div');
        instr.id = 'tryon-instr';
        instr.style.cssText = 'position:absolute;top:96px;left:16px;right:16px;text-align:center;font-size:13px;letter-spacing:.04em;text-shadow:0 1px 6px rgba(0,0,0,.5);transition:opacity .3s';

        const btnBar = document.createElement('div');
        btnBar.style.cssText = 'position:absolute;bottom:110px;left:0;right:0;display:flex;justify-content:center;gap:10px;padding:0 12px;pointer-events:auto;flex-wrap:wrap';

        const makeBtn = (id, label, cls) => {
            const b = document.createElement('button');
            b.id = id; b.textContent = label;
            b.setAttribute('aria-label', label);
            b.style.cssText = [
                'pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,.4);',
                'background:rgba(20,20,20,.55);backdrop-filter:blur(6px);color:#fff;',
                'padding:10px 16px;border-radius:999px;font-size:12px;letter-spacing:.06em;',
                'outline-offset:2px;' + (cls ? cls : '')
            ].join(' ');
            b.addEventListener('focus', () => { b.style.outline = '2px solid #b98a2f'; });
            b.addEventListener('blur', () => { b.style.outline = 'none'; });
            return b;
        };

        const btnClose = makeBtn('tryon-close', 'Close Try-On', 'background:rgba(40,40,40,.8)');
        const btnSwitch = makeBtn('tryon-switch', 'Switch Camera');
        const btnHand = makeBtn('tryon-hand', 'Hand: Auto');
        const btnCap = makeBtn('tryon-capture', 'Capture', 'background:#b98a2f;border-color:transparent;font-weight:700');
        const btnReset = makeBtn('tryon-reset', 'Reset');
        btnBar.append(btnClose, btnSwitch, btnHand, btnCap, btnReset);

        const bottom = document.createElement('div');
        bottom.id = 'tryon-bottom';
        bottom.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:0 16px 18px;pointer-events:none';

        const note = document.createElement('div');
        note.style.cssText = 'text-align:center;font-size:10px;color:rgba(255,255,255,.65);text-shadow:none;margin-top:8px;position:relative;z-index:2;';
        note.innerHTML = 'Virtual Try-On Preview<br><span style="opacity:.75">Camera preview stays on your device — nothing is uploaded.</span>';

        const capBox = document.createElement('div');
        capBox.id = 'tryon-cap';
        capBox.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:3;display:none;pointer-events:auto;background:rgba(12,12,12,.9);border-radius:14px;padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.5);';
        capBox.innerHTML = '<img id="tryon-cap-img" alt="Captured Virtual Try-On" style="display:block;max-width:240px;max-height:300px;border-radius:8px">' +
            '<div style="display:flex;gap:8px;justify-content:center;margin-top:10px">' +
            '<button id="tryon-cap-retake" class="tbtn" style="' + this._btnCss() + '">Retake</button>' +
            '<button id="tryon-cap-save" class="tbtn" style="' + this._btnCss() + '">Save</button>' +
            '<button id="tryon-cap-share" class="tbtn" style="' + this._btnCss() + '">Share</button></div>';

        const errBox = document.createElement('div');
        errBox.id = 'tryon-err';
        errBox.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:4;display:none;background:rgba(12,12,12,.93);border-radius:14px;padding:22px;text-align:center;max-width:320px;pointer-events:auto;line-height:1.5;';
        errBox.innerHTML = '<div id="tryon-err-title" style="font-weight:700;font-size:14px;margin-bottom:6px"></div>' +
            '<div id="tryon-err-body" style="font-size:12px;color:#ccc"></div>' +
            '<div style="display:flex;gap:10px;justify-content:center;margin-top:14px">' +
            '<button id="tryon-err-cta" class="tbtn" style="' + this._btnCss('background:#b98a2f;border-color:transparent;') + '"></button>' +
            '<button id="tryon-err-cont" class="tbtn" style="' + this._btnCss() + '">Continue in 3D Viewer</button></div>';

        const boot = document.createElement('div');
        boot.id = 'tryon-boot';
        boot.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);';
        boot.innerHTML = '<button id="tryon-start" style="pointer-events:auto;cursor:pointer;border:none;background:#b98a2f;color:#fff;font-size:15px;font-weight:700;letter-spacing:.08em;padding:16px 34px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.4);">Allow Camera Access</button>';

        w.append(brand, instr, btnBar, bottom, capBox, errBox, boot);
        bottom.appendChild(note);
        this.mount.appendChild(w);
        this.mountEl = w;
        this._els = { instr, capBox, errBox, boot, capImg: capBox.querySelector('#tryon-cap-img') };

        boot.querySelector('#tryon-start').addEventListener('click', (e) => {
            e.stopPropagation();
            const start = boot.querySelector('#tryon-start');
            start.textContent = 'Starting…';
            start.disabled = true;
            this.onStartTryOn(start);
        });

        btnClose.addEventListener('click', () => this.onClose());
        btnSwitch.addEventListener('click', () => this.onSwitchCam());
        btnHand.addEventListener('click', () => {
            this.activeHand = this.activeHand === 'auto' ? 'left' : this.activeHand === 'left' ? 'right' : 'auto';
            btnHand.textContent = 'Hand: ' + this.activeHand[0].toUpperCase() + this.activeHand.slice(1);
            this.onHand(this.activeHand);
        });
        btnCap.addEventListener('click', () => this.onCapture());
        btnReset.addEventListener('click', () => this.onReset());
        capBox.querySelector('#tryon-cap-retake').addEventListener('click', () => this.onRetake());
        capBox.querySelector('#tryon-cap-save').addEventListener('click', () => this.onSave());
        capBox.querySelector('#tryon-cap-share').addEventListener('click', () => this.onShare());
        errBox.querySelector('#tryon-err-cta').addEventListener('click', () => this.onRetry());
        errBox.querySelector('#tryon-err-cont').addEventListener('click', () => this.onClose());

        this.bottomEl = bottom;
        this.btnBar = btnBar;
        return w;
    }

    _btnCss(extra = '') {
        return 'cursor:pointer;border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.12);color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;' + extra;
    }

    show(boot) {
        const w = this._el();
        w.style.display = 'block';
        this._els.boot.style.display = boot ? 'flex' : 'none';
    }

    hide() {
        if (this.mountEl) this.mountEl.style.display = 'none';
        this.hideCapture();
        this.hideError();
    }

    hideBoot() {
        if (this._els) this._els.boot.style.display = 'none';
    }

    setState(state) {
        this.state = state;
        if (!this._els) return;
        const msg = STATE_MESSAGES[state] || '';
        if (state === 'tracking') {
            this._els.instr.textContent = msg;
        } else if (state === 'lost' || state === 'lowconf' || state === 'multi' || state === 'fingerhidden') {
            this._els.instr.textContent = msg;
        } else {
            this._els.instr.textContent = msg || '';
        }
        this._els.instr.style.opacity = msg ? '1' : '0';
    }

    showCapture(url) {
        if (!this._els) return;
        this._els.capImg.src = url;
        this._els.capBox.style.display = 'block';
        this.btnBar.style.opacity = '0.25';
        this.btnBar.style.pointerEvents = 'none';
        this._showCapture = true;
    }

    hideCapture() {
        if (!this._els) return;
        this._els.capBox.style.display = 'none';
        if (this.btnBar) { this.btnBar.style.opacity = '1'; this.btnBar.style.pointerEvents = 'auto'; }
        this._showCapture = false;
    }

    showError(title, body, ctaLabel = 'Try Again') {
        if (!this._els) return;
        this._els.errBox.querySelector('#tryon-err-title').textContent = title;
        this._els.errBox.querySelector('#tryon-err-body').textContent = body;
        this._els.errBox.querySelector('#tryon-err-cta').textContent = ctaLabel;
        if (ctaLabel) this._els.errBox.querySelector('#tryon-err-cta').style.display = '';
        this._els.errBox.style.display = 'block';
    }

    hideError() {
        if (this._els) this._els.errBox.style.display = 'none';
    }
}