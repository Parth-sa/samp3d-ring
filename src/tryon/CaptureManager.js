export default class CaptureManager {
    constructor(opts = {}) {
        this.video = opts.video;
        this.glCanvas = opts.glCanvas;
        this.debugLog = opts.debugLog || (() => {});
        this.canvas = null;
        this.url = null;
        this.blob = null;
    }

    _composite() {
        const vw = this.video.videoWidth || 1280;
        const vh = this.video.videoHeight || 720;
        const out = document.createElement('canvas');
        const w = Math.min(vw, 1920);
        const h = Math.round((vh / vw) * w);
        out.width = w; out.height = h;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);
        try { ctx.drawImage(this.video, 0, 0, w, h); } catch (e) {}
        try { ctx.drawImage(this.glCanvas, 0, 0, w, h); } catch (e) {}
        return out;
    }

    async capture() {
        if (!this.video) throw new Error('no video source');
        this.canvas = this._composite();
        await new Promise((r) => setTimeout(r, 10));
        this.url = this.canvas.toDataURL('image/png');
        this.blob = await new Promise((res, rej) =>
            this.canvas.toBlob((b) => b ? res(b) : rej(new Error('toBlob failed')), 'image/png')
        );
        return { url: this.url, blob: this.blob, width: this.canvas.width, height: this.canvas.height };
    }

    download(name = 'larajewels-tryon.png') {
        if (!this.url) return;
        const a = document.createElement('a');
        a.href = this.url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async share() {
        if (!this.blob) return false;
        if (navigator.canShare && navigator.canShare({ files: [new File([this.blob], 'larajewels-tryon.png', { type: 'image/png' })] })) {
            try {
                await navigator.share({
                    title: 'Larajewels Try-On',
                    text: 'Try this engagement ring on with Larajewels Virtual Try-On',
                    files: [new File([this.blob], 'larajewels-tryon.png', { type: 'image/png' })]
                });
                return true;
            } catch (e) {
                if (e && e.name === 'AbortError') return true;
                this.debugLog('CAPTURE', 'share failed', e.message);
                return false;
            }
        }
        return false;
    }

    reset() {
        if (this.url) URL.revokeObjectURL && URL.revokeObjectURL(this.url);
        this.canvas = null; this.url = null; this.blob = null;
    }
}