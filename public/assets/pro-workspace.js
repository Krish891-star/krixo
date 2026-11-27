/**
 * pro-workspace.js — Reusable visual PDF page thumbnail workspace for KriXo.
 *
 * Usage: import { initPdfWorkspace } from './pro-workspace.js';
 *
 * Call initPdfWorkspace(config) after a PDF file is accepted.  The workspace
 * renders a thumbnail grid, handles user interaction, and writes results back
 * into the existing hidden input fields that the processing handlers already
 * read — so zero handler code needs to change.
 *
 * Config shape:
 * {
 *   tool        : string   — data-tool value, drives interaction mode
 *   container   : Element  — where to inject the workspace (replaces existing content)
 *   file        : File     — the PDF File object
 *   bytes       : Uint8Array — PDF bytes (pre-read by caller to avoid double-read)
 *   pageCount   : number
 *   onReady     : () => void  — called when thumbnails are all rendered
 *   setStatus   : (msg, type) => void
 * }
 *
 * Interaction modes (determined by tool):
 *   'select'   — checkboxes, writes comma-separated 1-based page numbers to targetInput
 *   'order'    — drag-to-reorder + repeat, writes ordered list to targetInput
 *   'rotate'   — per-page rotation badges, writes rotation angle to #rotation and
 *                stores per-page rotation in workspace state for the enhanced rotate handler
 *   'preview'  — thumbnails only, no selection (pdf-to-jpg preview)
 *
 * Target input mapping (populated automatically):
 *   delete-pdf-pages   → #pages         (select mode, blank = no-op guard)
 *   extract-pdf-pages  → #pages         (select mode)
 *   split-pdf          → #page-ranges   (select mode)
 *   organize-pdf       → #page-order    (order mode)
 *   add-page-numbers   → (no page sel)  (preview mode)
 *   watermark-pdf      → (no page sel)  (preview mode)
 *   pdf-to-jpg         → #image-pages   (select mode)
 *   rotate-pdf         → per-page data  (rotate mode)
 */

import { renderPdfPages } from './pro-core.js';

/* ─── Constants ─── */
const THUMB_SCALE = 0.22;      // PDF-point scale for thumbnails (fast, low-res)
const THUMB_MAX_H = 160;       // max CSS height of a thumbnail image in px
const DRAG_THRESH = 4;         // px movement before drag starts
const MODES = {
  'delete-pdf-pages':  { mode: 'select',  input: '#pages',       multi: true  },
  'extract-pdf-pages': { mode: 'select',  input: '#pages',       multi: true  },
  'split-pdf':         { mode: 'select',  input: '#page-ranges', multi: true  },
  'organize-pdf':      { mode: 'order',   input: '#page-order',  multi: true  },
  'add-page-numbers':  { mode: 'preview', input: null,           multi: false },
  'watermark-pdf':     { mode: 'preview', input: null,           multi: false },
  'pdf-to-jpg':        { mode: 'select',  input: '#image-pages', multi: true  },
  'rotate-pdf':        { mode: 'rotate',  input: '#rotation',    multi: false },
};

const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ─── Public API ─── */

/**
 * initPdfWorkspace — main entry point.
 * Returns a workspace controller object so callers can query state.
 */
export async function initPdfWorkspace(config) {
  const { tool, container, file, bytes, pageCount, onReady, setStatus, isCurrent } = config;
  const cfg = MODES[tool];
  if (!cfg) return null;   // tool not in workspace map — silent no-op

  const ctrl = new PdfWorkspaceController({
    tool, container, file, bytes, pageCount,
    mode: cfg.mode, inputSel: cfg.input, multi: cfg.multi,
    onReady, setStatus, isCurrent
  });

  /* Publish before awaiting thumbnails so a newer selection can destroy this
     controller while it is still rendering. */
  window.pdfWorkspace = ctrl;
  await ctrl.init();
  if (ctrl.destroyed || (isCurrent && !isCurrent())) {
    ctrl.destroy();
    return null;
  }
  return ctrl;
}

/** Returns current page selection as a sorted array of 1-based page numbers */
export function getWorkspaceSelection() {
  return window.pdfWorkspace?.getSelection() ?? [];
}

/** Returns the ordered page list (for organize mode) as 1-based numbers */
export function getWorkspaceOrder() {
  return window.pdfWorkspace?.getOrder() ?? [];
}

/** Returns per-page rotation map { pageIndex(0-based): degrees } for rotate mode */
export function getWorkspaceRotations() {
  return window.pdfWorkspace?.getRotations() ?? new Map();
}

/* ─── Controller ─── */

class PdfWorkspaceController {
  constructor(opts) {
    this.tool       = opts.tool;
    this.container  = opts.container;
    this.file       = opts.file;
    this.bytes      = opts.bytes;
    this.pageCount  = opts.pageCount;
    this.mode       = opts.mode;
    this.inputSel   = opts.inputSel;
    this.multi      = opts.multi;
    this.onReady    = opts.onReady;
    this.setStatus  = opts.setStatus;
    this.isCurrent  = opts.isCurrent || null;

    /* State */
    this.pages       = Array.from({ length: opts.pageCount }, (_, i) => i);  // 0-based, in current order
    this.selected    = new Set();   // 0-based indices of selected pages (original index)
    this.rotations   = new Map();   // 0-based originalIndex → cumulative rotation (0/90/180/270)
    this.canvases    = new Map();   // 1-based pageNumber → canvas element
    this.rendered    = false;
    this.destroyed   = false;

    /* Drag-reorder state */
    this._drag = null;

    /* Listeners on DOM outside this container must be removed on destroy. */
    this._manualInput = null;
    this._manualHandler = null;

    /* Root element */
    this.root = null;
  }

  /* ── Initialise ── */

  async init() {
    this._buildShell();
    this._bindToolbar();
    await this._renderThumbnails();
    if (this.destroyed) return;
    this.rendered = true;
    const manual = this.inputSel ? document.querySelector(this.inputSel) : null;
    if ((this.mode === 'select' || this.mode === 'order') && manual?.value.trim()) {
      this._applyManual(manual.value);
      this._rebuildGrid();
      this._updateFooter();
      this._updateSelCount();
    } else {
      this._syncInput();
    }
    if (manual && (this.mode === 'select' || this.mode === 'order')) {
      this._manualInput = manual;
      this._manualHandler = () => {
        if (this.destroyed || this._writing) return;
        this._applyManual(manual.value);
        this._rebuildGrid();
        this._updateFooter();
        this._updateSelCount();
      };
      manual.addEventListener('input', this._manualHandler);
    }
    if (!this.destroyed && (!this.isCurrent || this.isCurrent())) this.onReady?.();
  }

  /* ── Shell HTML ── */

  _buildShell() {
    const modeLabel = {
      select:  this.tool === 'delete-pdf-pages'
      ? 'Click pages to delete them. Shift+click selects a range. Nothing is selected until you click.'
      : 'Click pages to include them. Shift+click selects a range.',
      order:   'Drag pages to reorder · double-click to duplicate',
      rotate:  'Click a page to rotate 90° · use ↺ / ↻ buttons for all pages',
      preview: 'PDF page overview'
    }[this.mode];

    const toolbar = this._toolbarHtml();

    this.root = document.createElement('div');
    this.root.className = 'ws-root';
    this.root.innerHTML = `
      <div class="ws-header">
        <span class="ws-info">${esc(this.file.name)} · ${this.pageCount} page${this.pageCount === 1 ? '' : 's'}</span>
        <span class="ws-hint">${modeLabel}</span>
      </div>
      ${toolbar}
      <div class="ws-loading" id="ws-loading" role="status" aria-live="polite">
        <span class="ws-spinner" aria-hidden="true"></span> Rendering thumbnails…
      </div>
      <div class="ws-grid" id="ws-grid" role="${this.mode === 'order' ? 'listbox' : 'group'}"
           aria-label="PDF page thumbnails" aria-multiselectable="${this.multi}">
      </div>
      <div class="ws-footer" id="ws-footer" aria-live="polite"></div>
    `;

    this.container.innerHTML = '';
    this.container.appendChild(this.root);
  }

  _toolbarHtml() {
    if (this.mode === 'preview') return '';

    if (this.mode === 'select') {
      return `
        <div class="ws-toolbar" role="toolbar" aria-label="Page selection controls">
          <button type="button" class="ws-btn" id="ws-select-all">Select all</button>
          <button type="button" class="ws-btn" id="ws-select-none">Clear selection</button>
          <button type="button" class="ws-btn" id="ws-invert">Invert</button>
          <span class="ws-sel-count" id="ws-sel-count" aria-live="polite"></span>
        </div>`;
    }

    if (this.mode === 'order') {
      return `
        <div class="ws-toolbar" role="toolbar" aria-label="Page order controls">
          <button type="button" class="ws-btn" id="ws-reset-order">Reset order</button>
          <span class="ws-sel-count" id="ws-sel-count" aria-live="polite"></span>
        </div>`;
    }

    if (this.mode === 'rotate') {
      return `
        <div class="ws-toolbar" role="toolbar" aria-label="Rotation controls">
          <button type="button" class="ws-btn" id="ws-rotate-all-cw">↻ All 90° CW</button>
          <button type="button" class="ws-btn" id="ws-rotate-all-ccw">↺ All 90° CCW</button>
          <button type="button" class="ws-btn" id="ws-reset-rotation">Reset all</button>
          <span class="ws-sel-count" id="ws-sel-count" aria-live="polite"></span>
        </div>`;
    }

    return '';
  }

  /* ── Render thumbnails ── */

  async _renderThumbnails() {
    const loading = this.root.querySelector('#ws-loading');
    const grid    = this.root.querySelector('#ws-grid');

    /* Render all pages at low scale for speed */
    const pageNumbers = Array.from({ length: this.pageCount }, (_, i) => i + 1);

    try {
      /* Render in batches of 8 to keep UI responsive and show progress */
      const BATCH = 8;
      for (let start = 0; start < pageNumbers.length; start += BATCH) {
        if (this.destroyed) return;
        const batch = pageNumbers.slice(start, start + BATCH);
        const pct = Math.round((start / pageNumbers.length) * 100);
        if (loading) loading.textContent = `Rendering thumbnails… ${pct}%`;

        const canvasMap = await renderPdfPages(this.bytes, batch, THUMB_SCALE);
        for (const [num, canvas] of canvasMap) {
          this.canvases.set(num, canvas);
        }
      }
    } catch (err) {
      if (loading) loading.textContent = 'Could not render thumbnails. You can still type page numbers manually.';
      /* Non-fatal — workspace degrades gracefully */
      return;
    }

    if (loading) loading.style.display = 'none';

    /* Build the grid */
    this._rebuildGrid();
  }

  /* ── Grid builder ── */

  _rebuildGrid() {
    const grid = this.root.querySelector('#ws-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let posIdx = 0; posIdx < this.pages.length; posIdx++) {
      const origIdx = this.pages[posIdx];         // 0-based original page index
      const pageNum = origIdx + 1;                // 1-based for display
      const canvas  = this.canvases.get(pageNum);
      const isSelected = this.selected.has(origIdx);
      const rot = this.rotations.get(origIdx) ?? 0;

      const cell = document.createElement('div');
      cell.className = `ws-cell${isSelected ? ' ws-selected' : ''}`;
      cell.dataset.origIdx = origIdx;
      cell.dataset.posIdx  = posIdx;

      if (this.mode === 'select' || this.mode === 'preview') {
        cell.setAttribute('role', 'checkbox');
        cell.setAttribute('aria-checked', String(isSelected));
        cell.setAttribute('aria-label', `Page ${pageNum}`);
        cell.setAttribute('tabindex', '0');
      } else if (this.mode === 'order') {
        cell.setAttribute('role', 'option');
        cell.setAttribute('aria-selected', 'false');
        cell.setAttribute('aria-label', `Page ${pageNum}`);
        cell.setAttribute('draggable', 'true');
        cell.setAttribute('tabindex', '0');
      } else if (this.mode === 'rotate') {
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', `Page ${pageNum} — click to rotate 90° clockwise. Current: ${rot}°`);
        cell.setAttribute('tabindex', '0');
      }

      /* Thumbnail image */
      let thumbHtml = '';
      if (canvas) {
        // Convert canvas to data URL for the img src
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const h = Math.min(THUMB_MAX_H, canvas.height);
        const w = Math.round(canvas.width * (h / canvas.height));
        // Apply visual rotation via CSS transform
        const rotStyle = rot ? `style="transform:rotate(${rot}deg);transform-origin:center;"` : '';
        thumbHtml = `<img class="ws-thumb" src="${dataUrl}" width="${w}" height="${h}" alt="" ${rotStyle} loading="lazy">`;
      } else {
        thumbHtml = `<div class="ws-thumb-placeholder" aria-hidden="true">p.${pageNum}</div>`;
      }

      /* Selection tick / rotation badge */
      let badge = '';
      if (this.mode === 'select') {
        badge = `<span class="ws-tick" aria-hidden="true">✓</span>`;
      } else if (this.mode === 'rotate' && rot) {
        badge = `<span class="ws-rot-badge" aria-hidden="true">${rot}°</span>`;
      } else if (this.mode === 'order') {
        badge = `<span class="ws-drag-handle" aria-hidden="true">⠿</span>`;
      }

      /* Duplicate button for organize mode */
      const dupBtn = this.mode === 'order'
        ? `<button type="button" class="ws-dup-btn" data-dup="${posIdx}" aria-label="Duplicate page ${pageNum}" tabindex="-1">+</button>`
        : '';

      /* Remove button for organize mode (only if more than 1 page) */
      const removeBtn = this.mode === 'order' && this.pages.length > 1
        ? `<button type="button" class="ws-remove-btn" data-remove="${posIdx}" aria-label="Remove page ${pageNum} from order" tabindex="-1">×</button>`
        : '';

      cell.innerHTML = `
        <div class="ws-thumb-wrap">${thumbHtml}</div>
        ${badge}
        <span class="ws-label" aria-hidden="true">${pageNum}</span>
        ${dupBtn}${removeBtn}
      `;

      grid.appendChild(cell);
    }

    if (!this._eventsBound) {
      this._bindGridEvents();
      this._eventsBound = true;
    }
    this._updateFooter();
    this._updateSelCount();
  }

  /* ── Event binding ── */

  _bindToolbar() {
    /* Bind after a tick to ensure root is in DOM */
    requestAnimationFrame(() => {
      if (this.destroyed || !this.root) return;
      this.root.querySelector('#ws-select-all')?.addEventListener('click', () => {
        this.pages.forEach(idx => this.selected.add(idx));
        this._rebuildGrid();
        this._syncInput();
      });
      this.root.querySelector('#ws-select-none')?.addEventListener('click', () => {
        this.selected.clear();
        this._rebuildGrid();
        this._syncInput();
      });
      this.root.querySelector('#ws-invert')?.addEventListener('click', () => {
        this.pages.forEach(idx => {
          if (this.selected.has(idx)) this.selected.delete(idx);
          else this.selected.add(idx);
        });
        this._rebuildGrid();
        this._syncInput();
      });
      this.root.querySelector('#ws-reset-order')?.addEventListener('click', () => {
        this.pages = Array.from({ length: this.pageCount }, (_, i) => i);
        this._rebuildGrid();
        this._syncInput();
      });
      this.root.querySelector('#ws-rotate-all-cw')?.addEventListener('click', () => {
        for (let i = 0; i < this.pageCount; i++) {
          this.rotations.set(i, ((this.rotations.get(i) ?? 0) + 90) % 360);
        }
        this._rebuildGrid();
        this._syncInput();
      });
      this.root.querySelector('#ws-rotate-all-ccw')?.addEventListener('click', () => {
        for (let i = 0; i < this.pageCount; i++) {
          this.rotations.set(i, ((this.rotations.get(i) ?? 0) + 270) % 360);
        }
        this._rebuildGrid();
        this._syncInput();
      });
      this.root.querySelector('#ws-reset-rotation')?.addEventListener('click', () => {
        this.rotations.clear();
        this._rebuildGrid();
        this._syncInput();
      });
    });
  }

  _bindGridEvents() {
    const grid = this.root.querySelector('#ws-grid');
    if (!grid) return;

    if (this.mode === 'select' || this.mode === 'preview') {
      this._bindSelectEvents(grid);
    } else if (this.mode === 'order') {
      this._bindOrderEvents(grid);
    } else if (this.mode === 'rotate') {
      this._bindRotateEvents(grid);
    }
  }

  _bindSelectEvents(grid) {
    grid.addEventListener('click', e => {
      const cell = e.target.closest('.ws-cell');
      if (!cell) return;
      const origIdx = Number(cell.dataset.origIdx);

      /* Shift-click range selection */
      if (e.shiftKey && this._anchor != null) {
        const posA = this.pages.indexOf(this._anchor);
        const posB = this.pages.indexOf(origIdx);
        const [lo, hi] = posA < posB ? [posA, posB] : [posB, posA];
        for (let p = lo; p <= hi; p++) this.selected.add(this.pages[p]);
      } else {
        /* Toggle */
        if (this.selected.has(origIdx)) this.selected.delete(origIdx);
        else this.selected.add(origIdx);
      }
      this._anchor = origIdx;
      this._rebuildGrid();
      this._syncInput();
    });

    grid.addEventListener('keydown', e => {
      const cell = e.target.closest('.ws-cell');
      if (!cell) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        cell.click();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = cell.nextElementSibling;
        if (next) next.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = cell.previousElementSibling;
        if (prev) prev.focus();
      }
    });
  }

  _bindRotateEvents(grid) {
    grid.addEventListener('click', e => {
      const cell = e.target.closest('.ws-cell');
      if (!cell) return;
      const origIdx = Number(cell.dataset.origIdx);
      const current = this.rotations.get(origIdx) ?? 0;
      this.rotations.set(origIdx, (current + 90) % 360);
      this._rebuildGrid();
      this._syncInput();
      /* Restore focus after rebuild */
      requestAnimationFrame(() => {
        if (this.destroyed || !this.root) return;
        const cells = this.root.querySelectorAll('.ws-cell');
        const target = [...cells].find(c => Number(c.dataset.origIdx) === origIdx);
        target?.focus();
      });
    });

    grid.addEventListener('keydown', e => {
      const cell = e.target.closest('.ws-cell');
      if (!cell) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cell.click(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); cell.nextElementSibling?.focus(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); cell.previousElementSibling?.focus(); }
    });
  }

  _bindOrderEvents(grid) {
    /* Duplicate/remove button handlers */
    grid.addEventListener('click', e => {
      const dup = e.target.closest('[data-dup]');
      if (dup) {
        const posIdx = Number(dup.dataset.dup);
        const origIdx = this.pages[posIdx];
        this.pages.splice(posIdx + 1, 0, origIdx);
        this._rebuildGrid();
        this._syncInput();
        return;
      }
      const rem = e.target.closest('[data-remove]');
      if (rem) {
        const posIdx = Number(rem.dataset.remove);
        this.pages.splice(posIdx, 1);
        this._rebuildGrid();
        this._syncInput();
      }
    });

    /* Keyboard reorder */
    grid.addEventListener('keydown', e => {
      const cell = e.target.closest('.ws-cell');
      if (!cell) return;
      const posIdx = Number(cell.dataset.posIdx);

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (posIdx < this.pages.length - 1) {
          [this.pages[posIdx], this.pages[posIdx + 1]] = [this.pages[posIdx + 1], this.pages[posIdx]];
          this._rebuildGrid();
          this._syncInput();
          requestAnimationFrame(() => {
            if (this.destroyed || !this.root) return;
            const cells = this.root.querySelectorAll('.ws-cell');
            cells[Math.min(posIdx + 1, cells.length - 1)]?.focus();
          });
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (posIdx > 0) {
          [this.pages[posIdx], this.pages[posIdx - 1]] = [this.pages[posIdx - 1], this.pages[posIdx]];
          this._rebuildGrid();
          this._syncInput();
          requestAnimationFrame(() => {
            if (this.destroyed || !this.root) return;
            const cells = this.root.querySelectorAll('.ws-cell');
            cells[Math.max(posIdx - 1, 0)]?.focus();
          });
        }
      }
    });

    /* Pointer drag-and-drop reorder */
    this._setupDragReorder(grid);
  }

  _setupDragReorder(grid) {
    let dragSrc = null;
    let dragSrcIdx = -1;
    let placeholder = null;
    let startX = 0, startY = 0;
    let dragging = false;
    let ghost = null;

    const getCell = e => e.target.closest('.ws-cell');
    const cellIndex = cell => Number(cell.dataset.posIdx);

    grid.addEventListener('pointerdown', e => {
      /* Ignore button clicks inside cells */
      if (e.target.closest('button')) return;
      const cell = getCell(e);
      if (!cell) return;
      startX = e.clientX;
      startY = e.clientY;
      dragSrc = cell;
      dragSrcIdx = cellIndex(cell);
      dragging = false;
      grid.setPointerCapture(e.pointerId);
    });

    grid.addEventListener('pointermove', e => {
      if (!dragSrc) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragging && Math.hypot(dx, dy) > DRAG_THRESH) {
        dragging = true;
        dragSrc.classList.add('ws-dragging');

        /* Ghost: clone the cell, pin it */
        ghost = dragSrc.cloneNode(true);
        ghost.className = 'ws-cell ws-ghost';
        ghost.style.cssText = `width:${dragSrc.offsetWidth}px;height:${dragSrc.offsetHeight}px;`;
        document.body.appendChild(ghost);

        /* Placeholder */
        placeholder = document.createElement('div');
        placeholder.className = 'ws-placeholder';
        placeholder.style.cssText = `width:${dragSrc.offsetWidth}px;height:${dragSrc.offsetHeight}px;`;
        dragSrc.after(placeholder);
        dragSrc.style.visibility = 'hidden';
      }

      if (dragging && ghost) {
        ghost.style.left = `${e.clientX - dragSrc.offsetWidth / 2}px`;
        ghost.style.top  = `${e.clientY - dragSrc.offsetHeight / 2}px`;

        /* Find drop target */
        const cells = [...grid.querySelectorAll('.ws-cell:not(.ws-dragging)')];
        let target = null;
        let insertBefore = false;
        for (const c of cells) {
          const rect = c.getBoundingClientRect();
          const midX = rect.left + rect.width / 2;
          const midY = rect.top  + rect.height / 2;
          if (e.clientX > rect.left && e.clientX < rect.right &&
              e.clientY > rect.top  && e.clientY < rect.bottom) {
            target = c;
            /* Place placeholder before or after based on mouse position relative to midpoint */
            insertBefore = e.clientX < midX || e.clientY < midY;
            break;
          }
        }
        if (target && placeholder) {
          if (insertBefore) target.before(placeholder);
          else target.after(placeholder);
        }
      }
    });

    grid.addEventListener('pointerup', e => {
      if (!dragSrc) return;
      grid.releasePointerCapture(e.pointerId);

      if (dragging && placeholder) {
        /* Read the DOM order directly: every non-dragged cell contributes its
           original page, and the placeholder marks where the dragged page goes.
           This avoids index arithmetic drifting when rows wrap onto new lines. */
        const newPages = [];
        let inserted = false;
        for (const node of [...grid.children]) {
          if (node === placeholder) {
            newPages.push(this.pages[dragSrcIdx]);
            inserted = true;
            continue;
          }
          if (node === dragSrc || !node.classList.contains('ws-cell')) continue;
          const posIdx = Number(node.dataset.posIdx);
          if (Number.isInteger(posIdx) && posIdx >= 0 && posIdx < this.pages.length) {
            newPages.push(this.pages[posIdx]);
          }
        }
        if (!inserted) newPages.push(this.pages[dragSrcIdx]);
        if (newPages.length === this.pages.length) {
          this.pages = newPages;
          this._syncInput();
        }
      }

      /* Cleanup */
      ghost?.remove();
      ghost = null;
      placeholder?.remove();
      placeholder = null;
      dragSrc.style.visibility = '';
      dragSrc.classList.remove('ws-dragging');
      dragSrc = null;
      dragging = false;

      this._rebuildGrid();
    });

    grid.addEventListener('pointercancel', () => {
      ghost?.remove();
      ghost = null;
      placeholder?.remove();
      placeholder = null;
      if (dragSrc) {
        dragSrc.style.visibility = '';
        dragSrc.classList.remove('ws-dragging');
        dragSrc = null;
      }
      dragging = false;
      this._rebuildGrid();
    });
  }

  /* ── State sync → hidden inputs ── */

  _syncInput() {
    if (!this.inputSel) return;
    const input = document.querySelector(this.inputSel);
    if (!input) return;

    this._writing = true;
    if (this.mode === 'select') {
      /* Write sorted selected 1-based page numbers as comma-separated ranges */
      const sorted = [...this.selected].sort((a, b) => a - b).map(i => i + 1);
      input.value = this._toRangeString(sorted);
      /* Dispatch change so any live listeners notice */
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (this.mode === 'order') {
      /* Write ordered 1-based page numbers */
      input.value = this.pages.map(i => i + 1).join(',');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (this.mode === 'rotate') {
      /* For rotate mode: if all pages have same rotation, write to #rotation select.
         Mixed rotations are stored in this.rotations and read by the enhanced handler. */
      const values = [...this.rotations.values()];
      const allSame = values.length === this.pageCount && new Set(values).size === 1;
      if (allSame && values.length > 0) {
        if (input.tagName === 'SELECT') {
          const angle = String(values[0]);
          if ([...input.options].some(o => o.value === angle)) input.value = angle;
        }
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this._writing = false;

    this._updateFooter();
    this._updateSelCount();
  }

  /** Read a manual page list without writing back into the field. */
  _applyManual(text) {
    const raw = String(text || '').trim();
    if (this.mode === 'order') {
      if (!raw) {
        this.pages = Array.from({ length: this.pageCount }, (_, i) => i);
        return;
      }
      const nums = raw.split(/[\s,]+/).map(part => Number(part)).filter(n => Number.isInteger(n) && n >= 1 && n <= this.pageCount);
      if (nums.length) this.pages = nums.map(n => n - 1);
      return;
    }
    if (!raw) {
      this.selected.clear();
      return;
    }
    const pages = new Set();
    for (const part of raw.split(',').map(s => s.trim()).filter(Boolean)) {
      const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) return;
      let start = Number(match[1]);
      let end = Number(match[2] || match[1]);
      if (end < start) [start, end] = [end, start];
      for (let n = start; n <= end; n++) {
        if (n >= 1 && n <= this.pageCount) pages.add(n - 1);
      }
    }
    this.selected = pages;
  }

  /* Convert sorted array [1,2,3,5,7,8] → "1-3,5,7-8" */
  _toRangeString(nums) {
    if (!nums.length) return '';
    const ranges = [];
    let start = nums[0], end = nums[0];
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === end + 1) { end = nums[i]; }
      else { ranges.push(start === end ? `${start}` : `${start}-${end}`); start = end = nums[i]; }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(',');
  }

  _updateFooter() {
    const footer = this.root?.querySelector('#ws-footer');
    if (!footer) return;

    if (this.mode === 'select') {
      const count = this.selected.size;
      footer.textContent = count === 0
        ? 'No pages selected.'
        : `${count} of ${this.pageCount} page${this.pageCount === 1 ? '' : 's'} selected.`;
    } else if (this.mode === 'order') {
      footer.textContent = `${this.pages.length} page${this.pages.length === 1 ? '' : 's'} in output.`;
    } else if (this.mode === 'rotate') {
      const rotated = [...this.rotations.entries()].filter(([, r]) => r !== 0);
      footer.textContent = rotated.length === 0
        ? 'No rotations set. Click a page to rotate it.'
        : `${rotated.length} page${rotated.length === 1 ? '' : 's'} rotated.`;
    } else {
      footer.textContent = '';
    }
  }

  _updateSelCount() {
    const el = this.root?.querySelector('#ws-sel-count');
    if (!el) return;

    if (this.mode === 'select') {
      el.textContent = `${this.selected.size} selected`;
    } else if (this.mode === 'order') {
      el.textContent = `${this.pages.length} pages`;
    } else if (this.mode === 'rotate') {
      const rotated = [...this.rotations.values()].filter(r => r !== 0).length;
      el.textContent = rotated ? `${rotated} rotated` : '';
    }
  }

  /* ── Public methods ── */

  /** Sorted 1-based selected page numbers */
  getSelection() {
    return [...this.selected].sort((a, b) => a - b).map(i => i + 1);
  }

  /** Ordered 1-based page numbers (for organize mode) */
  getOrder() {
    return this.pages.map(i => i + 1);
  }

  /** Map of 0-based originalIndex → rotation degrees */
  getRotations() {
    return new Map(this.rotations);
  }

  /** Whether any pages are selected (for select mode) */
  hasSelection() {
    return this.selected.size > 0;
  }

  /** Programmatically select all pages (called by handlers before processing if none selected) */
  selectAll() {
    this.pages.forEach(idx => this.selected.add(idx));
    this._syncInput();
    this._rebuildGrid();
  }

  /** Destroy the workspace and clean up */
  destroy() {
    this.destroyed = true;
    if (this._manualInput && this._manualHandler) {
      this._manualInput.removeEventListener('input', this._manualHandler);
      this._manualInput = null;
      this._manualHandler = null;
    }
    if (this.root && this.root.parentNode) this.root.remove();
    this.root = null;
    this.canvases.clear();
    if (window.pdfWorkspace === this) window.pdfWorkspace = null;
  }
}
