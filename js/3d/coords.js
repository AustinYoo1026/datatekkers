/* ISO FOOTBALL 3D — coordinate system shared by every js/3d module.
   Sim space: x = depth (goal at x = FW), y = width, z = height, in pixels.
   World space (metres, right-handed, Y up): goal line at wz = 0, play at wz > 0, wx across (+x = right when facing goal). */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});
  const C = ISO.C;
  const S = 0.05, GCY = (C.GY0 + C.GY1) / 2 - 0;   // metres per sim px; goal centre y (360)
  const K = (R3D.K = {
    S, GCY, FW: C.FW, FH: C.FH,
    depth: C.FW * S,                    // 17 m of playable depth
    width: C.FH * S,                    // 36 m of playable width
    half: (C.FH * S) / 2,
    goalW: (C.GY1 - C.GY0) * S,         // 7.5 m
    goalH: C.BAR * S,                   // 3.0 m
    goalD: C.GD * S,                    // 1.7 m
    postR: 0.06,
    boxD: C.BOXD * S, boxHalf: (C.BOXY1 - C.BOXY0) / 2 * S,
    sixD: C.SIXD * S, sixHalf: (C.SIXY1 - C.SIXY0) / 2 * S,
    penD: C.PEN * S,
    ballR: 0.2,
    PI: Math.PI,
    // sim -> world
    wx: (sy) => (sy - GCY) * S,
    wz: (sx) => (C.FW - sx) * S,
    wy: (sz) => sz * S,
    toWorld(sx, sy, sz, out) { out = out || {}; out.x = (sy - GCY) * S; out.z = (C.FW - sx) * S; out.y = (sz || 0) * S; return out; },
    toSim(wx, wz, wy, out) { out = out || {}; out.x = C.FW - wz / S; out.y = wx / S + GCY; out.z = (wy || 0) / S; return out; },
    // sim facing angle (atan2(dy,dx)) -> model yaw (rotation.y, model forward = local +z)
    modelYaw: (face) => Math.PI - face,
  });
})();
