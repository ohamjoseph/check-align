document.addEventListener('DOMContentLoaded', () => {
    const sourceInput = document.getElementById('source-file');
    const targetInput = document.getElementById('target-file');
    const resetBtn = document.getElementById('reset-btn');
    const emptyState = document.getElementById('empty-state');
    const viewer = document.getElementById('viewer');
    const linesContainer = document.getElementById('lines-container');
    const statsFooter = document.getElementById('stats-footer');
    const totalLinesSpan = document.getElementById('total-lines');
    const alertLinesSpan = document.getElementById('alert-lines');

    let sourceLines = [];
    let targetLines = [];

    // Configuration for heuristics
    const CONFIG = {
        ratioWarningMin: 0.5,
        ratioWarningMax: 2.0,
        ratioDangerMin: 0.3,
        ratioDangerMax: 3.0,
        lengthDiffWarning: 50, // character difference
        lengthDiffDanger: 100
    };

    function handleFileSelection() {
        if (sourceInput.files.length > 0 && targetInput.files.length > 0) {
            Promise.all([
                readFile(sourceInput.files[0]),
                readFile(targetInput.files[0])
            ]).then(([sourceText, targetText]) => {
                sourceLines = sourceText.split(/\r?\n/);
                targetLines = targetText.split(/\r?\n/);
                renderViewer();
            }).catch(error => {
                console.error("Erreur de lecture des fichiers:", error);
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
        // Match standard punctuation followed by space or end of string
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
        
        // Multi-sentence detection (warns if either side has >1 sentences)
        const multiSentences = sourceSentences > 1 || targetSentences > 1;

        if (sourceWords === 0 && targetWords === 0) return { status: 'ok', ratio: '—', text: 'Vide', multiSentences };
        if (sourceWords === 0) return { status: 'danger', ratio: '∞', text: 'Cible max', multiSentences };
        if (targetWords === 0) return { status: 'danger', ratio: '0', text: 'Source max', multiSentences };

        const ratio = targetWords / sourceWords;
        const formattedRatio = ratio.toFixed(1);
        
        let status = 'ok';
        let text = `${formattedRatio}x mots`;

        if (ratio <= CONFIG.ratioDangerMin || ratio >= CONFIG.ratioDangerMax) {
            status = 'danger';
        } else if (ratio <= CONFIG.ratioWarningMin || ratio >= CONFIG.ratioWarningMax) {
            status = 'warning';
        }

        // Secondary check based on length if word counts are small
        const lenDiff = Math.abs(target.length - source.length);
        if (lenDiff > CONFIG.lengthDiffDanger) {
             status = 'danger';
        } else if (lenDiff > CONFIG.lengthDiffWarning && status === 'ok') {
             status = 'warning';
        }

        return { status, ratio: formattedRatio, text, multiSentences };
    }

    function renderViewer() {
        emptyState.classList.add('hidden');
        emptyState.classList.remove('flex');
        
        viewer.classList.remove('hidden');
        viewer.classList.add('flex');
        
        // Remove opacity-0 so the viewer is visible
        viewer.classList.remove('opacity-0');
        viewer.classList.add('opacity-100');

        statsFooter.classList.remove('hidden');

        linesContainer.innerHTML = ''; // Clear previous

        const maxLines = Math.max(sourceLines.length, targetLines.length);
        let alertCount = 0;

        // Use DocumentFragment for performance
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < maxLines; i++) {
            const source = sourceLines[i] !== undefined ? sourceLines[i] : '';
            const target = targetLines[i] !== undefined ? targetLines[i] : '';
            
            const analysis = analyzeAlignment(source, target);
            
            const row = document.createElement('div');
            
            // Base Tailwind classes for the row
            row.className = 'grid grid-cols-[1fr_140px_1fr] md:grid-cols-[1fr_160px_1fr] border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors group';
            
            // Highlight background classes
            if (analysis.status === 'danger') {
                row.classList.add('bg-rose-500/5');
                alertCount++;
            } else if (analysis.status === 'warning') {
                row.classList.add('bg-amber-500/5');
                alertCount++;
            } else if (analysis.multiSentences) {
                // Info alert for multi-sentences even if ratio is OK
                row.classList.add('bg-indigo-500/5');
            }

            // Indicator styles
            let indicatorHTML = '';
            if (analysis.status === 'danger') {
                indicatorHTML = `<span class="px-2 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 whitespace-nowrap">${analysis.text}</span>`;
            } else if (analysis.status === 'warning') {
                indicatorHTML = `<span class="px-2 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 whitespace-nowrap">${analysis.text}</span>`;
            } else {
                indicatorHTML = `<span class="px-2 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700 whitespace-nowrap shadow-sm group-hover:border-gray-600">${analysis.text}</span>`;
            }

            // Multi-sentence pill
            let multiSentenceHtml = '';
            if (analysis.multiSentences) {
                multiSentenceHtml = `<div class="mt-2 text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 inline-block uppercase tracking-wider">Multi-phrases</div>`;
            }

            row.innerHTML = `
                <div class="py-4 px-4 text-sm text-gray-300 leading-relaxed border-r border-gray-800/30 relative">
                    ${escapeHtml(source)}
                    ${countSentences(source) > 1 ? '<div class="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>' : ''}
                </div>
                
                <div class="py-4 px-2 flex flex-col items-center justify-start gap-2 bg-gray-900/40">
                    <span class="font-mono text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Ligne ${i + 1}</span>
                    ${indicatorHTML}
                    ${multiSentenceHtml}
                </div>

                <div class="py-4 px-4 text-sm text-gray-300 leading-relaxed border-l border-gray-800/30 relative">
                    ${escapeHtml(target)}
                    ${countSentences(target) > 1 ? '<div class="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>' : ''}
                </div>
            `;
            
            fragment.appendChild(row);
        }

        // Inside linesContainer, add the column headers structure that we moved explicitly inside viewer
        linesContainer.appendChild(fragment);

        // Update stats
        totalLinesSpan.textContent = maxLines;
        alertLinesSpan.textContent = alertCount;
    }

    function resetApp() {
        sourceInput.value = '';
        targetInput.value = '';
        sourceLines = [];
        targetLines = [];
        emptyState.classList.remove('hidden');
        emptyState.classList.add('flex');
        viewer.classList.add('hidden');
        viewer.classList.remove('flex');
        viewer.classList.remove('opacity-100');
        viewer.classList.add('opacity-0');
        statsFooter.classList.add('hidden');
        linesContainer.innerHTML = '';
        totalLinesSpan.textContent = '0';
        alertLinesSpan.textContent = '0';
    }

    // Utility to prevent XSS when setting innerHTML
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // Event Listeners
    sourceInput.addEventListener('change', handleFileSelection);
    targetInput.addEventListener('change', handleFileSelection);
    resetBtn.addEventListener('click', resetApp);
});
