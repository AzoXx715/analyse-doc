// Main application state and initialization
let analysisState = {
  apiKey: '',
  apiConnected: false,
  mainDocument: null,
  referenceDocuments: [],
  currentPhase: 0,
  vectorIndex: new Map(),
  analysisResults: {},
  entityCount: 0,
  segmentCount: 0,
  verificationCount: 0,
  issueCount: 0
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initializeAPI();
  initializeUI();
  logMessage('🚀 Système d\'analyse documentaire initialisé avec OpenAI');
});