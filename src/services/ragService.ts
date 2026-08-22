import { pipeline, env } from '@xenova/transformers';

// Configure transformers env for browser & local execution
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface VectorChunk {
  id: string;
  source: 'resume' | 'note' | 'github';
  sourceTitle: string;
  content: string;
  embedding: number[];
  timestamp: number;
}

const VECTOR_DB_KEY = 'acro_local_vector_db_v1';

let extractorPipeline: any = null;
let isPipelineLoading = false;

/**
 * Computes Cosine Similarity between two numeric vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Lightweight deterministic fallback vector generator for fast offline matching
 * if ONNX model binary is still initializing.
 */
function generateFallbackEmbedding(text: string, dimension: number = 384): number[] {
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  const vec = new Array(dimension).fill(0);

  words.forEach((word, idx) => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const targetIdx = Math.abs(hash) % dimension;
    vec[targetIdx] += 1 / (idx + 1);
  });

  // Normalize
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

class RagService {
  private vectorStore: VectorChunk[] = [];

  constructor() {
    this.loadVectorStore();
  }

  private loadVectorStore() {
    try {
      const saved = localStorage.getItem(VECTOR_DB_KEY);
      if (saved) {
        this.vectorStore = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load local vector DB:', e);
      this.vectorStore = [];
    }
  }

  private saveVectorStore() {
    try {
      localStorage.setItem(VECTOR_DB_KEY, JSON.stringify(this.vectorStore));
    } catch (e) {
      console.warn('Failed to save local vector DB:', e);
    }
  }

  /**
   * Initializes Transformers.js pipeline with Xenova/all-MiniLM-L6-v2 on-device.
   */
  public async initEmbeddingModel(onProgress?: (progress: number) => void): Promise<boolean> {
    if (extractorPipeline) return true;
    if (isPipelineLoading) return false;

    isPipelineLoading = true;
    try {
      extractorPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (info: any) => {
          if (info && info.progress && onProgress) {
            onProgress(Math.round(info.progress));
          }
        }
      });
      isPipelineLoading = false;
      return true;
    } catch (err) {
      console.warn('Failed to load Xenova/all-MiniLM-L6-v2 via ONNX, falling back to local lightweight vectorizer:', err);
      isPipelineLoading = false;
      return false;
    }
  }

  public isModelLoaded(): boolean {
    return extractorPipeline !== null;
  }

  /**
   * Embeds text using all-MiniLM-L6-v2 or deterministic fallback.
   */
  public async embedText(text: string): Promise<number[]> {
    if (!text || !text.trim()) return new Array(384).fill(0);

    if (extractorPipeline) {
      try {
        const output = await extractorPipeline(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
      } catch (e) {
        console.warn('Embedding pipeline execution error, using fallback:', e);
      }
    }

    return generateFallbackEmbedding(text, 384);
  }

  /**
   * Ingests and chunks resume text into vector store.
   */
  public async ingestResume(resumeText: string): Promise<number> {
    if (!resumeText || !resumeText.trim()) return 0;

    // Remove existing resume chunks
    this.vectorStore = this.vectorStore.filter(chunk => chunk.source !== 'resume');

    // Semantic chunking by section or paragraphs
    const paragraphs = resumeText
      .split(/\n\s*\n|\n(?=[A-Z\s]{4,}:)/)
      .map(p => p.trim())
      .filter(p => p.length > 20);

    const chunksToIngest = paragraphs.length > 0 ? paragraphs : [resumeText.substring(0, 1500)];

    for (let i = 0; i < chunksToIngest.length; i++) {
      const chunkText = chunksToIngest[i];
      const embedding = await this.embedText(chunkText);

      this.vectorStore.push({
        id: `resume_chunk_${i}_${Date.now()}`,
        source: 'resume',
        sourceTitle: 'Student Resume',
        content: chunkText,
        embedding,
        timestamp: Date.now()
      });
    }

    this.saveVectorStore();
    return chunksToIngest.length;
  }

  /**
   * Ingests a student note or study topic into vector store.
   */
  public async ingestNote(noteId: string, title: string, content: string): Promise<boolean> {
    if (!content || !content.trim()) return false;

    // Remove existing chunk for this note
    this.vectorStore = this.vectorStore.filter(chunk => chunk.id !== `note_${noteId}`);

    const combinedText = `Topic/Note: ${title}\nContent: ${content}`;
    const embedding = await this.embedText(combinedText);

    this.vectorStore.push({
      id: `note_${noteId}`,
      source: 'note',
      sourceTitle: title || 'Study Note',
      content: combinedText,
      embedding,
      timestamp: Date.now()
    });

    this.saveVectorStore();
    return true;
  }

  /**
   * Removes a note from the vector store.
   */
  public removeNote(noteId: string) {
    this.vectorStore = this.vectorStore.filter(chunk => chunk.id !== `note_${noteId}`);
    this.saveVectorStore();
  }

  /**
   * Performs Semantic Vector Similarity Search to retrieve top K relevant chunks for a prompt query.
   */
  public async queryRAGContext(queryText: string, topK: number = 4): Promise<{ content: string; source: string; similarity: number }[]> {
    if (this.vectorStore.length === 0) return [];

    const queryEmbedding = await this.embedText(queryText);

    const scored = this.vectorStore.map(chunk => ({
      content: chunk.content,
      source: chunk.sourceTitle,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    // Sort by descending similarity
    scored.sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, topK);
  }

  public getVectorStoreStats() {
    const totalChunks = this.vectorStore.length;
    const resumeChunks = this.vectorStore.filter(c => c.source === 'resume').length;
    const noteChunks = this.vectorStore.filter(c => c.source === 'note').length;
    return { totalChunks, resumeChunks, noteChunks };
  }
}

export const ragService = new RagService();
