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

    let sourceLines = [];
    let targetLines = [];
    let sourceFileName = 'source.txt';
    let targetFileName = 'target.txt';
    let activeFilter = 'all';

    const CONFIG = {
        ratioWarningMin: 0.5,
        ratioWarningMax: 2.0,
        ratioDangerMin: 0.3,
        ratioDangerMax: 3.0,
        lengthDiffWarning: 50,
        lengthDiffDanger: 100
    };

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

    function analyzeAlignment(source, target) {
        if (!source && !target) return { status: 'ok', ratio: '—', text: 'Vide', multiSentences: false };
        if (!source) return { status: 'danger', ratio: '∞', text: 'Cible seule', multiSentences: false };
        if (!target) return { status: 'danger', ratio: '0', text: 'Source seule', multiSentences: false };
        const sourceWords = source.trim().split(/\s+/).filter(w => w.length > 0).length;
        const targetWords = target.trim().split(/\s+/).filter(w => w.length > 0).length;
        const sourceSentences = countSentences(source);
        const targetSentences = countSentences(target);
        const multiSentences = sourceSentences > 1 || targetSentences > 1;
        if (sourceWords === 0 && targetWords === 0) return { status: 'ok', ratio: '—', text: 'Vide', multiSentences };
        const ratio = sourceWords === 0 ? 99 : (targetWords / sourceWords);
        const formattedRatio = ratio.toFixed(1);
        let status = 'ok';
        let text = `${formattedRatio}x mots`;
        if (ratio <= CONFIG.ratioDangerMin || ratio >= CONFIG.ratioDangerMax) status = 'danger';
        else if (ratio <= CONFIG.ratioWarningMin || ratio >= CONFIG.ratioWarningMax) status = 'warning';
        const lenDiff = Math.abs(target.length - source.length);
        if (lenDiff > CONFIG.lengthDiffDanger) status = 'danger';
        else if (lenDiff > CONFIG.lengthDiffWarning && status === 'ok') status = 'warning';
        return { status, ratio: formattedRatio, text, multiSentences };
    }

    function renderViewer() {
        emptyState.classList.add('hidden'); emptyState.classList.remove('flex');
        viewer.classList.remove('hidden'); viewer.classList.add('flex');
        viewer.classList.replace('opacity-0', 'opacity-100');
        statsFooter.classList.remove('hidden');
        linesContainer.innerHTML = ''; 
        const maxLines = Math.max(sourceLines.length, targetLines.length);
        let alertCount = 0; let multiCount = 0;
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < maxLines; i++) {
            const source = sourceLines[i] !== undefined ? sourceLines[i] : '';
            const target = targetLines[i] !== undefined ? targetLines[i] : '';
            const analysis = analyzeAlignment(source, target);
            if (analysis.status !== 'ok') alertCount++;
            if (analysis.multiSentences) multiCount++;
            const isHidden = activeFilter === 'alerts' && analysis.status === 'ok';
            const row = document.createElement('div');
            row.id = `row-${i}`;
            row.className = `grid grid-cols-[1fr_140px_1fr] md:grid-cols-[1fr_160px_1fr] border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors group ${isHidden ? 'hidden' : ''}`;
            if (analysis.status === 'danger') row.classList.add('bg-rose-500/5');
            else if (analysis.status === 'warning') row.classList.add('bg-amber-500/5');
            else if (analysis.multiSentences) row.classList.add('bg-indigo-500/5');
            
            const colorClass = analysis.status === 'danger' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 
                               analysis.status === 'warning' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 
                               'bg-gray-800 text-gray-400 border-gray-700 group-hover:border-gray-600';

            row.innerHTML = `
                <div class="py-4 px-4 text-sm text-gray-300 leading-relaxed border-r border-gray-800/30 relative group/cell">
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
                <div class="py-4 px-4 text-sm text-gray-300 leading-relaxed border-l border-gray-800/30 relative group/cell">
                    <div class="editable-cell outline-none focus:bg-gray-800/60 rounded px-2 -mx-2 transition-colors min-h-[1.5rem]" contenteditable="plaintext-only" data-index="${i}" data-side="target">${escapeHtml(target)}</div>
                    <div class="absolute top-1 right-2 flex gap-1 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                        <button class="insert-btn bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded p-1" data-index="${i}" data-side="target"><svg class="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"></path></svg></button>
                        <button class="delete-btn bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 rounded p-1" data-index="${i}" data-side="target"><svg class="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M20 12H4"></path></svg></button>
                    </div>
                </div>`;
            fragment.appendChild(row);
        }
        linesContainer.appendChild(fragment);
        updateGlobalStats(maxLines, alertCount, multiCount);
    }

    function updateGlobalStats(total, alerts, multi) {
        totalLinesSpan.textContent = total; alertLinesSpan.textContent = alerts;
        dashAlerts.textContent = alerts; dashMulti.textContent = multi;
        const health = total > 0 ? Math.round(((total - alerts) / total) * 100) : 0;
        healthBar.style.width = `${health}%`; healthPct.textContent = `${health}%`;
        healthBar.className = `h-full transition-all duration-1000 ${health > 90 ? 'bg-emerald-500' : health > 70 ? 'bg-amber-500' : 'bg-rose-500'}`;
        healthPct.className = `text-xs font-mono font-bold ${health > 90 ? 'text-emerald-400' : health > 70 ? 'text-amber-400' : 'text-rose-400'}`;
    }

    function updateRowStats(index) {
        const source = sourceLines[index] !== undefined ? sourceLines[index] : '';
        const target = targetLines[index] !== undefined ? targetLines[index] : '';
        const analysis = analyzeAlignment(source, target);
        const statsCol = document.getElementById(`stats-${index}`);
        const row = document.getElementById(`row-${index}`);
        if (!statsCol || !row) return;
        row.classList.remove('bg-rose-500/5', 'bg-amber-500/5', 'bg-indigo-500/5');
        if (analysis.status === 'danger') row.classList.add('bg-rose-500/5');
        else if (analysis.status === 'warning') row.classList.add('bg-amber-500/5');
        else if (analysis.multiSentences) row.classList.add('bg-indigo-500/5');
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
            if (side === 'source') sourceLines[index] = text; else targetLines[index] = text;
            updateRowStats(index);
        }
    });

    linesContainer.addEventListener('click', (e) => {
        const insertBtn = e.target.closest('.insert-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        if (insertBtn || deleteBtn) {
            const btn = insertBtn || deleteBtn;
            const index = parseInt(btn.getAttribute('data-index'), 10);
            const side = btn.getAttribute('data-side');
            if (insertBtn) { if (side === 'source') sourceLines.splice(index, 0, ''); else targetLines.splice(index, 0, ''); }
            else if (deleteBtn) { if (side === 'source') sourceLines.splice(index, 1); else targetLines.splice(index, 1); }
            renderViewer();
        }
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
        if (sourceLines.length === 0 && targetLines.length === 0) return;
        const fmt = (n) => { 
            const sanitized = (n || "source").replace(/[^\x20-\x7E]/g, '').trim();
            const p = sanitized.split('.'); let e = p.length > 1 ? '.' + p.pop() : '.txt'; 
            if (e === '.') e = '.txt'; return `[ALIGN]_` + p.join('.') + e; 
        };
        const sBlob = sourceLines.join('\r\n'); const tBlob = targetLines.join('\r\n');
        const name1 = fmt(sourceFileName); const name2 = fmt(targetFileName);
        
        showToast("Lancement de l'exportation...", "info");
        
        // Split downloads with a small delay to avoid browser blocking
        downloadFile(sBlob, name1);
        setTimeout(() => {
            downloadFile(tBlob, name2);
            showToast("Sauvegarde terminée !", "success");
        }, 800);
    });

    function downloadFile(content, filename) {
        const blob = new Blob(['\ufeff', content], { type: 'application/octet-stream' });
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
