/* Hand-drawn canvas line chart. drawChart(canvas, points[[t,v]], {color, base, exitLine}) */
function drawChart(cv, pts, o) {
  o = o || {}; const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, w, h);
  if (!pts || pts.length < 2) { x.fillStyle = '#8e8e93'; x.font = '13px -apple-system,sans-serif'; x.textAlign = 'center'; x.fillText('No data yet', w / 2, h / 2); return; }
  const vs = pts.map(p => p[1]).concat(o.base != null ? [o.base] : []).concat(o.exitLine != null ? [o.exitLine] : []);
  let lo = Math.min(...vs), hi = Math.max(...vs); if (hi === lo) { hi += 1; lo -= 1; } const pad = (hi - lo) * .12; lo -= pad; hi += pad;
  const X = i => i / (pts.length - 1) * w, Y = v => h - (v - lo) / (hi - lo) * h;
  const col = o.color || (pts[pts.length - 1][1] >= (o.base != null ? o.base : pts[0][1]) ? '#00d35a' : '#ff453a');
  const dash = (v, c) => { x.save(); x.setLineDash([3, 4]); x.strokeStyle = c; x.lineWidth = 1; x.beginPath(); x.moveTo(0, Y(v)); x.lineTo(w, Y(v)); x.stroke(); x.restore(); };
  if (o.base != null) dash(o.base, '#38383a');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
  x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(X(i), Y(p[1])) : x.moveTo(0, Y(p[1]))); x.lineTo(w, h); x.lineTo(0, h); x.closePath(); x.fillStyle = g; x.fill();
  x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(X(i), Y(p[1])) : x.moveTo(0, Y(p[1]))); x.strokeStyle = col; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke();
  if (o.exitLine != null) { dash(o.exitLine, '#ff9f0a'); x.fillStyle = '#ff9f0a'; x.font = '600 11px -apple-system,sans-serif'; x.fillText('exit', 4, Y(o.exitLine) - 4); }
  const lx = w, ly = Y(pts[pts.length - 1][1]); x.fillStyle = col; x.beginPath(); x.arc(lx - 3, ly, 3.5, 0, 7); x.fill();
}
