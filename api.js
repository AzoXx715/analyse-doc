// OpenAI API Configuration and functions
function initializeAPI() {
  const savedKey = localStorage.getItem('openai-api-key');
  if (savedKey) {
    analysisState.apiKey = savedKey;
    document.getElementById('openai-key').value = savedKey;
    testAPIConnection();
  }
}

async function testAPIConnection() {
  if (!analysisState.apiKey) {
    alert('Veuillez entrer votre clé API OpenAI');
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${analysisState.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      updateAPIStatus(true);
      logMessage('✅ Connexion OpenAI établie avec succès');
    } else {
      updateAPIStatus(false);
      logMessage('❌ Erreur de connexion OpenAI: Clé API invalide');
    }
  } catch (error) {
    updateAPIStatus(false);
    logMessage(`❌ Erreur de connexion OpenAI: ${error.message}`);
  }
}

function updateAPIStatus(connected) {
  analysisState.apiConnected = connected;
  const indicator = document.getElementById('api-status');
  indicator.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
  checkStartButton();
}

// API Functions using OpenAI
async function callOpenAI(messages, options = {}) {
  if (!analysisState.apiKey) {
    throw new Error('Clé API OpenAI non configurée');
  }

  const payload = {
    model: options.model || 'gpt-4',
    messages: messages,
    max_tokens: options.maxTokens || 2000,
    temperature: options.temperature || 0.1,
    ...options
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${analysisState.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API Error: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

async function extractDocumentContent(file) {
  logMessage(`📄 Extraction du contenu: ${file.name}`);
  
  // Convert file to text (simplified - in real implementation would handle PDF/DOCX properly)
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target.result);
    };
    reader.readAsText(file);
  });
}

async function extractEntities(content) {
  const messages = [{
    role: 'system',
    content: `Vous êtes un expert en analyse documentaire. Analysez le texte fourni et extrayez toutes les entités importantes selon ce format JSON:
    {
      "entities": [
        {
          "id": "entity_1",
          "text": "texte exact de l'entité",
          "type": "concept|valeur|équation|référence|affirmation",
          "context": "contexte immédiat",
          "position": "position approximative"
        }
      ]
    }`
  }, {
    role: 'user',
    content: `Analysez ce texte et extrayez toutes les entités importantes:\n\n${content.substring(0, 8000)}...`
  }];

  try {
    const result = await callOpenAI(messages, { maxTokens: 2000 });
    const parsed = JSON.parse(result);
    return parsed.entities || [];
  } catch (error) {
    logMessage(`⚠️ Erreur extraction entités: ${error.message}`);
    return [];
  }
}

async function generateEmbedding(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${analysisState.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding API Error: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data[0].embedding;
  } catch (error) {
    logMessage(`⚠️ Erreur génération embedding: ${error.message}`);
    // Fallback to simple hash-based vector
    return simpleHashVector(text);
  }
}

function simpleHashVector(text) {
  const words = text.toLowerCase().split(/\s+/);
  const vector = new Array(384).fill(0);
  
  words.forEach((word, i) => {
    const hash = simpleHash(word);
    vector[hash % 384] += 1;
  });
  
  // Normalize vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => magnitude > 0 ? val / magnitude : 0);
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

async function verifyEntityConsistency(entity, similarRefs) {
  const messages = [{
    role: 'system',
    content: `Vous êtes un expert en vérification de cohérence documentaire. Analysez l'affirmation et les références pour déterminer la cohérence.
    Répondez en JSON avec ce format:
    {
      "consistent": true/false,
      "reason": "explication détaillée",
      "confidence": 0.8
    }`
  }, {
    role: 'user',
    content: `Vérifiez la cohérence de cette affirmation avec les références fournies:

Affirmation: "${entity.text}"

Références:
${similarRefs.map((ref, i) => `${i + 1}. ${ref.entity.text} (Source: ${ref.entity.source})`).join('\n')}`
  }];

  try {
    const result = await callOpenAI(messages, { maxTokens: 500 });
    const evaluation = JSON.parse(result);
    
    return {
      consistent: evaluation.consistent,
      reason: evaluation.reason,
      confidence: evaluation.confidence
    };
  } catch (error) {
    return {
      consistent: false,
      reason: 'Erreur lors de la vérification',
      confidence: 0.1
    };
  }
}

async function generateSummary() {
  const messages = [{
    role: 'system',
    content: 'Vous êtes un expert en synthèse documentaire. Créez un résumé concis et informatif de l\'analyse effectuée.'
  }, {
    role: 'user',
    content: `Générez un résumé de cette analyse documentaire:
    - ${analysisState.entityCount} entités analysées
    - ${analysisState.segmentCount} segments traités
    - ${analysisState.verificationCount} vérifications effectuées
    - ${analysisState.issueCount} problèmes détectés
    
    Taux d'erreur: ${analysisState.verificationCount > 0 ? (analysisState.issueCount / analysisState.verificationCount * 100).toFixed(1) : 0}%`
  }];

  try {
    return await callOpenAI(messages, { maxTokens: 300 });
  } catch (error) {
    return `Analyse de ${analysisState.entityCount} entités sur ${analysisState.segmentCount} segments. 
            ${analysisState.issueCount} problèmes détectés sur ${analysisState.verificationCount} vérifications.`;
  }
}