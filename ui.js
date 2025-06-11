// UI initialization and event handlers
function initializeUI() {
  // API key input handler
  document.getElementById('openai-key').addEventListener('input', (e) => {
    const key = e.target.value.trim();
    analysisState.apiKey = key;
    if (key) {
      localStorage.setItem('openai-api-key', key);
    } else {
      localStorage.removeItem('openai-api-key');
    }
    updateAPIStatus(false);
  });

  document.getElementById('test-api').addEventListener('click', testAPIConnection);

  // Navigation handlers
  document.querySelectorAll('.navtab').forEach(btn => {
    btn.addEventListener('click', e => {
      document.querySelectorAll('.navtab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // File upload setup
  setupFileUpload('main-doc-zone', 'main-doc-input', handleMainDocument);
  setupFileUpload('ref-docs-zone', 'ref-docs-input', handleReferenceDocuments);

  // Start analysis button
  document.getElementById('start-analysis').addEventListener('click', startAnalysisPipeline);

  // Search functionality
  document.getElementById('search-btn').addEventListener('click', performSemanticSearch);
  document.getElementById('semantic-search').addEventListener('keypress', e => {
    if (e.key === 'Enter') performSemanticSearch();
  });

  // Export functionality
  document.getElementById('export-report').addEventListener('click', exportReport);
}

// File upload handlers
function setupFileUpload(zoneId, inputId, callback) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      input.files = files;
      callback(files);
    }
  });
  
  input.addEventListener('change', e => callback(e.target.files));
}

function handleMainDocument(files) {
  if (files.length > 0) {
    analysisState.mainDocument = files[0];
    updateFileStatus('main-doc-status', files);
    checkStartButton();
    logMessage(`Document principal chargé: ${files[0].name}`);
  }
}

function handleReferenceDocuments(files) {
  analysisState.referenceDocuments = Array.from(files);
  updateFileStatus('ref-docs-status', files);
  checkStartButton();
  logMessage(`${files.length} documents de référence chargés`);
}

function updateFileStatus(statusId, files) {
  const status = document.getElementById(statusId);
  if (files.length) {
    const fileList = Array.from(files).map(f => 
      `<div style="margin: 0.5rem 0; padding: 0.5rem; background: var(--surface); border-radius: 6px;">
        📄 ${f.name} (${formatFileSize(f.size)})
      </div>`
    ).join('');
    status.innerHTML = fileList;
  } else {
    status.innerHTML = '';
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkStartButton() {
  const startBtn = document.getElementById('start-analysis');
  const canStart = analysisState.mainDocument && 
                  analysisState.referenceDocuments.length > 0 && 
                  analysisState.apiConnected;
  startBtn.disabled = !canStart;
  if (canStart) {
    startBtn.textContent = `Analyser 1 document principal + ${analysisState.referenceDocuments.length} références`;
  } else if (!analysisState.apiConnected) {
    startBtn.textContent = 'Configurer OpenAI d\'abord';
  }
}

// UI Update Functions
function switchToTab(tabName) {
  document.querySelector(`[data-tab="${tabName}"]`).click();
}

function updateProgress(percentage, text) {
  document.getElementById('overall-progress').style.width = `${percentage}%`;
  document.getElementById('progress-text').textContent = text;
}

function markPhaseActive(phaseNum) {
  const phase = document.getElementById(`phase-${phaseNum}`);
  phase.classList.add('active');
  phase.querySelector('.phase-status').classList.add('active');
}

function markPhaseCompleted(phaseNum) {
  const phase = document.getElementById(`phase-${phaseNum}`);
  phase.classList.remove('active');
  phase.classList.add('completed');
  phase.querySelector('.phase-status').classList.remove('active');
  phase.querySelector('.phase-status').classList.add('completed');
  phase.querySelector('.phase-status').innerHTML = '✓';
}

function markPhaseError(phaseNum) {
  const phase = document.getElementById(`phase-${phaseNum}`);
  phase.classList.remove('active');
  phase.classList.add('error');
  phase.querySelector('.phase-status').classList.remove('active');
  phase.querySelector('.phase-status').classList.add('error');
  phase.querySelector('.phase-status').innerHTML = '✗';
}

function updateStat(statId, value) {
  document.getElementById(statId).textContent = value.toLocaleString();
}

function logMessage(message) {
  const logs = document.getElementById('pipeline-logs');
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-timestamp">${timestamp}</span><span>${message}</span>`;
  logs.insertBefore(entry, logs.firstChild);
  
  // Keep only last 20 entries
  while (logs.children.length > 20) {
    logs.removeChild(logs.lastChild);
  }
}

function displayReport(report) {
  const reportContent = document.getElementById('report-content');
  
  let html = `
    <div class="report-stats">
      <div class="stat-card">
        <div class="stat-number">${report.statistics.totalEntities}</div>
        <div class="stat-label">Entités Analysées</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${report.statistics.totalIssues}</div>
        <div class="stat-label">Problèmes Détectés</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${report.statistics.totalVerifications}</div>
        <div class="stat-label">Vérifications</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${((1 - report.statistics.totalIssues / report.statistics.totalVerifications) * 100).toFixed(1)}%</div>
        <div class="stat-label">Taux de Confiance</div>
      </div>
    </div>
    
    <div style="margin: 2rem 0;">
      <h4>Résumé Exécutif</h4>
      <p>${report.summary}</p>
    </div>
    
    <h4>Problèmes Détectés</h4>
  `;
  
  if (report.verifications && report.verifications.length > 0) {
    report.verifications.forEach((verification, index) => {
      verification.issues.forEach(issue => {
        html += `
          <div class="finding-item ${issue.type}">
            <div class="finding-header">
              <div class="finding-title">${issue.message}</div>
              <div class="finding-location">Segment ${verification.segment.id}</div>
            </div>
            <div class="finding-content">
              <strong>Entité:</strong> ${issue.entity.text}
              ${issue.references ? `<br><strong>Références:</strong> ${issue.references.map(r => r.entity.source).join(', ')}` : ''}
            </div>
            <div class="confidence-meter">
              <span style="font-size: 0.85rem;">Confiance:</span>
              <div class="confidence-bar">
                <div class="confidence-fill ${getConfidenceClass(issue.confidence)}" 
                     style="width: ${issue.confidence * 100}%"></div>
              </div>
              <span style="font-size: 0.85rem;">${(issue.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        `;
      });
    });
  } else {
    html += '<div style="text-align: center; color: var(--success); padding: 2rem;">Aucun problème détecté</div>';
  }
  
  reportContent.innerHTML = html;
}

function getConfidenceClass(confidence) {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

function displayDomains(domains) {
  const domainsList = document.getElementById('domains-list');
  
  if (domains.length > 0) {
    domainsList.innerHTML = domains.map(domain => 
      `<div class="tag domain" style="margin: 0.5rem 0;">${domain}</div>`
    ).join('');
  } else {
    domainsList.innerHTML = '<div style="color: var(--accent2); padding: 1rem;">Aucun domaine détecté</div>';
  }
}

function displayTags(tags) {
  const tagsNav = document.getElementById('tags-navigation');
  
  if (tags.size > 0) {
    let html = '';
    tags.forEach((entityIds, tag) => {
      html += `<div class="tag concept" style="margin: 0.25rem; cursor: pointer;" 
                    onclick="searchByTag('${tag}')">${tag} (${entityIds.length})</div>`;
    });
    tagsNav.innerHTML = html;
  } else {
    tagsNav.innerHTML = '<div style="color: var(--accent2); padding: 1rem;">Aucun tag généré</div>';
  }
}

function searchByTag(tag) {
  document.getElementById('semantic-search').value = tag;
  performSemanticSearch();
}

function performSemanticSearch() {
  const query = document.getElementById('semantic-search').value;
  const results = document.getElementById('search-results');
  
  if (!query.trim()) {
    results.innerHTML = '';
    return;
  }
  
  // Simplified search - in real implementation would use proper vector similarity
  const matchingEntities = [];
  
  if (analysisState.mainEntities) {
    analysisState.mainEntities.forEach(entity => {
      if (entity.text.toLowerCase().includes(query.toLowerCase())) {
        matchingEntities.push(entity);
      }
    });
  }
  
  if (matchingEntities.length > 0) {
    let html = '<h5>Résultats de Recherche</h5>';
    matchingEntities.slice(0, 10).forEach(entity => {
      html += `
        <div class="finding-item">
          <div class="finding-content">${entity.text}</div>
          <div class="tag-container">
            <div class="tag">${entity.type}</div>
          </div>
        </div>
      `;
    });
    results.innerHTML = html;
  } else {
    results.innerHTML = '<div style="color: var(--accent2); padding: 1rem;">Aucun résultat trouvé</div>';
  }
}

function exportReport() {
  if (!analysisState.finalReport) {
    alert('Aucun rapport à exporter. Lancez d\'abord une analyse.');
    return;
  }
  
  // Generate text report
  let reportText = `RAPPORT D'ANALYSE DOCUMENTAIRE\n`;
  reportText += `Generated: ${new Date().toISOString()}\n\n`;
  reportText += `RÉSUMÉ:\n${analysisState.finalReport.summary}\n\n`;
  reportText += `STATISTIQUES:\n`;
  reportText += `- Entités: ${analysisState.finalReport.statistics.totalEntities}\n`;
  reportText += `- Segments: ${analysisState.finalReport.statistics.totalSegments}\n`;
  reportText += `- Vérifications: ${analysisState.finalReport.statistics.totalVerifications}\n`;
  reportText += `- Problèmes: ${analysisState.finalReport.statistics.totalIssues}\n\n`;
  
  if (analysisState.finalReport.verifications) {
    reportText += `PROBLÈMES DÉTECTÉS:\n`;
    analysisState.finalReport.verifications.forEach((verification, i) => {
      verification.issues.forEach((issue, j) => {
        reportText += `${i + 1}.${j + 1} ${issue.message}\n`;
        reportText += `    Entité: ${issue.entity.text}\n`;
        reportText += `    Confiance: ${(issue.confidence * 100).toFixed(0)}%\n\n`;
      });
    });
  }
  
  // Download as text file
  const blob = new Blob([reportText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rapport_analyse_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}