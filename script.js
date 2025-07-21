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
  const btnLoadJSON  = document.getElementById('cargarJSON');
  const fileInput    = document.getElementById('fileInput');
  const salida       = document.getElementById('salida');
  const zoomInBtn    = document.getElementById('zoomIn');
  const zoomOutBtn   = document.getElementById('zoomOut');
  const resetZoomBtn = document.getElementById('resetZoom');

  const rectW       = 50;
  const rectH       = 150;
  const connectorR  = 5;
  const iconR       = 10;
  const cpRadius    = 6;
  const END_RADIUS  = 8;
  const CURVATURA   = 0.3;
  const dblTapDelay = 300;
  const MAX_LABELS  = 20; // Límite máximo de etiquetas

  let connectors         = [];
  let connections        = [];
  let labels             = [];
  let dragMode           = null;
  let activeStart        = null;
  let activeCPConn       = null;
  let activeLabel        = null;
  let activeArcEnd       = null;
  let selectedConnection = null;
  let activeConnector    = null;
  let labelOffset        = { x:0, y:0 };
  let lastTapTime        = 0;
  let jsonVisible        = false;
  
  // Variables para zoom
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  // Centering calculations
  const computedStyle = getComputedStyle(canvas);
  const paddingX = parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight);
  const paddingY = parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom);
  
  const totalW = rectCount * rectW;
  const baseStartX = (canvas.width - paddingX - totalW) / 2;
  const baseStartY = (canvas.height - paddingY - rectH) / 2;

  // Funciones de zoom
  function applyTransformation() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);
  }

  zoomInBtn.addEventListener('click', () => {
    scale = Math.min(scale * 1.2, 3);
    draw();
  });

  zoomOutBtn.addEventListener('click', () => {
    scale = Math.max(scale / 1.2, 0.5);
    draw();
  });

  resetZoomBtn.addEventListener('click', () => {
    scale = 1;
    panX = 0;
    panY = 0;
    draw();
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      draw();
    }
  });

  canvas.addEventListener('mouseup', () => {
    isPanning = false;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoom = Math.exp(wheel * zoomIntensity);
    
    const mouseX = e.clientX - canvas.getBoundingClientRect().left;
    const mouseY = e.clientY - canvas.getBoundingClientRect().top;
    
    const newScale = scale * zoom;
    if (newScale < 0.5 || newScale > 3) return;
    
    panX = mouseX - zoom * (mouseX - panX);
    panY = mouseY - zoom * (mouseY - panY);
    scale = newScale;
    
    draw();
  });

  // Función para sanitizar texto
  function sanitizeText(text) {
    return text.replace(/[^\w\s.,;:+\-=()]/gi, '');
  }

  // Generate connectors
  for (let i = 0, idCtr = 1; i < rectCount; i++) {
    const xMid = baseStartX + i*rectW + rectW/2;
    connectors.push({ id: idCtr++, x: xMid, y: baseStartY });
    connectors.push({ id: idCtr++, x: xMid, y: baseStartY + rectH });
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
    applyTransformation();
    
    // 1) Clemas & numbers
    ctx.strokeStyle = '#444'; ctx.fillStyle = '#000';
    ctx.font        = '14px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < rectCount; i++) {
      const x = baseStartX + i * rectW;
      ctx.strokeRect(x, baseStartY, rectW, rectH);
      ctx.fillText(i + 1, x + rectW / 2, baseStartY + rectH / 2);
    }

    // 2) Icons at 1/3 & 2/3
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    for (let i = 0; i < rectCount; i++) {
      const xm = baseStartX + i * rectW + rectW / 2;
      [1/3, 2/3].forEach(frac => {
        const ym = baseStartY + rectH * frac;
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
    labels.forEach(l => ctx.fillText(sanitizeText(l.text), l.x, l.y));
  }

  function drawPreview(mouse) {
    if (!activeStart) return;
    const p1  = activeStart;
    const dx  = mouse.x - p1.x;
    const dy  = mouse.y - p1.y;
    const mx2 = p1.x + dx/2;
    const my2 = p1.y + dy/2;
    const dir = (p1.y === baseStartY && mouse.y === baseStartY) ? -1 : 1;
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
    let x, y;
    
    if (e.touches && e.touches[0]) {
      x = e.touches[0].clientX - r.left;
      y = e.touches[0].clientY - r.top;
    } else {
      x = e.clientX - r.left;
      y = e.clientY - r.top;
    }
    
    // Ajustar para zoom y pan
    return {
      x: (x - panX) / scale,
      y: (y - panY) / scale
    };
  }

  // ─── DOUBLE-CLICK / DOUBLE-TAP EDIT ────────────────
  function handleDouble(x,y) {
    const arc = hitArc(x,y);
    if (!arc) {
      const lbl = hitLabel(x,y);
      if (lbl) {
        const txt = prompt('Edita etiqueta:', lbl.text);
        if (txt != null) {
          lbl.text = sanitizeText(txt); 
          saveState(); 
          draw();
        }
      }
      return;
    }

    colorPicker.value = arc.color;
    function finish() {
      arc.color = colorPicker.value; 
      saveState(); 
      draw();
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
    if (e.pointerType === 'touch') {
      e.preventDefault(); // Prevenir zoom en dispositivos táctiles
    }
    
    const { x,y } = toCanvas(e);
    const now     = Date.now();
    if (now - lastTapTime < dblTapDelay) {
      handleDouble(x,y); 
      lastTapTime = 0; 
      return;
    }
    lastTapTime = now;

    const connHit  = hitConnector(x,y);
    const cpHit    = hitCP(x,y);
    const labelHit = hitLabel(x,y);
    const arcHit   = !connHit && hitArc(x,y);

    if (arcHit) {
      selectedConnection = arcHit; 
      updateControls(); 
      draw(); 
      return;
    }
    
    activeConnector = connHit ? connHit.id : null;
    draw();

    if (selectedConnection && !arcHit && !connHit && !cpHit && !labelHit) {
      selectedConnection = null; 
      updateControls(); 
      draw(); 
      return;
    }
    
    if (cpHit) {
      dragMode='dragCP'; 
      activeCPConn=cpHit; 
      return;
    }
    
    if (selectedConnection) {
      const h = hitEnd(x,y);
      if (h) { 
        dragMode='dragEnd'; 
        activeArcEnd={conn:selectedConnection,end:h}; 
        return; 
      }
    }
    
    if (connHit && !activeStart) {
      activeStart=connHit; 
      dragMode='drawing'; 
      return;
    }
    
    if (connHit && activeStart && connHit.id!==activeStart.id) {
      const dx=connHit.x-activeStart.x, dy=connHit.y-activeStart.y;
      const mx2=activeStart.x+dx/2, my2=activeStart.y+dy/2;
      const dir=(activeStart.y===baseStartY && connHit.y===baseStartY)?-1:1;
      const cpX=mx2-dy*CURVATURA*dir, cpY=my2+dx*CURVATURA*dir;
      
      // Prevenir conexiones duplicadas (en ambos sentidos)
      const exists=connections.find(c => 
        (c.a === activeStart.id && c.b === connHit.id) || 
        (c.a === connHit.id && c.b === activeStart.id)
      );
      
      if (!exists) {
        connections.push({ 
          a: activeStart.id, 
          b: connHit.id, 
          cp: {x:cpX, y:cpY}, 
          color:'#0074D9' 
        });
        saveState();
      }
      activeStart=null; 
      dragMode=null; 
      draw(); 
      return;
    }
    
    if (labelHit && !arcHit) {
      dragMode='dragLabel'; 
      activeLabel=labelHit;
      labelOffset={x:x-labelHit.x,y:y-labelHit.y}; 
      return;
    }
    
    if (!connHit && !arcHit && !labelHit) {
      if (labels.length >= MAX_LABELS) {
        alert(`Máximo ${MAX_LABELS} etiquetas permitidas`);
        return;
      }
      
      const txt = prompt('Nueva etiqueta:');
      if (txt) { 
        labels.push({
          x, 
          y, 
          text: sanitizeText(txt)
        }); 
        saveState(); 
        draw(); 
      }
      return;
    }
    
    if (!arcHit) {
      selectedConnection=null; 
      updateControls();
    }
    draw();
  });

  canvas.addEventListener('pointermove', e => {
    const { x,y } = toCanvas(e);
    if (dragMode==='dragCP' && activeCPConn) {
      activeCPConn.cp.x = x; 
      activeCPConn.cp.y = y; 
      saveState(); 
      draw();
    }
    else if (dragMode==='drawing') {
      draw(); 
      drawPreview({x,y});
    }
    else if (dragMode==='dragLabel' && activeLabel) {
      activeLabel.x = x - labelOffset.x; 
      activeLabel.y = y - labelOffset.y;
      saveState(); 
      draw();
    }
    else if (dragMode==='dragEnd' && activeArcEnd) {
      draw();
      const { conn,end } = activeArcEnd;
      const other = end==='a'?conn.b:conn.a;
      const pO    = connectors.find(c=>c.id===other);
      ctx.strokeStyle = 'rgba(0,116,217,0.4)'; 
      ctx.lineWidth=2;
      ctx.beginPath(); 
      ctx.moveTo(pO.x,pO.y); 
      ctx.lineTo(x,y); 
      ctx.stroke();
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
        const dir= (p1.y===baseStartY && p2.y===baseStartY)?-1:1;
        conn.cp.x = mx2 - dy * CURVATURA * dir;
        conn.cp.y = my2 + dx * CURVATURA * dir;
        saveState();
      }
      dragMode=null; 
      activeArcEnd=null; 
      draw(); 
      return;
    }
    dragMode=null; 
    activeCPConn=null; 
    activeLabel=null;
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

    // Fondo blanco para todas las exportaciones
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, temp.width, temp.height);

    // 1) Clemas & numbers
    cx.strokeStyle = '#444'; cx.fillStyle = '#000';
    cx.font        = '14px sans-serif';
    cx.textAlign    = 'center';
    cx.textBaseline = 'middle';
    for (let i = 0; i < rectCount; i++) {
      const x = baseStartX + i * rectW;
      cx.strokeRect(x, baseStartY, rectW, rectH);
      cx.fillText(i + 1, x + rectW / 2, baseStartY + rectH / 2);
    }

    // 2) Icons at 1/3 & 2/3
    cx.strokeStyle = '#000'; cx.lineWidth = 2;
    for (let i = 0; i < rectCount; i++) {
      const xm = baseStartX + i * rectW + rectW / 2;
      [1/3, 2/3].forEach(frac => {
        const ym = baseStartY + rectH * frac;
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
    labels.forEach(l => cx.fillText(sanitizeText(l.text), l.x, l.y));

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
    saveState(); 
    updateControls(); 
    draw();
  });
  
  document.addEventListener('keydown', e => {
    if (e.key === 'Delete' && selectedConnection) {
      connections = connections.filter(c => c !== selectedConnection);
      selectedConnection = null;
      saveState(); 
      updateControls(); 
      draw();
    }
  });

  // Clear all
  btnClearAll.addEventListener('click', () => {
    if (!confirm('¿Estás seguro de que quieres borrar todas las conexiones y etiquetas?')) {
      return;
    }
    connections = [];
    labels      = [];
    selectedConnection = null;
    saveState(); 
    updateControls(); 
    draw();
  });

  // Cargar archivo JSON
  btnLoadJSON.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.connections) connections = data.connections;
        if (data.labels) labels = data.labels;
        saveState();
        updateControls();
        draw();
        alert('Estado cargado correctamente');
      } catch (error) {
        alert('Error al cargar el archivo: ' + error.message);
      }
    };
    reader.readAsText(file);
  });

  // Initial load & draw
  loadState();
  updateControls();
  draw();
}