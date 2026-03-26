document.addEventListener('DOMContentLoaded', () => {
    const sourceInput = document.getElementById('source-file');
    const targetInput = document.getElementById('target-file');
    const resetBtn = document.getElementById('reset-btn');
    const exportBtn = document.getElementById('export-btn');
    const emptyState = document.getElementById('empty-state');
    const viewer = document.getElementById('viewer');
    const dashboard = document.getElementById('dashboard');
    const linesContainer = document.getElementById('lines-container');
    const statsFooter = document.getElementById('stats-footer');
    const toastContainer = document.getElementById('toast-container');
    
    // Dashboard elements
    const healthBar = document.getElementById('health-bar');
    const healthPct = document.getElementById('health-pct');
    const dashAlerts = document.getElementById('dash-alerts');
    const dashMulti = document.getElementById('dash-multi');
    const totalLinesSpan = document.getElementById('total-lines');
    const alertLinesSpan = document.getElementById('alert-lines');
    
    const filterAll = document.getElementById('filter-all');
    const filterAlerts = document.getElementById('filter-alerts');
    
    // New UI elements
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCountSpan = document.getElementById('selected-count');
    const deleteSelectedRowsBtn = document.getElementById('delete-selected-rows');
    const deleteSelectedCellsBtn = document.getElementById('delete-selected-cells');
    const selectAllRowsCheckbox = document.getElementById('select-all-rows');

    let sourceFileName = 'source.txt';
    let targetFileName = 'target.txt';
    let activeFilter = 'all';
    let selectedRows = new Set();
    let selectedCells = new Set(); // Stores "index-side"
    let lastCheckedIndex = null;
    let confirmedRows = new Set();
    let translationMemory = new Map();

    const ROW_HEIGHT = 73; 
    const VISIBLE_BUFFER = 10;

    const CONFIG = {
        ratioWarningMin: 0.5,
        ratioWarningMax: 2.0,
        ratioDangerMin: 0.3,
        ratioDangerMax: 3.0,
        lengthDiffWarning: 50,
        lengthDiffDanger: 100
    };
    
    // Resize observer to update visible rows
    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(renderVisibleLines);
    });
    resizeObserver.observe(linesContainer);

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        const colorClass = type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-indigo-600 border-indigo-500';
        toast.className = `${colorClass} text-white px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 animate-bounce-in min-w-[280px]`;
        toast.innerHTML = `
            <div class="p-1 bg-white/20 rounded-lg">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <span class="text-sm font-semibold">${message}</span>
        `;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'all 0.5s ease-out';
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    function handleFileSelection() {
        if (sourceInput.files.length > 0 && targetInput.files.length > 0) {
            sourceFileName = sourceInput.files[0].name;
            targetFileName = targetInput.files[0].name;
            Promise.all([
                readFile(sourceInput.files[0]),
                readFile(targetInput.files[0])
            ]).then(([sourceText, targetText]) => {
                sourceLines = sourceText.replace(/\r?\n$/, '').split(/\r?\n/);
                targetLines = targetText.replace(/\r?\n$/, '').split(/\r?\n/);
                exportBtn.classList.remove('hidden');
                dashboard.classList.remove('hidden');
                selectedRows.clear();
                selectedCells.clear();
                updateBulkActionsUI();
                renderViewer();
                showToast("Fichiers chargés avec succès");
            }).catch(error => {
                console.error("Erreur de lecture:", error);
                alert("Erreur lors de la lecture des fichiers.");
            });
        }
    }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });
    }

    function countSentences(text) {
        if (!text) return 0;
        const matches = text.match(/[.!?]+(?:\s+|$)/g);
        return matches ? matches.length : (text.trim().length > 0 ? 1 : 0);
    }

    const analysisCache = new Map();
    function analyzeAlignment(source, target) {
        const key = `${source}|||${target}`;
        if (analysisCache.has(key)) return analysisCache.get(key);

        if (!source && !target) return { status: 'ok', ratio: '—', text: 'Vide', multiSentences: false, qaAlerts: [] };
        if (!source) return { status: 'danger', ratio: '∞', text: 'Cible seule', multiSentences: false, qaAlerts: [] };
        if (!target) return { status: 'danger', ratio: '0', text: 'Source seule', multiSentences: false, qaAlerts: [] };
        const sourceWords = source.trim().split(/\s+/).filter(w => w.length > 0).length;
        const targetWords = target.trim().split(/\s+/).filter(w => w.length > 0).length;
        const sourceSentences = countSentences(source);
        const targetSentences = countSentences(target);
        const multiSentences = sourceSentences > 1 || targetSentences > 1;
        
        let result = { status: 'ok', ratio: '—', text: 'Vide', multiSentences, qaAlerts: [] };
        if (sourceWords === 0 && targetWords === 0) { } else {
            const ratio = sourceWords === 0 ? 99 : (targetWords / sourceWords);
            const formattedRatio = ratio.toFixed(1);
            let status = 'ok';
            let text = `${formattedRatio}x mots`;
            let qaAlerts = [];

            // Ratio Checks
            if (ratio <= CONFIG.ratioDangerMin || ratio >= CONFIG.ratioDangerMax) status = 'danger';
            else if (ratio <= CONFIG.ratioWarningMin || ratio >= CONFIG.ratioWarningMax) status = 'warning';
            
            // Length Checks
            const lenDiff = Math.abs(target.length - source.length);
            if (lenDiff > CONFIG.lengthDiffDanger) status = 'danger';
            else if (lenDiff > CONFIG.lengthDiffWarning && status === 'ok') status = 'warning';

            // QA: Numerical Check
            const srcStr = source || "";
            const tgtStr = target || "";
            const srcNums = srcStr.match(/\d+/g) || [];
            const tgtNums = tgtStr.match(/\d+/g) || [];
            const missingNums = srcNums.filter(n => !tgtNums.includes(n));
            if (missingNums.length > 0) {
                status = status === 'danger' ? 'danger' : 'warning';
                qaAlerts.push(`Nombres manquants: ${[...new Set(missingNums)].join(', ')}`);
            }

            // QA: Punctuation Check
            const lastChar = (str) => ((str || "").trim().slice(-1));
            const puncs = ['.', '!', '?', ':', ';'];
            if (puncs.includes(lastChar(source)) && lastChar(source) !== lastChar(target)) {
                if (status === 'ok') status = 'warning';
                qaAlerts.push('Ponctuation finale divergente');
            }

            // TM: Check for Memory
            if (translationMemory.has(source) && translationMemory.get(source) !== target) {
                qaAlerts.push('Incohérence TM');
            }
            
            result = { status, ratio: formattedRatio, text, multiSentences, qaAlerts };
        }
        analysisCache.set(key, result);
        return result;
    }

    function renderViewer() {
        emptyState.classList.add('hidden'); emptyState.classList.remove('flex');
        viewer.classList.remove('hidden'); viewer.classList.add('flex');
        viewer.classList.replace('opacity-0', 'opacity-100');
        statsFooter.classList.remove('hidden');
        updateGlobalStats();
        renderVisibleLines();
    }

    function renderVisibleLines() {
        const maxLines = Math.max(sourceLines.length, targetLines.length);
        
        const filteredIndices = [];
        for (let i = 0; i < maxLines; i++) {
            if (activeFilter === 'alerts') {
                const analysis = analyzeAlignment(sourceLines[i] || '', targetLines[i] || '');
                if (analysis.status === 'ok') continue;
            }
            filteredIndices.push(i);
        }

        const containerVisibleHeight = linesContainer.clientHeight || 500;
        const visibleCount = Math.ceil(containerVisibleHeight / ROW_HEIGHT);
        const start = Math.max(0, Math.floor(linesContainer.scrollTop / ROW_HEIGHT) - VISIBLE_BUFFER);
        const end = Math.min(filteredIndices.length, start + visibleCount + (VISIBLE_BUFFER * 2));

        linesContainer.innerHTML = '';
        const spacerTop = document.createElement('div');
        spacerTop.style.height = `${start * ROW_HEIGHT}px`;
        linesContainer.appendChild(spacerTop);

        const fragment = document.createDocumentFragment();
        for (let j = start; j < end; j++) {
            const i = filteredIndices[j];
            const source = sourceLines[i] !== undefined ? sourceLines[i] : '';
            const target = targetLines[i] !== undefined ? targetLines[i] : '';
            const analysis = analyzeAlignment(source, target);
            
            const rowSelected = selectedRows.has(i);
            const sCellSelected = selectedCells.has(`${i}-source`);
            const tCellSelected = selectedCells.has(`${i}-target`);

            const row = document.createElement('div');
            row.id = `row-${i}`;
            row.className = `grid grid-cols-[40px_1fr_140px_1fr] md:grid-cols-[40px_1fr_160px_1fr] border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors group ${rowSelected ? 'selected-row' : ''} ${confirmedRows.has(i) ? 'confirmed-row' : ''}`;
            if (analysis.status === 'danger') row.classList.add('bg-rose-500/5');
            else if (analysis.status === 'warning') row.classList.add('bg-amber-500/5');
            else if (analysis.multiSentences) row.classList.add('bg-indigo-500/5');
            
            const colorClass = analysis.status === 'danger' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 
                               analysis.status === 'warning' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 
                               'bg-gray-800 text-gray-400 border-gray-700 group-hover:border-gray-600';

            row.innerHTML = `
                <div class="flex items-center justify-center border-r border-gray-800/30">
                    <label class="custom-checkbox">
                        <input type="checkbox" class="row-checkbox" data-index="${i}" ${rowSelected ? 'checked' : ''}>
                        <span class="cb-checkmark"></span>
                    </label>
                </div>
                <div class="py-4 px-4 text-sm text-gray-300 leading-relaxed border-r border-gray-800/30 relative group/cell ${sCellSelected ? 'selected-cell' : ''}">
                    <div class="editable-cell outline-none focus:bg-gray-800/60 rounded px-2 -mx-2 transition-colors min-h-[1.5rem]" contenteditable="plaintext-only" data-index="${i}" data-side="source">${escapeHtml(source)}</div>
                    <div class="absolute top-1 right-2 flex gap-1 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                        <button class="insert-btn bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded p-1" data-index="${i}" data-side="source"><svg class="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"></path></svg></button>
                        <button class="delete-btn bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 rounded p-1" data-index="${i}" data-side="source"><svg class="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M20 12H4"></path></svg></button>
                    </div>
                </div>
                <div id="stats-${i}" class="py-4 px-2 flex flex-col items-center justify-start gap-2 bg-gray-900/40 relative group/stats">
                    <span class="font-mono text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Ligne ${i + 1}</span>
                    <div class="flex items-center gap-1">
                        <span class="px-2 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${colorClass}" title="${analysis.qaAlerts.join('\n')}">${analysis.text}</span>
                        ${analysis.qaAlerts.length > 0 ? '<div class="w-2 h-2 rounded-full bg-amber-500"></div>' : ''}
                    </div>
                    ${analysis.multiSentences ? '<div class="mt-1 text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 inline-block uppercase tracking-wider">Multi-phrases</div>' : ''}
                    <button class="add-full-row-btn absolute bottom-1 opacity-0 group-hover/stats:opacity-100 bg-gray-800 hover:bg-gray-700 text-gray-400 p-1 rounded transition-opacity" title="Insérer une ligne vide complète" data-index="${i}">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                </div>
                <div class="py-4 px-4 text-sm text-gray-300 leading-relaxed border-l border-gray-800/30 relative group/cell ${tCellSelected ? 'selected-cell' : ''}">
                    <div class="editable-cell outline-none focus:bg-gray-800/60 rounded px-2 -mx-2 transition-colors min-h-[1.5rem]" contenteditable="plaintext-only" data-index="${i}" data-side="target">${escapeHtml(target)}</div>
                    <div class="absolute top-1 right-2 flex gap-1 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                        <button class="insert-btn bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded p-1" data-index="${i}" data-side="target"><svg class="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"></path></svg></button>
                        <button class="delete-btn bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 rounded p-1" data-index="${i}" data-side="target"><svg class="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M20 12H4"></path></svg></button>
                    </div>
                </div>`;
            fragment.appendChild(row);
        }
        linesContainer.appendChild(fragment);
        
        const spacerBottom = document.createElement('div');
        spacerBottom.style.height = `${(filteredIndices.length - end) * ROW_HEIGHT}px`;
        linesContainer.appendChild(spacerBottom);
        
        selectAllRowsCheckbox.checked = selectedRows.size > 0 && selectedRows.size === maxLines;
    }

    linesContainer.addEventListener('scroll', () => {
        requestAnimationFrame(renderVisibleLines);
    });

    function updateGlobalStats(totalOverride) {
        const total = totalOverride || Math.max(sourceLines.length, targetLines.length);
        let alerts = 0; let multi = 0;
        for (let i = 0; i < total; i++) {
            const analysis = analyzeAlignment(sourceLines[i] || '', targetLines[i] || '');
            if (analysis.status !== 'ok') alerts++;
            if (analysis.multiSentences) multi++;
        }
        totalLinesSpan.textContent = total; alertLinesSpan.textContent = alerts;
        dashAlerts.textContent = alerts; dashMulti.textContent = multi;
        const health = total > 0 ? Math.round(((total - alerts) / total) * 100) : 0;
        healthBar.style.width = `${health}%`; healthPct.textContent = `${health}%`;
        healthBar.className = `h-full transition-all duration-1000 ${health > 90 ? 'bg-emerald-500' : health > 70 ? 'bg-amber-500' : 'bg-rose-500'}`;
        healthPct.className = `text-xs font-mono font-bold ${health > 90 ? 'text-emerald-400' : health > 70 ? 'text-amber-400' : 'text-rose-400'}`;
    }

    function updateRowStats(index) {
        const statsCol = document.getElementById(`stats-${index}`);
        if (!statsCol) return;
        const source = sourceLines[index] || '';
        const target = targetLines[index] || '';
        const analysis = analyzeAlignment(source, target);
        const colorClass = analysis.status === 'danger' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 
                           analysis.status === 'warning' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 
                           'bg-gray-800 text-gray-400 border-gray-700 group-hover:border-gray-600';
        statsCol.innerHTML = `
            <span class="font-mono text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Ligne ${index + 1}</span>
            <div class="flex items-center gap-1">
                <span class="px-2 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${colorClass}" title="${analysis.qaAlerts.join('\n')}">${analysis.text}</span>
                ${analysis.qaAlerts.length > 0 ? '<div class="w-2 h-2 rounded-full bg-amber-500"></div>' : ''}
            </div>
            ${analysis.multiSentences ? '<div class="mt-1 text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 inline-block uppercase tracking-wider">Multi-phrases</div>' : ''}
            <div class="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover/stats:opacity-100 transition-opacity">
                <button class="confirm-row-btn bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 p-1 rounded" title="Confirmer et Mémoriser (Ctrl+Entrée)" data-index="${index}">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                </button>
                <button class="add-full-row-btn bg-gray-800 hover:bg-gray-700 text-gray-400 p-1 rounded" title="Insérer une ligne vide complète" data-index="${index}">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                </button>
            </div>
        `;
    }

    linesContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('editable-cell')) {
            const index = parseInt(e.target.getAttribute('data-index'), 10);
            const side = e.target.getAttribute('data-side');
            let text = (e.target.innerText || "").replace(/\n$/, "");
            text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
            
            // Incremental update of stats would require knowing OLD status.
            // For now, let's just trigger updateGlobalStats but only periodically or after a delay.
            if (side === 'source') sourceLines[index] = text; else targetLines[index] = text;
            updateRowStats(index);
            // Throttle stats update
            if (this.statsTimeout) clearTimeout(this.statsTimeout);
            this.statsTimeout = setTimeout(() => updateGlobalStats(), 1000);
        }
    });

    linesContainer.addEventListener('change', (e) => {
        const checkbox = e.target.closest('.row-checkbox');
        if (checkbox) {
            const index = parseInt(checkbox.getAttribute('data-index'), 10);
            // Important: Handle both single toggle and Shift+Click by checking current state
            if (checkbox.checked) selectedRows.add(index); else selectedRows.delete(index);
            
            // Check if Shift was held during the click that triggered this change
            if (window.lastShiftKey && lastCheckedIndex !== null) {
                const start = Math.min(index, lastCheckedIndex);
                const end = Math.max(index, lastCheckedIndex);
                const shouldCheck = checkbox.checked;
                for (let i = start; i <= end; i++) {
                    if (shouldCheck) selectedRows.add(i); else selectedRows.delete(i);
                }
            }
            
            lastCheckedIndex = index;
            updateBulkActionsUI();
            renderLazyLines();
        }
    });

    // Keyboard Shortcuts & Confirmed Rows
    linesContainer.addEventListener('keydown', (e) => {
        const cell = e.target.closest('.editable-cell');
        if (!cell) return;
        const index = parseInt(cell.getAttribute('data-index'), 10);
        const side = cell.getAttribute('data-side');

        // Ctrl + Enter: Confirm & Next
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            confirmRow(index);
            focusCell(index + 1, 'target');
        }

        // Alt + Arrow Navigation
        if (e.altKey && e.key === 'ArrowDown') {
            e.preventDefault();
            focusCell(index + 1, side);
        }
        if (e.altKey && e.key === 'ArrowUp') {
            e.preventDefault();
            focusCell(index - 1, side);
        }
    });

    function confirmRow(index) {
        const source = sourceLines[index];
        const target = targetLines[index];
        if (!source || !target) return;

        confirmedRows.add(index);
        translationMemory.set(source, target);
        
        // Auto-propagate
        let propagatedCount = 0;
        for (let i = 0; i < sourceLines.length; i++) {
            if (sourceLines[i] === source && !targetLines[i]) {
                targetLines[i] = target;
                propagatedCount++;
            }
        }
        
        if (propagatedCount > 0) showToast(`${propagatedCount} traductions auto-propagées`, 'success');
        renderVisibleLines();
    }

    function focusCell(index, side) {
        // We need to wait for render if it's outside buffer
        const max = Math.max(sourceLines.length, targetLines.length);
        if (index < 0 || index >= max) return;
        
        // Ensure index is within filtered view if applicable... 
        // For now, simple implementation:
        const targetRow = document.getElementById(`row-${index}`);
        if (targetRow) {
            const cell = targetRow.querySelector(`[data-side="${side}"]`);
            if (cell) cell.focus();
        } else {
            // Scroll to it
            linesContainer.scrollTop = index * ROW_HEIGHT;
            setTimeout(() => {
                const tr = document.getElementById(`row-${index}`);
                if (tr) tr.querySelector(`[data-side="${side}"]`).focus();
            }, 100);
        }
    }

    function renderLazyLines() {
        requestAnimationFrame(renderVisibleLines);
    }

    // Capture Shift key on window to share with 'change' event
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') window.lastShiftKey = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') window.lastShiftKey = false; });

    function shiftConfirmedRows(fromIndex, amount) {
        const newConfirmed = new Set();
        for (const idx of confirmedRows) {
            if (amount < 0 && idx >= fromIndex && idx < fromIndex - amount) {
                // Deleted row, don't keep
            } else if (idx >= fromIndex) {
                newConfirmed.add(idx + amount);
            } else {
                newConfirmed.add(idx);
            }
        }
        confirmedRows = newConfirmed;
    }

    linesContainer.addEventListener('click', (e) => {
        const insertBtn = e.target.closest('.insert-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const addFullRowBtn = e.target.closest('.add-full-row-btn');
        const confirmBtn = e.target.closest('.confirm-row-btn');
        const cell = e.target.closest('.group\\/cell');

        if (confirmBtn) {
            e.stopPropagation();
            const index = parseInt(confirmBtn.getAttribute('data-index'), 10);
            confirmRow(index);
            return;
        }

        if (insertBtn || deleteBtn || addFullRowBtn) {
            e.stopPropagation(); 
            const btn = insertBtn || deleteBtn || addFullRowBtn;
            const index = parseInt(btn.getAttribute('data-index'), 10);

            // Clear selections as indices are shifting
            if (selectedRows.size > 0 || selectedCells.size > 0) {
                selectedRows.clear();
                selectedCells.clear();
                updateBulkActionsUI();
            }
            analysisCache.clear();
            
            if (addFullRowBtn) {
                sourceLines.splice(index + 1, 0, '');
                targetLines.splice(index + 1, 0, '');
                shiftConfirmedRows(index + 1, 1);
                showToast("Ligne complète insérée", "success");
            } else {
                const side = btn.getAttribute('data-side');
                const targetArray = (side === 'source') ? sourceLines : targetLines;
                while (targetArray.length < index) targetArray.push('');
                
                if (insertBtn) { 
                    targetArray.splice(index, 0, ''); 
                    shiftConfirmedRows(index, 1);
                } else if (deleteBtn) { 
                    if (index < targetArray.length) {
                        targetArray.splice(index, 1);
                        shiftConfirmedRows(index, -1);
                    }
                }
            }
            
            renderViewer();
            updateGlobalStats();
        } else if (cell && e.ctrlKey) {
            const input = cell.querySelector('.editable-cell');
            const index = input.getAttribute('data-index');
            const side = input.getAttribute('data-side');
            const key = `${index}-${side}`;
            if (selectedCells.has(key)) selectedCells.delete(key); else selectedCells.add(key);
            updateBulkActionsUI();
            renderVisibleLines();
        }
    });

    selectAllRowsCheckbox.addEventListener('change', () => {
        const maxLines = Math.max(sourceLines.length, targetLines.length);
        if (selectAllRowsCheckbox.checked) {
            for (let i = 0; i < maxLines; i++) selectedRows.add(i);
        } else {
            selectedRows.clear();
        }
        updateBulkActionsUI();
        renderVisibleLines();
    });

    function updateBulkActionsUI() {
        const count = selectedRows.size + selectedCells.size;
        if (count > 0) {
            bulkActions.classList.remove('hidden');
            bulkActions.classList.add('flex');
            selectedCountSpan.textContent = `${count} sélectionnés`;
        } else {
            bulkActions.classList.add('hidden');
            bulkActions.classList.remove('flex');
        }
    }

    deleteSelectedRowsBtn.addEventListener('click', () => {
        const sortedIndices = Array.from(selectedRows).sort((a, b) => b - a);
        if (sortedIndices.length === 0) return;
        sortedIndices.forEach(index => {
            sourceLines.splice(index, 1);
            targetLines.splice(index, 1);
            shiftConfirmedRows(index, -1);
        });
        selectedRows.clear();
        updateBulkActionsUI();
        renderViewer();
        showToast(`${sortedIndices.length} lignes supprimées`, "success");
    });

    deleteSelectedCellsBtn.addEventListener('click', () => {
        if (selectedCells.size > 0) {
            selectedCells.forEach(key => {
                const [index, side] = key.split('-');
                if (side === 'source') sourceLines[index] = ''; else targetLines[index] = '';
            });
            selectedCells.clear();
        }
        if (selectedRows.size > 0) {
            selectedRows.forEach(index => {
                sourceLines[index] = '';
                targetLines[index] = '';
            });
            selectedRows.clear();
        }
        updateBulkActionsUI();
        renderViewer();
        showToast(`Eléments vidés`, "success");
    });

    filterAll.addEventListener('click', () => setFilter('all'));
    filterAlerts.addEventListener('click', () => setFilter('alerts'));
    function setFilter(filter) {
        activeFilter = filter;
        filterAll.className = `px-3 py-1 text-xs font-bold rounded-md transition-all ${filter === 'all' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`;
        filterAlerts.className = `px-3 py-1 text-xs font-bold rounded-md transition-all ${filter === 'alerts' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`;
        renderViewer();
    }
    exportBtn.addEventListener('click', () => {
        const maxLines = Math.max(sourceLines.length, targetLines.length);
        if (maxLines === 0) return;

        const fmt = (n) => { 
            const sanitized = (n || "source").replace(/[^\x20-\x7E]/g, '').trim();
            const p = sanitized.split('.'); let e = p.length > 1 ? '.' + p.pop() : '.txt'; 
            if (e === '.') e = '.txt'; return `[ALIGN]_` + p.join('.') + e; 
        };

        // Ensure both files have exactly maxLines lines
        const sOutput = [];
        const tOutput = [];
        for (let i = 0; i < maxLines; i++) {
            sOutput.push(sourceLines[i] !== undefined ? sourceLines[i] : '');
            tOutput.push(targetLines[i] !== undefined ? targetLines[i] : '');
        }

        // Join with \n and ensure a trailing newline if not empty
        const sBlob = sOutput.join('\n') + (maxLines > 0 ? '\n' : '');
        const tBlob = tOutput.join('\n') + (maxLines > 0 ? '\n' : '');
        
        const name1 = fmt(sourceFileName); 
        const name2 = fmt(targetFileName);
        
        showToast("Lancement de l'exportation...", "info");
        
        downloadFile(sBlob, name1);
        setTimeout(() => {
            downloadFile(tBlob, name2);
            showToast("Sauvegarde terminée !", "success");
        }, 800);
    });

    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); 
        a.href = url; a.download = filename; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); 
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    function resetApp() {
        sourceInput.value = ''; targetInput.value = ''; sourceLines = []; targetLines = [];
        sourceFileName = 'source.txt'; targetFileName = 'target.txt';
        confirmedRows.clear(); translationMemory.clear();
        emptyState.classList.replace('hidden', 'flex'); viewer.classList.add('hidden');
        viewer.classList.replace('opacity-100', 'opacity-0'); dashboard.classList.add('hidden');
        statsFooter.classList.add('hidden'); exportBtn.classList.add('hidden');
        linesContainer.innerHTML = '';
    }

    function escapeHtml(u) { return u ? u.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;") : ''; }
    sourceInput.addEventListener('change', handleFileSelection);
    targetInput.addEventListener('change', handleFileSelection);
    resetBtn.addEventListener('click', resetApp);
});
