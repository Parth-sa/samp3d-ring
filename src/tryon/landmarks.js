export const LM = {
    WRIST: 0,
    THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
    INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
    MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
    RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
    PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20
};

export const FINGER_TO_LM = {
    ring: { base: LM.RING_MCP, mid: LM.RING_PIP, tip: LM.RING_TIP },
    index: { base: LM.INDEX_MCP, mid: LM.INDEX_PIP, tip: LM.INDEX_TIP },
    middle: { base: LM.MIDDLE_MCP, mid: LM.MIDDLE_PIP, tip: LM.MIDDLE_TIP },
    pinky: { base: LM.PINKY_MCP, mid: LM.PINKY_PIP, tip: LM.PINKY_TIP }
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;