
const { jsPDF } = window.jspdf;
const SERVER = 'http://localhost:5000';

// --- Global State ---
let images = [];          // { id, src, processed, name, bgDone, baked, offsetX, offsetY, zoom }
let layout = { total: 4, cols: 2, rows: 2 };
let photoSize = { w: 35, h: 45, name: 'Passport' };
let selectedColor = '#ffffff';

// Editor modal state
let editorIdx = -1;
let edImg = null;
let edCanvas, edCtx;
let edW, edH;
let edOffX = 0, edOffY = 0;
let edZoom = 1;
let edDragging = false;
let edDragStartX, edDragStartY, edDragOriginX, edDragOriginY;
let touchStartX, touchStartY;

// --- DOM Elements ---
const fileInput = document.getElementById('fileInput');
const zone = document.getElementById('zone');
const imgGrid = document.getElementById('imgGrid');
const removeBgBtn = document.getElementById('removeBgBtn');
const bgLabel = document.getElementById('bgLabel');
const bgProg = document.getElementById('bgProg');
const bgBar = document.getElementById('bgBar');
const pdfBtn = document.getElementById('pdfBtn');
const refreshPreviewBtn = document.getElementById('refreshPreviewBtn');
const prevWrap = document.getElementById('prevWrap');
const pageSizeSelect = document.getElementById('pageSize');
const tBorder = document.getElementById('tBorder');
const tGuides = document.getElementById('tGuides');
const tRepeat = document.getElementById('tRepeat');
const colorSwatches = document.getElementById('colorSwatches');
const colorLabel = document.getElementById('colorLabel');
const customColorInput = document.createElement('input'); // hidden color picker
customColorInput.type = 'color';
customColorInput.style.position = 'absolute';
customColorInput.style.opacity = '0';
customColorInput.style.width = '0';
customColorInput.style.height = '0';
document.body.appendChild(customColorInput);

// Summary spans
const sImgs = document.getElementById('sImgs');
const sProc = document.getElementById('sProc');
const sSize = document.getElementById('sSize');
const sLay = document.getElementById('sLay');
const sPages = document.getElementById('sPages');

// Editor modal elements
const editorModal = document.getElementById('editorModal');
const editorCanvas = document.getElementById('editorCanvas');
const zoomSlider = document.getElementById('zoomSlider');
const zoomVal = document.getElementById('zoomVal');
const resetPosBtn = document.getElementById('resetPosBtn');
const cancelEditorBtn = document.getElementById('cancelEditorBtn');
const applyPosBtn = document.getElementById('applyPosBtn');

// --- Helper: Toast ---
function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.className = type;
  t.innerHTML = (type === 'ok' ? '✅' : '⚠️') + ' <span>' + msg + '</span>';
  t.style.display = 'flex';
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => t.style.display = 'none', 3500);
}

// --- Server Health Check ---
async function checkServer() {
  const dot = document.getElementById('dot');
  const text = document.getElementById('status-text');
  try {
    const r = await fetch(SERVER + '/health', { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      dot.className = 'status-dot online';
      text.textContent = 'AI Ready';
      return true;
    }
  } catch { }
  dot.className = 'status-dot offline';
  text.textContent = 'AI Offline';
  return false;
}

// --- Upload & Load Images ---
function loadFiles(files) {
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      images.push({
        id: Date.now() + Math.random(),
        src: e.target.result,
        processed: e.target.result,
        name: file.name,
        bgDone: false,
        baked: null,
        offsetX: 0,
        offsetY: 0,
        zoom: 1
      });
      renderGrid();
      updateSummary();
      refreshPreview();
    };
    reader.readAsDataURL(file);
  });
}

function renderGrid() {
  imgGrid.innerHTML = '';
  images.forEach((img, i) => {
    const card = document.createElement('div');
    card.className = 'img-card';
    card.innerHTML = `
      <img src="${img.processed}" style="transform: scale(${img.zoom || 1}) translate(${(img.offsetX || 0) / (img.zoom || 1)}px,${(img.offsetY || 0) / (img.zoom || 1)}px); transform-origin:center;" />
      <button class="del" data-index="${i}">✕</button>
      <button class="edit-btn" data-index="${i}" title="Adjust position">✋</button>
      <span class="state-badge ${img.bgDone ? 'done' : 'raw'}">${img.bgDone ? 'BG removed' : 'original'}</span>
    `;
    imgGrid.appendChild(card);
  });
  bgLabel.textContent = images.length + ' image' + (images.length !== 1 ? 's' : '') + ' loaded';
  // Attach delete & edit events
  document.querySelectorAll('.del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.index);
      delImg(idx);
    });
  });
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.index);
      openEditor(idx);
    });
  });
}

function delImg(i) {
  images.splice(i, 1);
  renderGrid();
  updateSummary();
  refreshPreview();
}

// --- Background Removal via Local Server ---
async function removeBackgrounds() {
  if (!images.length) {
    toast('Upload images first', 'err');
    return;
  }
  const online = await checkServer();
  if (!online) {
    toast('Background removal is offline. Please start the rembg server.', 'err');
    return;
  }

  removeBgBtn.disabled = true;
  removeBgBtn.textContent = 'Processing...';
  bgProg.style.display = 'block';

  for (let i = 0; i < images.length; i++) {
    const percent = (i / images.length) * 100;
    bgBar.style.width = percent + '%';
    bgLabel.textContent = `Processing ${i + 1} / ${images.length}...`;

    // Show overlay spinner on card
    const cards = document.querySelectorAll('.img-card');
    if (cards[i] && !cards[i].querySelector('.overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.innerHTML = '<div class="spinner"></div><span>AI processing</span>';
      cards[i].appendChild(overlay);
    }

    try {
      const resp = await fetch(SERVER + '/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: images[i].src })
      });
      const data = await resp.json();
      if (data.success) {
        images[i].processed = data.image_base64;
        images[i].bgDone = true;
        images[i].baked = null;      // reset baked crop if any
        images[i].offsetX = 0;
        images[i].offsetY = 0;
        images[i].zoom = 1;
        toast(`Image ${i + 1} done in ${data.processing_time_s}s`);
      } else {
        toast(`Image ${i + 1} failed: ${data.error}`, 'err');
      }
    } catch (e) {
      toast(`Network error: ${e.message}`, 'err');
    }
    renderGrid(); // re-render to remove spinners
  }

  bgBar.style.width = '100%';
  setTimeout(() => {
    bgProg.style.display = 'none';
    bgBar.style.width = '0%';
  }, 800);
  removeBgBtn.disabled = false;
  removeBgBtn.textContent = '✨ Remove Backgrounds';
  refreshPreview();
  updateSummary();
}

// --- Size & Layout Pickers ---
function initSizePickers() {
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      photoSize = {
        w: parseFloat(btn.dataset.w),
        h: parseFloat(btn.dataset.h),
        name: btn.dataset.name
      };
      updateSummary();
      refreshPreview();
    });
  });
}

function initLayoutPickers() {
  document.querySelectorAll('.lay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lay-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      layout = {
        total: parseInt(btn.dataset.total),
        cols: parseInt(btn.dataset.cols),
        rows: parseInt(btn.dataset.rows)
      };
      updateSummary();
      refreshPreview();
    });
  });
}

// --- Color Picker ---
function initColorPicker() {
  colorSwatches.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', (e) => {
      if (sw.classList.contains('swatch-custom')) {
        customColorInput.click();
        customColorInput.onchange = (e) => {
          const hex = e.target.value;
          selectedColor = hex;
          document.querySelectorAll('.swatch').forEach(s => s.classList.remove('sel'));
          sw.classList.add('sel');
          colorLabel.textContent = `Selected: Custom (${hex})`;
          refreshPreview();
        };
        return;
      }
      const color = sw.dataset.color;
      if (color) {
        selectedColor = color;
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('sel'));
        sw.classList.add('sel');
        const title = sw.getAttribute('title') || color;
        colorLabel.textContent = `Selected: ${title} (${color})`;
        refreshPreview();
      }
    });
  });
}

// --- Summary Update ---
function updateSummary() {
  const n = images.length;
  const proc = images.filter(i => i.bgDone).length;
  const pagesNeeded = n > 0 ? Math.ceil(n / layout.total) : 0;
  sImgs.textContent = n;
  sProc.textContent = `${proc} / ${n}`;
  sSize.textContent = `${photoSize.w} × ${photoSize.h} mm`;
  sLay.textContent = `${layout.total} per page (${layout.cols}×${layout.rows})`;
  sPages.textContent = pagesNeeded;
}

// --- Page Dimensions ---
function getPageMM() {
  const val = pageSizeSelect.value;
  if (val === 'A4') return { w: 210, h: 297 };
  if (val === 'Letter') return { w: 216, h: 279 };
  return { w: 148, h: 210 };
}

// --- Preview Drawing (Canvas) ---
async function drawPageToCanvas(canvas, scale, pageIndex) {
  const page = getPageMM();
  const border = tBorder.classList.contains('on');
  const guides = tGuides.classList.contains('on');
  const repeat = tRepeat.classList.contains('on');
  const bgCol = selectedColor;

  canvas.width = page.w * scale;
  canvas.height = page.h * scale;
  const ctx = canvas.getContext('2d');

  // White paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pw = photoSize.w * scale;
  const ph = photoSize.h * scale;
  const gap = 3 * scale;
  const cols = layout.cols, rows = layout.rows;
  const totalW = cols * pw + (cols - 1) * gap;
  const totalH = rows * ph + (rows - 1) * gap;
  const startX = (canvas.width - totalW) / 2;
  const startY = (canvas.height - totalH) / 2;

  let list = [...images];
  if (repeat && list.length > 0) {
    while (list.length < layout.total) list.push(list[0]);
  }
  const offset = pageIndex * layout.total;
  const pageImgs = list.slice(offset, offset + layout.total);

  // Step 1: backgrounds & guides
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (pw + gap);
      const y = startY + r * (ph + gap);
      const brd = border ? 2 * scale : 0;
      const ix = x + brd, iy = y + brd, iw = pw - 2 * brd, ih = ph - 2 * brd;
      if (bgCol !== 'transparent') {
        ctx.fillStyle = bgCol;
        ctx.fillRect(ix, iy, iw, ih);
      }
      if (border) {
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5 * scale;
        ctx.strokeRect(x, y, pw, ph);
      }
      if (guides) {
        ctx.save();
        ctx.strokeStyle = 'rgba(180,180,180,0.5)';
        ctx.lineWidth = 0.4 * scale;
        ctx.setLineDash([3 * scale, 3 * scale]);
        const g = 5 * scale;
        const lines = [
          [x - g, y, x, y], [x + pw, y, x + pw + g, y],
          [x - g, y + ph, x, y + ph], [x + pw, y + ph, x + pw + g, y + ph],
          [x, y - g, x, y], [x, y + ph, x, y + ph + g],
          [x + pw, y - g, x + pw, y], [x + pw, y + ph, x + pw, y + ph + g]
        ];
        lines.forEach(([x1, y1, x2, y2]) => {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  // Step 2: draw images on top
  const promises = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= pageImgs.length) continue;
      const x = startX + c * (pw + gap);
      const y = startY + r * (ph + gap);
      const brd = border ? 2 * scale : 0;
      const ix = x + brd, iy = y + brd, iw = pw - 2 * brd, ih = ph - 2 * brd;
      const imgData = pageImgs[idx];
      const src = imgData.baked || imgData.processed;

      const p = new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const ar = img.width / img.height, tar = iw / ih;
          let sx = 0, sy = 0, sw = img.width, sh = img.height;
          if (ar > tar) {
            sw = img.height * tar;
            sx = (img.width - sw) / 2;
          } else {
            sh = img.width / tar;
            sy = (img.height - sh) / 2;
          }
          ctx.save();
          ctx.beginPath();
          ctx.rect(ix, iy, iw, ih);
          ctx.clip();
          ctx.drawImage(img, sx, sy, sw, sh, ix, iy, iw, ih);
          ctx.restore();
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      });
      promises.push(p);
    }
  }
  await Promise.all(promises);
}

async function refreshPreview() {
  if (!images.length) {
    prevWrap.innerHTML = '<div class="preview-placeholder">Upload images to preview</div>';
    return;
  }
  prevWrap.innerHTML = '<canvas id="pc" style="max-width:100%; max-height:340px;"></canvas>';
  const canvas = document.getElementById('pc');
  await drawPageToCanvas(canvas, 2.2, 0);
}

// --- PDF Generation ---
async function generatePDF() {
  if (!images.length) {
    toast('Upload at least one image first', 'err');
    return;
  }
  pdfBtn.disabled = true;
  pdfBtn.textContent = '⏳ Building PDF...';

  try {
    const page = getPageMM();
    const border = tBorder.classList.contains('on');
    const guides = tGuides.classList.contains('on');
    const repeat = tRepeat.classList.contains('on');
    const bgCol = selectedColor;

    const pdf = new jsPDF({
      orientation: page.h > page.w ? 'portrait' : 'landscape',
      unit: 'mm',
      format: [page.w, page.h]
    });

    let list = [...images];
    if (repeat && list.length > 0) {
      while (list.length < layout.total) list.push(list[0]);
    }

    const pagesCount = Math.ceil(list.length / layout.total);
    const pw = photoSize.w, ph = photoSize.h, gap = 3;
    const cols = layout.cols, rows = layout.rows;
    const totalW = cols * pw + (cols - 1) * gap;
    const totalH = rows * ph + (rows - 1) * gap;
    const startX = (page.w - totalW) / 2;
    const startY = (page.h - totalH) / 2;

    for (let pg = 0; pg < pagesCount; pg++) {
      if (pg > 0) pdf.addPage([page.w, page.h]);
      const pageImgs = list.slice(pg * layout.total, (pg + 1) * layout.total);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const x = startX + c * (pw + gap);
          const y = startY + r * (ph + gap);
          const brd = border ? 1 : 0;

          if (idx < pageImgs.length) {
            const imgData = pageImgs[idx];
            const src = imgData.baked || imgData.processed;
            try {
              const dataUrl = await resizeFor300dpi(src, pw, ph, border, bgCol);
              pdf.addImage(dataUrl, 'JPEG', x + brd, y + brd, pw - 2 * brd, ph - 2 * brd, undefined, 'FAST');
            } catch (e) { console.warn(e); }
          }
          if (border) {
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.3);
            pdf.rect(x, y, pw, ph, 'S');
          }
          if (guides) {
            pdf.setDrawColor(180, 180, 180);
            pdf.setLineWidth(0.15);
            pdf.setLineDashPattern([1, 1], 0);
            const g = 4;
            const guideLines = [
              [x - g, y, x, y], [x + pw, y, x + pw + g, y],
              [x - g, y + ph, x, y + ph], [x + pw, y + ph, x + pw + g, y + ph],
              [x, y - g, x, y], [x, y + ph, x, y + ph + g],
              [x + pw, y - g, x + pw, y], [x + pw, y + ph, x + pw, y + ph + g]
            ];
            guideLines.forEach(([x1, y1, x2, y2]) => pdf.line(x1, y1, x2, y2));
            pdf.setLineDashPattern([], 0);
          }
        }
      }
    }
    pdf.save(`photoprint-${Date.now()}.pdf`);
    toast('PDF downloaded!');
  } catch (err) {
    toast('Error: ' + err.message, 'err');
  } finally {
    pdfBtn.disabled = false;
    pdfBtn.textContent = '⬇ Download PDF';
  }
}

function resizeFor300dpi(src, wMM, hMM, hasBorder, bgCol) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const dpi = 300, mpi = 25.4;
      const pw = Math.round(wMM / mpi * dpi);
      const ph = Math.round(hMM / mpi * dpi);
      const cv = document.createElement('canvas');
      cv.width = pw; cv.height = ph;
      const ctx = cv.getContext('2d');
      if (bgCol && bgCol !== 'transparent') {
        ctx.fillStyle = bgCol;
        ctx.fillRect(0, 0, pw, ph);
      }
      const brd = hasBorder ? Math.round(dpi * 1 / mpi) : 0;
      const iw = pw - 2 * brd, ih = ph - 2 * brd;
      const ar = img.width / img.height, tar = iw / ih;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (ar > tar) {
        sw = img.height * tar;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / tar;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, brd, brd, iw, ih);
      resolve(cv.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = reject;
    img.src = src;
  });
}

// --- Editor Module ---
function openEditor(i) {
  editorIdx = i;
  const img = images[i];
  edOffX = img.offsetX || 0;
  edOffY = img.offsetY || 0;
  edZoom = img.zoom || 1;
  zoomSlider.value = Math.round(edZoom * 100);
  zoomVal.innerText = Math.round(edZoom * 100) + '%';

  edCanvas = editorCanvas;
  edCtx = edCanvas.getContext('2d');
  const aspect = photoSize.h / photoSize.w;
  edW = 420;
  edH = Math.round(edW * aspect);
  edCanvas.width = edW;
  edCanvas.height = edH;

  edImg = new Image();
  edImg.onload = () => drawEditor();
  edImg.src = img.processed;

  attachEditorEvents();
  editorModal.style.display = 'flex';
}

function drawEditor() {
  if (!edImg || !edCtx) return;
  edCtx.clearRect(0, 0, edW, edH);
  edCtx.fillStyle = '#2a2a2d';
  edCtx.fillRect(0, 0, edW, edH);
  if (selectedColor !== 'transparent') {
    edCtx.fillStyle = selectedColor;
    edCtx.fillRect(0, 0, edW, edH);
  }

  const baseScale = Math.min(edW / edImg.width, edH / edImg.height);
  const scale = baseScale * edZoom;
  const drawW = edImg.width * scale;
  const drawH = edImg.height * scale;
  const cx = edW / 2 + edOffX;
  const cy = edH / 2 + edOffY;
  edCtx.drawImage(edImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  edCtx.save();
  edCtx.strokeStyle = 'rgba(200,240,85,0.9)';
  edCtx.lineWidth = 2;
  edCtx.setLineDash([8, 5]);
  edCtx.strokeRect(2, 2, edW - 4, edH - 4);
  edCtx.setLineDash([]);
  edCtx.strokeStyle = '#c8f055';
  edCtx.lineWidth = 3;
  const m = 18;
  [[0, 0, 1, 0], [0, 0, 0, 1], [edW, 0, -1, 0], [edW, 0, 0, 1],
   [0, edH, 1, 0], [0, edH, 0, -1], [edW, edH, -1, 0], [edW, edH, 0, -1]]
    .forEach(([x, y, dx, dy]) => {
      edCtx.beginPath();
      edCtx.moveTo(x + dx * 2, y + dy * 2);
      edCtx.lineTo(x + dx * m, y + dy * m);
      edCtx.stroke();
    });
  edCtx.restore();
}

function attachEditorEvents() {
  const wrap = document.getElementById('editorWrap');
  const handleMouseDown = (e) => {
    edDragging = true;
    edDragStartX = e.clientX; edDragStartY = e.clientY;
    edDragOriginX = edOffX; edDragOriginY = edOffY;
  };
  const handleMouseMove = (e) => {
    if (!edDragging) return;
    edOffX = edDragOriginX + (e.clientX - edDragStartX);
    edOffY = edDragOriginY + (e.clientY - edDragStartY);
    drawEditor();
  };
  const handleMouseUp = () => { edDragging = false; };
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    edZoom = Math.min(3, Math.max(0.3, edZoom + delta));
    zoomSlider.value = Math.round(edZoom * 100);
    zoomVal.innerText = Math.round(edZoom * 100) + '%';
    drawEditor();
  };
  edCanvas.removeEventListener('mousedown', handleMouseDown);
  edCanvas.removeEventListener('mousemove', handleMouseMove);
  edCanvas.removeEventListener('mouseup', handleMouseUp);
  edCanvas.removeEventListener('wheel', handleWheel);
  edCanvas.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  edCanvas.addEventListener('wheel', handleWheel, { passive: false });
  window._editorCleanup = () => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };
}

function closeEditor() {
  if (window._editorCleanup) window._editorCleanup();
  editorModal.style.display = 'none';
  editorIdx = -1;
}

function applyPosition() {
  if (editorIdx < 0) return;
  images[editorIdx].offsetX = edOffX;
  images[editorIdx].offsetY = edOffY;
  images[editorIdx].zoom = edZoom;
  const bakeW = 1200, bakeH = Math.round(1200 * (photoSize.h / photoSize.w));
  const bakeCanvas = document.createElement('canvas');
  bakeCanvas.width = bakeW; bakeCanvas.height = bakeH;
  const bCtx = bakeCanvas.getContext('2d');
  bCtx.clearRect(0, 0, bakeW, bakeH);
  const scaleX = bakeW / edW, scaleY = bakeH / edH;
  const baseScale = Math.min(edW / edImg.width, edH / edImg.height);
  const scale = baseScale * edZoom;
  const drawW = edImg.width * scale * scaleX;
  const drawH = edImg.height * scale * scaleY;
  const cx = bakeW / 2 + edOffX * scaleX;
  const cy = bakeH / 2 + edOffY * scaleY;
  bCtx.drawImage(edImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  images[editorIdx].baked = bakeCanvas.toDataURL('image/png');
  closeEditor();
  renderGrid();
  refreshPreview();
  toast('Position applied ✓');
}

function resetPosition() {
  edOffX = 0; edOffY = 0; edZoom = 1;
  zoomSlider.value = 100;
  zoomVal.innerText = '100%';
  drawEditor();
}

// --- Event binding & initialization ---
function init() {
  checkServer();
  setInterval(checkServer, 10000);
  fileInput.addEventListener('change', (e) => loadFiles(Array.from(e.target.files)));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    loadFiles(files);
  });
  removeBgBtn.addEventListener('click', removeBackgrounds);
  pdfBtn.addEventListener('click', generatePDF);
  refreshPreviewBtn.addEventListener('click', refreshPreview);
  pageSizeSelect.addEventListener('change', () => refreshPreview());
  tBorder.addEventListener('click', function () { this.classList.toggle('on'); refreshPreview(); });
  tGuides.addEventListener('click', function () { this.classList.toggle('on'); refreshPreview(); });
  tRepeat.addEventListener('click', function () { this.classList.toggle('on'); refreshPreview(); });
  initSizePickers();
  initLayoutPickers();
  initColorPicker();
  zoomSlider.addEventListener('input', (e) => {
    edZoom = e.target.value / 100;
    zoomVal.innerText = e.target.value + '%';
    if (editorIdx !== -1) drawEditor();
  });
  resetPosBtn.addEventListener('click', resetPosition);
  cancelEditorBtn.addEventListener('click', closeEditor);
  applyPosBtn.addEventListener('click', applyPosition);
  editorModal.addEventListener('click', (e) => {
    if (e.target === editorModal) closeEditor();
  });
  updateSummary();
}

// Start the app
init();