// script.js

document.addEventListener('DOMContentLoaded', () => {
  const startup     = document.getElementById('startup');
  const workspace   = document.getElementById('workspace');
  const startBtn    = document.getElementById('startBtn');
  const numClemasIn = document.getElementById('numClemas');

  startBtn.addEventListener('click', () => {
    const count = parseInt(numClemasIn.value, 10);
    if (isNaN(count) || count < 1 || count > 24) {
      alert('Elige un número de clemas entre 1 y 24.');
      return;
    }
    startup.style.display   = 'none';
    workspace.style.display = 'block';
    init(count);
  });
});

function init(rectCount) {
  const canvas       = document.getElementById('lienzo');
  const ctx          = canvas.getContext('2d');
  const colorPicker  = document.getElementById('colorPicker');
  const btnExport    = document.getElementById('exportarEstado');
  const btnPNG       = document.getElementById('descargarPNG');
  const btnJPG       = document.getElementById('descargarJPG');
  const btnDeleteArc = document.getElementById('deleteArc');
  const btnClearAll  = document.getElementById('clearAll');
  const salida       = document.getElementById('salida');

  const rectW       = 50;
  const rectH       = 150;
  const connectorR  = 5;
  const iconR       = 10;
  const cpRadius    = 6;
  const END_RADIUS  = 8;
  const CURVATURA   = 0.3;
  const dblTapDelay = 300;

  let connectors         = [];
  let connections        = [];
  let labels             = [];
  let dragMode           = null;    // 'drawing'|'dragCP'|'dragLabel'|'dragEnd'
  let activeStart        = null;
  let activeCPConn       = null;
  let activeLabel        = null;
  let activeArcEnd       = null;    // { conn, end:'a'|'b' }
  let selectedConnection = null;
  let activeConnector    = null;    // id of pressed connector
  let labelOffset        = { x:0, y:0 };
  let lastTapTime        = 0;
  let jsonVisible        = false;   // Toggle for JSON panel

  // Centering calculations
  const totalW = rectCount * rectW;
  const startX = (canvas.width  - totalW) / 2;
  const startY = (canvas.height - rectH)  / 2;

  // Start with a clean localStorage key
  localStorage.removeItem('clema_' + rectCount);

  // Generate connectors (top and bottom)
  for (let i = 0, idCtr = 1; i < rectCount; i++) {
    const xMid = startX + i*rectW + rectW/2;
    connectors.push({ id: idCtr++, x: xMid, y: startY });
    connectors.push({ id: idCtr++, x: xMid, y: startY + rectH });
  }

  // Persistence
  function loadState() {
    const raw = localStorage.getItem('clema_' + rectCount);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      connections = s.connections || [];
      labels      = s.labels      || [];
    } catch {}
  }
  function saveState() {
    localStorage.setItem(
      'clema_' + rectCount,
      JSON.stringify({ connections, labels })
    );
  }
  function updateControls() {
    btnDeleteArc.disabled = !selectedConnection;
  }

  // Download JSON file
  function downloadJSON() {
    const data = JSON.stringify({ connections, labels }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = 'clemas.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ─── DRAWING ───────────────────────────────────────

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1) Clemas & numbers
    ctx.strokeStyle = '#444'; ctx.fillStyle = '#000';
    ctx.font        = '14px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < rectCount; i++) {
      const x = startX + i * rectW;
      ctx.strokeRect(x, startY, rectW, rectH);
      ctx.fillText(i + 1, x + rectW / 2, startY + rectH / 2);
    }

    // 2) Icons at 1/3 & 2/3
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    for (let i = 0; i < rectCount; i++) {
      const xm = startX + i * rectW + rectW / 2;
      [1/3, 2/3].forEach(frac => {
        const ym = startY + rectH * frac;
        ctx.beginPath();
        ctx.arc(xm, ym, iconR, 0, 2 * Math.PI);
        ctx.stroke();
        const d = iconR / Math.SQRT2;
        ctx.beginPath();
        ctx.moveTo(xm - d, ym - d);
        ctx.lineTo(xm + d, ym + d);
        ctx.stroke();
      });
    }

    // 3) Connections
    connections.forEach(conn => {
      const p1 = connectors.find(c => c.id === conn.a);
      const p2 = connectors.find(c => c.id === conn.b);
      ctx.strokeStyle = conn.color; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(conn.cp.x, conn.cp.y, p2.x, p2.y);
      ctx.stroke();

      if (conn === selectedConnection) {
        // curvature handle
        ctx.fillStyle = '#2ECC40';
        ctx.beginPath();
        ctx.arc(conn.cp.x, conn.cp.y, cpRadius, 0, 2 * Math.PI);
        ctx.fill();
        // end handles
        ctx.fillStyle = '#FFDC00';
        [p1, p2].forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, END_RADIUS, 0, 2 * Math.PI);
          ctx.fill();
        });
      }
    });

    // 3.1) Highlight selected ends
    if (selectedConnection) {
      const p1 = connectors.find(c => c.id === selectedConnection.a);
      const p2 = connectors.find(c => c.id === selectedConnection.b);
      ctx.fillStyle = '#FFD700';
      [p1, p2].forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, connectorR + 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // 4) Draw connectors
    connectors.forEach(c => {
      ctx.fillStyle = (c.id === activeConnector) ? '#FFD700' : '#FF4136';
      ctx.beginPath();
      ctx.arc(c.x, c.y, connectorR, 0, 2 * Math.PI);
      ctx.fill();
    });

    // 5) Draw labels
    ctx.fillStyle   = '#000'; ctx.font = '14px sans-serif';
    ctx.textAlign    = 'left'; ctx.textBaseline = 'top';
    labels.forEach(l => ctx.fillText(l.text, l.x, l.y));
  }

  function drawPreview(mouse) {
    if (!activeStart) return;
    const p1  = activeStart;
    const dx  = mouse.x - p1.x;
    const dy  = mouse.y - p1.y;
    const mx2 = p1.x + dx/2;
    const my2 = p1.y + dy/2;
    const dir = (p1.y === startY && mouse.y === startY) ? -1 : 1;
    const cpX = mx2 - dy * CURVATURA * dir;
    const cpY = my2 + dx * CURVATURA * dir;

    ctx.strokeStyle = 'rgba(0,116,217,0.4)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(cpX, cpY, mouse.x, mouse.y);
    ctx.stroke();
  }

  // ─── HIT-TESTS ─────────────────────────────────────

  function hitConnector(x,y) {
    return connectors.find(c => Math.hypot(c.x-x,c.y-y) < connectorR+4);
  }
  function hitCP(x,y) {
    return connections.find(conn =>
      conn === selectedConnection &&
      Math.hypot(conn.cp.x-x,conn.cp.y-y) < cpRadius+4
    );
  }
  function hitArc(x,y) {
    const tol=8;
    for (let conn of connections) {
      const p1=connectors.find(c=>c.id===conn.a);
      const p2=connectors.find(c=>c.id===conn.b);
      for (let t=0.02; t<0.98; t+=0.02) {
        const xt=(1-t)*(1-t)*p1.x + 2*(1-t)*t*conn.cp.x + t*t*p2.x;
        const yt=(1-t)*(1-t)*p1.y + 2*(1-t)*t*conn.cp.y + t*t*p2.y;
        if (Math.hypot(xt-x,yt-y)<tol) return conn;
      }
    }
  }
  function hitEnd(x,y) {
    if (!selectedConnection) return null;
    const p1=connectors.find(c=>c.id===selectedConnection.a);
    const p2=connectors.find(c=>c.id===selectedConnection.b);
    if (Math.hypot(p1.x-x,p1.y-y)<END_RADIUS) return 'a';
    if (Math.hypot(p2.x-x,p2.y-y)<END_RADIUS) return 'b';
  }
  function hitLabel(x,y) {
    for (let l of labels) {
      const w=ctx.measureText(l.text).width, h=14;
      if (x>=l.x&&x<=l.x+w&&y>=l.y&&y<=l.y+h) return l;
    }
  }
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - r.left,
               y: e.touches[0].clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ─── DOUBLE-CLICK / DOUBLE-TAP EDIT ────────────────

  function handleDouble(x,y) {
    const arc = hitArc(x,y);
    if (!arc) {
      const lbl = hitLabel(x,y);
      if (lbl) {
        const txt = prompt('Edita etiqueta:', lbl.text);
        if (txt != null) {
          lbl.text = txt; saveState(); draw();
        }
      }
      return;
    }

    colorPicker.value = arc.color;
    function finish() {
      arc.color = colorPicker.value; saveState(); draw();
    }
    colorPicker.addEventListener('input', finish,  { once: true });
    colorPicker.addEventListener('change', finish, { once: true });

    if (typeof colorPicker.showPicker === 'function') {
      colorPicker.showPicker();
    } else {
      colorPicker.click();
    }
  }

  // ─── POINTER EVENTS ────────────────────────────────

  canvas.addEventListener('pointerdown', e => {
    const { x,y } = toCanvas(e);
    const now     = Date.now();
    if (now - lastTapTime < dblTapDelay) {
      handleDouble(x,y); lastTapTime = 0; return;
    }
    lastTapTime = now;

    const connHit  = hitConnector(x,y);
    const cpHit    = hitCP(x,y);
    const labelHit = hitLabel(x,y);
    const arcHit   = !connHit && hitArc(x,y);

    if (arcHit) {
      selectedConnection = arcHit; updateControls(); draw(); return;
    }
    activeConnector = connHit ? connHit.id : null;
    draw();

    if (selectedConnection && !arcHit && !connHit && !cpHit && !labelHit) {
      selectedConnection = null; updateControls(); draw(); return;
    }
    if (cpHit) {
      dragMode='dragCP'; activeCPConn=cpHit; return;
    }
    if (selectedConnection) {
      const h = hitEnd(x,y);
      if (h) { dragMode='dragEnd'; activeArcEnd={conn:selectedConnection,end:h}; return; }
    }
    if (connHit && !activeStart) {
      activeStart=connHit; dragMode='drawing'; return;
    }
    if (connHit && activeStart && connHit.id!==activeStart.id) {
      const dx=connHit.x-activeStart.x, dy=connHit.y-activeStart.y;
      const mx2=activeStart.x+dx/2, my2=activeStart.y+dy/2;
      const dir=(activeStart.y===startY && connHit.y===startY)?-1:1;
      const cpX=mx2-dy*CURVATURA*dir, cpY=my2+dx*CURVATURA*dir;
      const exists=connections.find(c=>c.a===activeStart.id&&c.b===connHit.id);
      if (!exists) {
        connections.push({ a:activeStart.id, b:connHit.id, cp:{x:cpX,y:cpY}, color:'#0074D9' });
        saveState();
      }
      activeStart=null; dragMode=null; draw(); return;
    }
    if (labelHit && !arcHit) {
      dragMode='dragLabel'; activeLabel=labelHit;
      labelOffset={x:x-labelHit.x,y:y-labelHit.y}; return;
    }
    if (!connHit && !arcHit && !labelHit) {
      const txt=prompt('Nueva etiqueta:');
      if (txt) { labels.push({x,y,text:txt}); saveState(); draw(); }
      return;
    }
    if (!arcHit) {
      selectedConnection=null; updateControls();
    }
    draw();
  });

  canvas.addEventListener('pointermove', e => {
    const { x,y } = toCanvas(e);
    if (dragMode==='dragCP' && activeCPConn) {
      activeCPConn.cp.x = x; activeCPConn.cp.y = y; saveState(); draw();
    }
    else if (dragMode==='drawing') {
      draw(); drawPreview({x,y});
    }
    else if (dragMode==='dragLabel' && activeLabel) {
      activeLabel.x = x - labelOffset.x; activeLabel.y = y - labelOffset.y;
      saveState(); draw();
    }
    else if (dragMode==='dragEnd' && activeArcEnd) {
      draw();
      const { conn,end } = activeArcEnd;
      const other = end==='a'?conn.b:conn.a;
      const pO    = connectors.find(c=>c.id===other);
      ctx.strokeStyle = 'rgba(0,116,217,0.4)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(pO.x,pO.y); ctx.lineTo(x,y); ctx.stroke();
    }
  });

  canvas.addEventListener('pointerup', e => {
    const { x,y } = toCanvas(e);
    if (dragMode==='dragEnd' && activeArcEnd) {
      const target = hitConnector(x,y);
      if (target) {
        const { conn,end } = activeArcEnd;
        conn[end] = target.id;
        const p1 = connectors.find(c=>c.id===conn.a);
        const p2 = connectors.find(c=>c.id===conn.b);
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const mx2= p1.x + dx/2, my2= p1.y + dy/2;
        const dir= (p1.y===startY && p2.y===startY)?-1:1;
        conn.cp.x = mx2 - dy * CURVATURA * dir;
        conn.cp.y = my2 + dx * CURVATURA * dir;
        saveState();
      }
      dragMode=null; activeArcEnd=null; draw(); return;
    }
    dragMode=null; activeCPConn=null; activeLabel=null;
  });

  // Toggle JSON view + download
  btnExport.addEventListener('click', () => {
    jsonVisible = !jsonVisible;
    const old = document.getElementById('downloadJSON');
    if (old) old.remove();

    if (jsonVisible) {
      salida.textContent = JSON.stringify({ connections, labels }, null, 2);
      const dl = document.createElement('button');
      dl.id = 'downloadJSON';
      dl.textContent = 'Descarga el archivo';
      dl.style.marginTop = '10px';
      dl.addEventListener('click', downloadJSON);
      salida.parentNode.appendChild(dl);
    } else {
      salida.textContent = '';
    }
  });

  // Export graphic (PNG/JPG)
  function exportGraphic(type) {
    const temp = document.createElement('canvas');
    temp.width  = canvas.width;
    temp.height = canvas.height;
    const cx = temp.getContext('2d');

    // ** White background for JPEG **
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, temp.width, temp.height);

    // 1) Clemas & numbers
    cx.strokeStyle = '#444'; cx.fillStyle = '#000';
    cx.font        = '14px sans-serif';
    cx.textAlign    = 'center';
    cx.textBaseline = 'middle';
    for (let i = 0; i < rectCount; i++) {
      const x = startX + i * rectW;
      cx.strokeRect(x, startY, rectW, rectH);
      cx.fillText(i + 1, x + rectW / 2, startY + rectH / 2);
    }

    // 2) Icons at 1/3 & 2/3
    cx.strokeStyle = '#000'; cx.lineWidth = 2;
    for (let i = 0; i < rectCount; i++) {
      const xm = startX + i * rectW + rectW / 2;
      [1/3, 2/3].forEach(frac => {
        const ym = startY + rectH * frac;
        cx.beginPath();
        cx.arc(xm, ym, iconR, 0, 2 * Math.PI);
        cx.stroke();
        const d = iconR / Math.SQRT2;
        cx.beginPath();
        cx.moveTo(xm - d, ym - d);
        cx.lineTo(xm + d, ym + d);
        cx.stroke();
      });
    }

    // 3) Arcs
    cx.lineWidth = 3;
    connections.forEach(conn => {
      const p1 = connectors.find(c => c.id === conn.a);
      const p2 = connectors.find(c => c.id === conn.b);
      cx.strokeStyle = conn.color;
      cx.beginPath();
      cx.moveTo(p1.x, p1.y);
      cx.quadraticCurveTo(conn.cp.x, conn.cp.y, p2.x, p2.y);
      cx.stroke();
    });

    // 4) Labels
    cx.fillStyle   = '#000';
    cx.font        = '14px sans-serif';
    cx.textAlign    = 'left';
    cx.textBaseline = 'top';
    labels.forEach(l => cx.fillText(l.text, l.x, l.y));

    const mime = type === 'jpg' ? 'image/jpeg' : 'image/png';
    const url = temp.toDataURL(mime);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `clemas.${type}`;
    link.click();
  }

  btnPNG.addEventListener('click', () => exportGraphic('png'));
  btnJPG.addEventListener('click', () => exportGraphic('jpg'));

  // Delete connection
  btnDeleteArc.addEventListener('click', () => {
    if (!selectedConnection) return;
    connections = connections.filter(c => c !== selectedConnection);
    selectedConnection = null;
    saveState(); updateControls(); draw();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Delete' && selectedConnection) {
      connections = connections.filter(c => c !== selectedConnection);
      selectedConnection = null;
      saveState(); updateControls(); draw();
    }
  });

  // Clear all
  btnClearAll.addEventListener('click', () => {
    connections = [];
    labels      = [];
    selectedConnection = null;
    saveState(); updateControls(); draw();
  });

  // Initial load & draw
  loadState();
  updateControls();
  draw();
}
