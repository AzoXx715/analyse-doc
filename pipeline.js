// Pipeline execution and analysis functions
async function startAnalysisPipeline() {
  document.getElementById('start-analysis').disabled = true;
  switchToTab('pipeline');
  
  try {
    await executePhase1();
    await executePhase2();
    await executePhase3();
    await executePhase4();
    
    logMessage('✅ Analyse terminée avec succès');
    switchToTab('reports');
  } catch (error) {
    logMessage(`❌ Erreur durant l'analyse: ${error.message}`);
    markPhaseError(analysisState.currentPhase);
  }
}

async function executePhase1() {
  analysisState.currentPhase = 1;
  markPhaseActive(1);
  updateProgress(10, 'Phase 1: Extraction et indexation...');
  
  logMessage('🔍 Début de l\'extraction des entités...');
  
  // Extract from main document
  const mainContent = await extractDocumentContent(analysisState.mainDocument);
  const entities = await extractEntities(mainContent);
  
  analysisState.entityCount = entities.length;
  updateStat('entities-count', entities.length);
  
  // Extract from reference documents
  let refEntities = [];
  for (let i = 0; i < analysisState.referenceDocuments.length; i++) {
    const doc = analysisState.referenceDocuments[i];
    logMessage(`📚 Traitement référence ${i + 1}/${analysisState.referenceDocuments.length}: ${doc.name}`);
    const content = await extractDocumentContent(doc);
    const docEntities = await extractEntities(content);
    refEntities = refEntities.concat(docEntities.map(e => ({...e, source: doc.name})));
    
    updateProgress(10 + (i / analysisState.referenceDocuments.length) * 15, 
                  `Extraction référence ${i + 1}/${analysisState.referenceDocuments.length}`);
  }
  
  analysisState.mainEntities = entities;
  analysisState.referenceEntities = refEntities;
  
  markPhaseCompleted(1);
  logMessage(`✅ Phase 1 terminée: ${entities.length} entités principales, ${refEntities.length} entités de référence`);
}

async function executePhase2() {
  analysisState.currentPhase = 2;
  markPhaseActive(2);
  updateProgress(25, 'Phase 2: Construction des bases vectorielles...');
  
  logMessage('🧠 Génération des embeddings...');
  
  // Create vector embeddings for all entities
  const allEntities = [...analysisState.mainEntities, ...analysisState.referenceEntities];
  
  for (let i = 0; i < allEntities.length; i++) {
    const entity = allEntities[i];
    const embedding = await generateEmbedding(entity.text);
    analysisState.vectorIndex.set(entity.id, {
      ...entity,
      embedding: embedding,
      vector_id: entity.id
    });
    
    if (i % 50 === 0) {
      updateProgress(25 + (i / allEntities.length) * 25, 
                    `Embeddings ${i}/${allEntities.length}`);
    }
  }
  
  markPhaseCompleted(2);
  logMessage(`✅ Phase 2 terminée: ${analysisState.vectorIndex.size} embeddings générés`);
}

async function executePhase3() {
  analysisState.currentPhase = 3;
  markPhaseActive(3);
  updateProgress(50, 'Phase 3: Analyse croisée...');
  
  logMessage('🔍 Début de l\'analyse croisée des sources...');
  
  const segments = segmentDocument(analysisState.mainEntities);
  analysisState.segmentCount = segments.length;
  updateStat('segments-count', segments.length);
  
  const verifications = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    logMessage(`🔍 Analyse segment ${i + 1}/${segments.length}`);
    
    const verification = await performCrossVerification(segment);
    verifications.push(verification);
    
    analysisState.verificationCount++;
    updateStat('verifications-count', analysisState.verificationCount);
    
    if (verification.issues.length > 0) {
      analysisState.issueCount += verification.issues.length;
      updateStat('issues-count', analysisState.issueCount);
    }
    
    updateProgress(50 + (i / segments.length) * 25, 
                  `Analyse segment ${i + 1}/${segments.length}`);
  }
  
  analysisState.verifications = verifications;
  
  markPhaseCompleted(3);
  logMessage(`✅ Phase 3 terminée: ${verifications.length} segments vérifiés`);
}

async function executePhase4() {
  analysisState.currentPhase = 4;
  markPhaseActive(4);
  updateProgress(75, 'Phase 4: Validation et synthèse...');
  
  logMessage('📊 Génération du rapport final...');
  
  const report = await generateFinalReport();
  analysisState.finalReport = report;
  
  // Update UI with results
  displayReport(report);
  displayDomains(report.domains);
  displayTags(report.tags);
  
  updateProgress(100, 'Analyse terminée');
  markPhaseCompleted(4);
  logMessage(`✅ Analyse complète terminée`);
}

function segmentDocument(entities) {
  // Group entities into logical segments
  const segments = [];
  const segmentSize = 20;
  
  for (let i = 0; i < entities.length; i += segmentSize) {
    segments.push({
      id: `segment_${Math.floor(i / segmentSize)}`,
      entities: entities.slice(i, i + segmentSize),
      startIndex: i,
      endIndex: Math.min(i + segmentSize, entities.length)
    });
  }
  
  return segments;
}

async function performCrossVerification(segment) {
  logMessage(`🔍 Vérification croisée segment ${segment.id}`);
  
  const issues = [];
  const confidenceScores = [];
  
  // Find similar entities in reference documents
  for (const entity of segment.entities) {
    const similarRefs = findSimilarEntities(entity, analysisState.referenceEntities);
    
    if (similarRefs.length === 0) {
      issues.push({
        type: 'warning',
        entity: entity,
        message: 'Aucune référence trouvée pour vérifier cette affirmation',
        confidence: 0.3
      });
    } else {
      // Verify consistency
      const verification = await verifyEntityConsistency(entity, similarRefs);
      if (!verification.consistent) {
        issues.push({
          type: 'error',
          entity: entity,
          message: verification.reason,
          references: similarRefs,
          confidence: verification.confidence
        });
      }
      confidenceScores.push(verification.confidence);
    }
  }
  
  const avgConfidence = confidenceScores.length > 0 
    ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length 
    : 0.5;
  
  return {
    segment: segment,
    issues: issues,
    confidence: avgConfidence,
    verified: issues.length === 0
  };
}

function findSimilarEntities(targetEntity, referenceEntities) {
  const similarities = [];
  const targetVector = analysisState.vectorIndex.get(targetEntity.id)?.embedding;
  
  if (!targetVector) return [];
  
  for (const refEntity of referenceEntities) {
    const refVector = analysisState.vectorIndex.get(refEntity.id)?.embedding;
    if (refVector) {
      const similarity = cosineSimilarity(targetVector, refVector);
      if (similarity > 0.7) { // Threshold for similarity
        similarities.push({
          entity: refEntity,
          similarity: similarity
        });
      }
    }
  }
  
  return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function generateFinalReport() {
  logMessage('📊 Compilation du rapport final...');
  
  const domains = extractDomains();
  const tags = generateTags();
  const summary = await generateSummary();
  
  return {
    timestamp: new Date().toISOString(),
    summary: summary,
    domains: domains,
    tags: tags,
    statistics: {
      totalEntities: analysisState.entityCount,
      totalSegments: analysisState.segmentCount,
      totalVerifications: analysisState.verificationCount,
      totalIssues: analysisState.issueCount
    },
    verifications: analysisState.verifications
  };
}

function extractDomains() {
  const domains = new Set();
  
  analysisState.mainEntities.forEach(entity => {
    // Simplified domain detection
    if (entity.text.toLowerCase().includes('math')) domains.add('Mathématiques');
    if (entity.text.toLowerCase().includes('phys')) domains.add('Physique');
    if (entity.text.toLowerCase().includes('bio')) domains.add('Biologie');
    if (entity.text.toLowerCase().includes('chem')) domains.add('Chimie');
    if (entity.text.toLowerCase().includes('éco')) domains.add('Économie');
  });
  
  return Array.from(domains);
}

function generateTags() {
  const tags = new Map();
  
  analysisState.mainEntities.forEach(entity => {
    const entityTags = extractTagsFromEntity(entity);
    entityTags.forEach(tag => {
      if (!tags.has(tag)) {
        tags.set(tag, []);
      }
      tags.get(tag).push(entity.id);
    });
  });
  
  return tags;
}

function extractTagsFromEntity(entity) {
  const tags = [];
  const text = entity.text.toLowerCase();
  
  // Extract numerical values
  const numbers = text.match(/\d+(?:\.\d+)?/g);
  if (numbers) {
    numbers.forEach(num => tags.push(`valeur:${num}`));
  }
  
  // Extract key concepts
  const words = text.split(/\s+/).filter(word => word.length > 3);
  words.forEach(word => tags.push(`concept:${word}`));
  
  return tags;
}