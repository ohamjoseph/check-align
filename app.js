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
                sourceLines = sourceText.split(/\r?\n/);
                targetLines = targetText.split(/\r?\n/);
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

        if (!source && !target) return { status: 'ok', ratio: '—', text: 'Vide', multiSentences: false };
        if (!source) return { status: 'danger', ratio: '∞', text: 'Cible seule', multiSentences: false };
        if (!target) return { status: 'danger', ratio: '0', text: 'Source seule', multiSentences: false };
        const sourceWords = source.trim().split(/\s+/).filter(w => w.length > 0).length;
        const targetWords = target.trim().split(/\s+/).filter(w => w.length > 0).length;
        const sourceSentences = countSentences(source);
        const targetSentences = countSentences(target);
        const multiSentences = sourceSentences > 1 || targetSentences > 1;
        
        let result = { status: 'ok', ratio: '—', text: 'Vide', multiSentences };
        if (sourceWords === 0 && targetWords === 0) { } else {
            const ratio = sourceWords === 0 ? 99 : (targetWords / sourceWords);
            const formattedRatio = ratio.toFixed(1);
            let status = 'ok';
            let text = `${formattedRatio}x mots`;
            if (ratio <= CONFIG.ratioDangerMin || ratio >= CONFIG.ratioDangerMax) status = 'danger';
            else if (ratio <= CONFIG.ratioWarningMin || ratio >= CONFIG.ratioWarningMax) status = 'warning';
            const lenDiff = Math.abs(target.length - source.length);
            if (lenDiff > CONFIG.lengthDiffDanger) status = 'danger';
            else if (lenDiff > CONFIG.lengthDiffWarning && status === 'ok') status = 'warning';
            result = { status, ratio: formattedRatio, text, multiSentences };
        }
        analysisCache.set(key, result);
        return result;
    }

    function renderViewer() {
        emptyState.classList.add('hidden'); emptyState.classList.remove('flex');
        viewer.classList.remove('hidden'); viewer.classList.add('flex');
        viewer.classList.replace('opacity-0', 'opacity-100');
        statsFooter.classList.remove('hidden');
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
            row.className = `grid grid-cols-[40px_1fr_140px_1fr] md:grid-cols-[40px_1fr_160px_1fr] border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors group ${rowSelected ? 'selected-row' : ''}`;
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
                <div id="stats-${i}" class="py-4 px-2 flex flex-col items-center justify-start gap-2 bg-gray-900/40">
                    <span class="font-mono text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Ligne ${i + 1}</span>
                    <span class="px-2 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${colorClass}">${analysis.text}</span>
                    ${analysis.multiSentences ? '<div class="mt-2 text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 inline-block uppercase tracking-wider">Multi-phrases</div>' : ''}
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
        
        updateGlobalStats(maxLines);
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
        statsCol.innerHTML = `<span class="font-mono text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Ligne ${index + 1}</span><span class="px-2 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${colorClass}">${analysis.text}</span>${analysis.multiSentences ? '<div class="mt-2 text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 inline-block uppercase tracking-wider">Multi-phrases</div>' : ''}`;
    }

    linesContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('editable-cell')) {
            const index = parseInt(e.target.getAttribute('data-index'), 10);
            const side = e.target.getAttribute('data-side');
            let text = e.target.innerText || "";
            text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
            analysisCache.clear(); // Simple cache invalidation
            if (side === 'source') sourceLines[index] = text; else targetLines[index] = text;
            updateRowStats(index);
        }
    });

    linesContainer.addEventListener('change', (e) => {
        const checkbox = e.target.closest('.row-checkbox');
        if (checkbox) {
            const index = parseInt(checkbox.getAttribute('data-index'), 10);
            if (checkbox.checked) selectedRows.add(index); else selectedRows.delete(index);
            updateBulkActionsUI();
            renderVisibleLines();
        }
    });

    linesContainer.addEventListener('click', (e) => {
        const insertBtn = e.target.closest('.insert-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const checkboxContainer = e.target.closest('.custom-checkbox');
        const checkbox = checkboxContainer ? checkboxContainer.querySelector('.row-checkbox') : e.target.closest('.row-checkbox');
        const cell = e.target.closest('.group\\/cell');

        if (insertBtn || deleteBtn) {
            const btn = insertBtn || deleteBtn;
            const index = parseInt(btn.getAttribute('data-index'), 10);
            const side = btn.getAttribute('data-side');
            if (insertBtn) { if (side === 'source') sourceLines.splice(index, 0, ''); else targetLines.splice(index, 0, ''); }
            else if (deleteBtn) { if (side === 'source') sourceLines.splice(index, 1); else targetLines.splice(index, 1); }
            renderViewer();
        } else if (checkbox && e.shiftKey) {
            // Shift+Click logic (handled here because 'change' doesn't have shiftKey easily)
            const index = parseInt(checkbox.getAttribute('data-index'), 10);
            if (lastCheckedIndex !== null) {
                const start = Math.min(index, lastCheckedIndex);
                const end = Math.max(index, lastCheckedIndex);
                const shouldCheck = checkbox.checked;
                for (let i = start; i <= end; i++) {
                    if (shouldCheck) selectedRows.add(i); else selectedRows.delete(i);
                }
                updateBulkActionsUI();
                renderVisibleLines();
            }
        } else if (checkbox) {
            lastCheckedIndex = parseInt(checkbox.getAttribute('data-index'), 10);
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
