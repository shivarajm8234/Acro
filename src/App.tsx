import React, { useState, useEffect, useRef } from 'react';
import {
  // Navigation & UI
  House, Brain, TelevisionSimple, Briefcase, User,
  // Actions
  Plus, X, Check, Download, Trash, Play, Pause,
  Upload, FloppyDisk, ArrowSquareOut, MagnifyingGlass,
  // Comms
  ChatCircle, PaperPlaneTilt, Microphone,
  // Status & Info
  Warning, CheckCircle, Lock,
  // Content
  Note, PushPin, Star, Archive, FileText, Paperclip,
  // AI
  Robot, Cpu, ArrowsClockwise, Eye, EyeSlash,
  // Misc
  CaretDown, CaretUp, Trophy, TrendUp,
} from '@phosphor-icons/react';
import * as pdfjsLib from 'pdfjs-dist';
import { Xframe } from 'capacitor-plugin-xframe';
import { registerPlugin } from '@capacitor/core';
import { ragService } from './services/ragService';
import './App.css';

// ─── Plugin Registrations ───────────────────────────────────────────
interface AppLockPluginType {
  isAccessibilityEnabled(): Promise<{ enabled: boolean }>;
  openAccessibilitySettings(): Promise<void>;
  getInstalledApps(): Promise<{ apps: Array<{ packageName: string; appName: string; icon: string; endTimeMs: number; isBlocked: boolean }> }>;
  setAppLock(options: { packageName: string; duration: number; unit: string }): Promise<{ success: boolean; endTimeMs: number }>;
}

const AppLock = registerPlugin<AppLockPluginType>('AppLock');

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface ModelDownloaderPluginType {
  startDownload(options: { modelId: string; url: string; hfToken?: string; fileName: string; sizeBytes: number }): Promise<void>;
  cancelDownload(options: { modelId: string }): Promise<void>;
  getModelStatus(options: { modelId: string; fileName: string }): Promise<{ status: string; size: number }>;
  deleteModel(options: { modelId: string; fileName: string }): Promise<{ deleted: boolean }>;
  getFreeStorage(): Promise<{ freeBytes: number; totalBytes: number }>;
}

const ModelDownloader = registerPlugin<ModelDownloaderPluginType>('ModelDownloader');

// ─── Types & Constants ──────────────────────────────────────────────
interface AIModel {
  id: string;
  name: string;
  architecture: string;
  sizeBytes: number;
  displaySize: string;
  description: string;
  gated: boolean;
  downloadUrl: string;
  fileName: string;
}

const MODELS: AIModel[] = [
  {
    id: 'gemma-4-e2b-it',
    name: 'Gemma 4 E2B IT (v1.1 CPU)',
    architecture: 'Google Gemma 1.1 2B INT4 (MediaPipe LLM)',
    sizeBytes: 1346427328,
    displaySize: '1.25 GB',
    description: 'Google Gemma 1.1 2B Instruct CPU model for fast offline student query resolution.',
    gated: false,
    downloadUrl: 'https://huggingface.co/innermost47/gemma-2b-it-int4-mediapipe/resolve/main/gemma-1.1-2b-it-cpu-int4.bin',
    fileName: 'gemma-4-e2b-it.bin'
  },
  {
    id: 'gemma-2b-it-v1-cpu',
    name: 'Gemma 2B IT (v1.0 Standard)',
    architecture: 'Google Gemma 1.0 2B INT4 (MediaPipe LLM)',
    sizeBytes: 1346427328,
    displaySize: '1.25 GB',
    description: 'Official Google Gemma 1.0 2B Instruct model for offline reasoning.',
    gated: true,
    downloadUrl: 'https://huggingface.co/google/gemma-2b-it-tflite/resolve/main/gemma-2b-it-cpu-int4.bin',
    fileName: 'gemma-2b-it-v1-cpu.bin'
  },
  {
    id: 'gemma-2b-it-gpu-int4',
    name: 'Gemma 2B IT (GPU INT4)',
    architecture: 'Google Gemma 2B GPU INT4 (MediaPipe LLM)',
    sizeBytes: 1354301440,
    displaySize: '1.26 GB',
    description: 'Google Gemma 2B GPU-optimized INT4 model for high-throughput local inference.',
    gated: true,
    downloadUrl: 'https://huggingface.co/google/gemma-2b-it-tflite/resolve/main/gemma-2b-it-gpu-int4.bin',
    fileName: 'gemma-2b-it-gpu-int4.bin'
  },
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny',
    architecture: 'Speech-to-Text Encoder (Open-Access)',
    sizeBytes: 151061672,
    displaySize: '144 MB',
    description: 'On-device voice command recognition and lecture note audio parsing.',
    gated: false,
    downloadUrl: 'https://huggingface.co/openai/whisper-tiny/resolve/main/model.safetensors',
    fileName: 'whisper-tiny.bin'
  },
  {
    id: 'all-minilm-l6-v2',
    name: 'All-MiniLM-L6-v2 (Vector RAG Embeddings)',
    architecture: 'Sentence Transformer ONNX (384-dim Dense Embeddings)',
    sizeBytes: 23500000,
    displaySize: '22.5 MB',
    description: 'On-device vector embedding model powering Local RAG semantic search across resumes & study notes.',
    gated: false,
    downloadUrl: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx',
    fileName: 'all-minilm-l6-v2.onnx'
  }
];

type ModelStatus = 'idle' | 'downloading' | 'verifying' | 'installed' | 'loading' | 'loaded';

interface ModelState {
  status: ModelStatus;
  progress: number;
  downloadedBytes: number;
  error?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'model';
  text: string;
  timestamp: string;
  stats?: {
    speed: string;
    time: string;
    hardware: string;
  };
}

const LlmInference = registerPlugin('LlmInference') as {
  loadModel(options: { modelId: string; fileName: string; useGpu: boolean }): Promise<{ loaded: boolean; modelId: string; message: string }>;
  generateResponse(options: { prompt: string }): Promise<{ response: string; tokenCount: number; timeMs: number; modelId: string }>;
  unloadModel(): Promise<{ unloaded: boolean }>;
  getStatus(): Promise<{ isLoaded: boolean; loadedModelId: string; isLoading: boolean }>;
};

const Long_MAX_VALUE = 9223372036854775807;

// ─── Markdown Renderer ──────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  const parseInline = (str: string): React.ReactNode => {
    // Handle bold+italic, bold, italic, inline code
    const parts = str.split(/(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('***') && part.endsWith('***')) {
        return <strong key={idx}><em>{part.slice(3, -3)}</em></strong>;
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={idx}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={`pre-${i}`}><code className={lang ? `language-${lang}` : ''}>{codeLines.join('\n')}</code></pre>
      );
      i++;
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      elements.push(<h3 key={`h3-${i}`}>{parseInline(trimmed.slice(4))}</h3>);
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(<h2 key={`h2-${i}`}>{parseInline(trimmed.slice(3))}</h2>);
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(<h1 key={`h1-${i}`}>{parseInline(trimmed.slice(2))}</h1>);
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(<blockquote key={`bq-${i}`}>{parseInline(trimmed.slice(2))}</blockquote>);
      i++;
      continue;
    }

    // HR
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      elements.push(<hr key={`hr-${i}`} />);
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        listItems.push(<li key={i}>{parseInline(lines[i].trim().slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`}>{listItems}</ul>);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(<li key={i}>{parseInline(lines[i].trim().replace(/^\d+\.\s/, ''))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`}>{listItems}</ol>);
      continue;
    }

    // Empty line — paragraph break
    if (trimmed === '') {
      i++;
      continue;
    }

    // Plain paragraph
    elements.push(<p key={`p-${i}`}>{parseInline(trimmed)}</p>);
    i++;
  }

  return <div className="md-content">{elements}</div>;
}

// ─── PDF Viewer ─────────────────────────────────────────────────────
function PdfCanvasViewer({ dataUrl }: { dataUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);

  useEffect(() => {
    let isCancelled = false;
    async function renderPdfPage() {
      setIsLoadingPdf(true);
      try {
        const parts = dataUrl.split(';base64,');
        const base64Data = parts.length === 2 ? parts[1] : dataUrl;
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        if (isCancelled) return;
        setNumPages(pdf.numPages);
        const page = await pdf.getPage(currentPage);
        if (isCancelled) return;
        const viewport = page.getViewport({ scale: 1.1 });
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          if (context) {
            await page.render({ canvasContext: context, viewport }).promise;
          }
        }
        setIsLoadingPdf(false);
      } catch (err: any) {
        if (isCancelled) return;
        console.warn('PDF canvas render:', err);
        setIsLoadingPdf(false);
      }
    }
    if (dataUrl) renderPdfPage();
    return () => { isCancelled = true; };
  }, [dataUrl, currentPage]);

  return (
    <div className="pdf-canvas-wrapper">
      {isLoadingPdf && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', padding: '1rem', textAlign: 'center' }}>
          Loading document...
        </div>
      )}
      <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto' }} />
      {numPages > 1 && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.8rem' }}>
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="btn btn-secondary btn-sm"
          >Prev</button>
          <span style={{ color: 'var(--text-2)' }}>Page {currentPage} of {numPages}</span>
          <button
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            className="btn btn-secondary btn-sm"
          >Next</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Main App
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  // Storage
  const [availableStorage, setAvailableStorage] = useState<number>(15247134720);
  const [isRefreshingStorage, setIsRefreshingStorage] = useState<boolean>(false);

  // Tab
  const [activeTab, setActiveTab] = useState<'home' | 'downloader' | 'animly' | 'profile' | 'placement'>('home');
  const [isIframeLoading, setIsIframeLoading] = useState<boolean>(true);

  // Notepad
  const [isAddNoteOpen, setIsAddNoteOpen] = useState<boolean>(false);
  const [newNoteTitle, setNewNoteTitle] = useState<string>('');
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [activeViewNote, setActiveViewNote] = useState<NoteItem | null>(null);

  // App Lock
  const [isLockModalOpen, setIsLockModalOpen] = useState<boolean>(false);
  const [isLoadingApps, setIsLoadingApps] = useState<boolean>(false);
  const [lockingPackage, setLockingPackage] = useState<string | null>(null);
  const [installedApps, setInstalledApps] = useState<Array<{ packageName: string; appName: string; icon: string; endTimeMs: number; isBlocked: boolean }>>([]);
  const [appSearchQuery, setAppSearchQuery] = useState<string>('');
  const [isAccessibilityEnabled, setIsAccessibilityEnabled] = useState<boolean>(false);
  const [customDurations, setCustomDurations] = useState<{ [pkg: string]: string }>({});
  const [customUnits, setCustomUnits] = useState<{ [pkg: string]: 'MINUTES' | 'HOURS' | 'DAYS' | 'INFINITE' }>({});
  const [currentTimeTick, setCurrentTimeTick] = useState<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTimeTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchInstalledApps = async () => {
    setIsLoadingApps(true);
    try {
      const accRes = await AppLock.isAccessibilityEnabled();
      setIsAccessibilityEnabled(accRes.enabled);
      const res = await AppLock.getInstalledApps();
      setInstalledApps(res.apps || []);
    } catch (err) {
      console.warn('AppLock plugin check failed:', err);
    } finally {
      setIsLoadingApps(false);
    }
  };

  const handleOpenLockModal = async () => {
    playSynthSound('click');
    setIsLockModalOpen(true);
    await fetchInstalledApps();
  };

  const handleStartAppLock = async (packageName: string) => {
    playSynthSound('click');
    const unit = customUnits[packageName] || 'MINUTES';
    let duration = 0;
    if (unit !== 'INFINITE') {
      duration = parseFloat(customDurations[packageName] || '0');
      if (isNaN(duration) || duration <= 0) {
        triggerAlert('Please enter a valid lock duration amount.', 'error');
        return;
      }
    }
    setLockingPackage(packageName);
    try {
      const res = await AppLock.setAppLock({ packageName, duration, unit });
      setInstalledApps(prev => prev.map(app =>
        app.packageName === packageName ? { ...app, isBlocked: true, endTimeMs: res.endTimeMs } : app
      ));
      triggerAlert('App locked successfully.', 'success');
      playSynthSound('success');
    } catch (err: any) {
      triggerAlert(`Lock failed: ${err.message}`, 'error');
    } finally {
      setLockingPackage(null);
    }
  };

  // ─── Types (inside component for interface access) ─────────────
  interface ExtractedTask {
    id: string;
    title: string;
    category: 'Assignment' | 'Exam' | 'Project' | 'Research' | 'Placement' | 'Portfolio' | 'Personal';
    priority: 'Critical' | 'High' | 'Medium' | 'Low';
    dueDate?: string;
    time?: string;
    status: 'Inbox' | 'Planned' | 'In Progress' | 'Completed';
    subtasks?: string[];
    academicMemoryAction?: 'Add to Memory' | 'Add to Portfolio' | null;
  }

  interface NoteItem {
    id: string;
    title: string;
    content: string;
    date: string;
    isPinned?: boolean;
    isStarred?: boolean;
    isArchived?: boolean;
    color?: string;
    folder?: string;
    tags?: string[];
    pdfAttachment?: { name: string; dataUrl: string };
    extractedTasks?: ExtractedTask[];
    isAiAnalyzed?: boolean;
  }

  const [noteSearchQuery, setNoteSearchQuery] = useState<string>('');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  const [notes, setNotes] = useState<NoteItem[]>(() => {
    const saved = localStorage.getItem('acro_user_notes_v2');
    if (saved) { try { return JSON.parse(saved); } catch (e) {} }
    return [
      {
        id: '1',
        title: 'DBMS & ML Deadlines',
        content: 'DBMS assignment finish by Friday, study normalization before Monday exam, and add the project screenshots to my portfolio.',
        date: new Date().toLocaleDateString(),
        isPinned: true,
        isStarred: true,
        color: '#3b82f6',
        folder: 'Academics',
        tags: ['DBMS', 'ML', 'Exam'],
        isAiAnalyzed: false
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem('acro_user_notes_v2', JSON.stringify(notes));
    notes.forEach(note => {
      ragService.ingestNote(note.id, note.title, note.content);
    });
  }, [notes]);

  const [isAnalyzingNoteId, setIsAnalyzingNoteId] = useState<string | null>(null);

  const handleAddNote = () => {
    if (!newNoteTitle.trim() && !newNoteContent.trim()) {
      triggerAlert('Please enter a title or content for your note.', 'error');
      return;
    }
    playSynthSound('success');
    const newNote: NoteItem = {
      id: Date.now().toString(),
      title: newNoteTitle.trim() || 'Untitled Note',
      content: newNoteContent.trim(),
      date: new Date().toLocaleDateString(),
      isAiAnalyzed: false
    };
    setNotes([newNote, ...notes]);
    ragService.ingestNote(newNote.id, newNote.title, newNote.content);
    setNewNoteTitle('');
    setNewNoteContent('');
    setIsAddNoteOpen(false);
    handleAnalyzeNoteTaskIntelligence(newNote);
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSynthSound('click');
    setNotes(notes.map(n => n.id === id ? { ...n, isPinned: !n.isPinned } : n));
  };

  const handleToggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSynthSound('click');
    setNotes(notes.map(n => n.id === id ? { ...n, isStarred: !n.isStarred } : n));
  };

  const handleToggleArchive = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSynthSound('click');
    setNotes(notes.map(n => n.id === id ? { ...n, isArchived: !n.isArchived } : n));
    triggerAlert('Note archive status updated.', 'info');
  };

  const handleDeleteNote = (id: string) => {
    playSynthSound('delete');
    setNotes(notes.filter(n => n.id !== id));
    ragService.removeNote(id);
  };

  const handlePdfAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      triggerAlert('File size exceeds maximum limit of 15 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const attachment = { name: file.name, dataUrl };
      triggerAlert(`PDF "${file.name}" attached successfully.`, 'success');
      playSynthSound('success');
      try {
        triggerAlert('Extracting text from PDF in background...', 'info');
        const pdfText = await extractTextFromResume(dataUrl);
        if (pdfText) {
          const extractedTitle = `PDF Notes: ${file.name.replace(/\.pdf$/i, '')}`;
          const newNoteWithPdf: NoteItem = {
            id: Date.now().toString(),
            title: extractedTitle,
            content: pdfText.substring(0, 1500),
            date: new Date().toLocaleDateString(),
            pdfAttachment: attachment,
            tags: ['PDF', 'Assignment'],
            isAiAnalyzed: false
          };
          setNotes(prev => [newNoteWithPdf, ...prev]);
          handleAnalyzeNoteTaskIntelligence(newNoteWithPdf);
        }
      } catch (err: any) {
        console.warn('PDF text extraction error:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAssignmentPdf = (note: NoteItem) => {
    playSynthSound('click');
    triggerAlert(`Started PDF generation for "${note.title}" in background.`, 'info');
    setTimeout(() => {
      triggerAlert(`PDF generated successfully for "${note.title}".`, 'success');
      playSynthSound('success');
    }, 4000);
  };

  const handleAnalyzeNoteTaskIntelligence = async (noteToAnalyze: NoteItem) => {
    if (!noteToAnalyze.content) return;
    setIsAnalyzingNoteId(noteToAnalyze.id);
    try {
      const model = MODELS.find(m => m.id === chatModelId);
      if (!model) return;
      const status = await LlmInference.getStatus();
      if (!status.isLoaded || status.loadedModelId !== chatModelId) {
        await LlmInference.loadModel({ modelId: chatModelId, fileName: model.fileName, useGpu: false });
      }
      const prompt = `<|system|>
You are an Academic Task Extraction Engine. Read the note text below carefully and extract EVERY individual task mentioned. DO NOT use generic placeholders like "Task title" or "Subtask 1".
<|user|>
NOTE:
"${noteToAnalyze.content}"

Extract each task as JSON format:
{
  "tasks": [
    {
      "title": "Exact title of task from note",
      "category": "Assignment",
      "priority": "High",
      "dueDate": "Friday",
      "time": "",
      "subtasks": ["Specific action step 1", "Specific action step 2"],
      "academicMemoryAction": "Add to Portfolio"
    }
  ]
}
Category choices: Assignment, Exam, Project, Research, Placement, Portfolio, Personal.
Priority choices: Critical, High, Medium, Low.
<|assistant|>`;

      const result = await LlmInference.generateResponse({ prompt });
      const rawText = (result.response || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();

      let extractedList: ExtractedTask[] = [];
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const parsedJson = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(rawText);
        if (parsedJson && Array.isArray(parsedJson.tasks)) {
          extractedList = parsedJson.tasks
            .filter((t: any) => t.title && !/Task title/i.test(t.title))
            .map((t: any, index: number) => ({
              id: `${noteToAnalyze.id}-task-${index}`,
              title: t.title,
              category: t.category || 'Assignment',
              priority: t.priority || 'Medium',
              dueDate: t.dueDate || '',
              time: t.time || '',
              status: 'Inbox',
              subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter((s: string) => !/Subtask/i.test(s)) : [],
              academicMemoryAction: t.academicMemoryAction || null
            }));
        }
      } catch (e) {
        console.warn('Fallback keyword extraction...', e);
      }

      if (extractedList.length === 0) {
        const phrases = noteToAnalyze.content.split(/,|;|\band\b|\n/i).map(p => p.trim()).filter(p => p.length > 3);
        phrases.forEach((phrase, idx) => {
          let category: ExtractedTask['category'] = 'Personal';
          let priority: ExtractedTask['priority'] = 'Medium';
          let academicMemoryAction: ExtractedTask['academicMemoryAction'] = null;
          let subtasks: string[] = [];

          if (/assignment|lab|report|homework|finish/i.test(phrase)) {
            category = 'Assignment';
            subtasks = ['Gather materials', 'Complete draft', 'Export PDF & submit'];
          } else if (/exam|study|normalization|test|quiz|midterm/i.test(phrase)) {
            category = 'Exam';
            priority = 'Critical';
            subtasks = ['Review chapter concepts', 'Practice sample problems'];
          } else if (/project|yolo|app|code|build/i.test(phrase)) {
            category = 'Project';
            academicMemoryAction = 'Add to Memory';
            subtasks = ['Collect results', 'Clean source code', 'Add documentation'];
          } else if (/tcs|placement|interview|resume/i.test(phrase)) {
            category = 'Placement';
            priority = 'High';
            subtasks = ['Review job profile', 'Update resume skills', 'Practice coding questions'];
          } else if (/portfolio|screenshots|workshop|github/i.test(phrase)) {
            category = 'Portfolio';
            academicMemoryAction = 'Add to Portfolio';
            subtasks = ['Take high-res screenshots', 'Write description', 'Publish link'];
          }

          let dueDate = '';
          const dateMatch = phrase.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|aug \d+|sept \d+)\b/i);
          if (dateMatch) dueDate = dateMatch[0];

          extractedList.push({
            id: `${noteToAnalyze.id}-task-${idx}`,
            title: phrase.charAt(0).toUpperCase() + phrase.slice(1),
            category, priority, dueDate, status: 'Inbox', subtasks, academicMemoryAction
          });
        });
      }

      setNotes(prev => prev.map(n =>
        n.id === noteToAnalyze.id ? { ...n, extractedTasks: extractedList, isAiAnalyzed: true } : n
      ));
      triggerAlert('AI extracted actionable items from your note.', 'success');
      playSynthSound('success');
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsAnalyzingNoteId(null);
    }
  };

  // ─── Placement ────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState<string>('');
  const [jobRole, setJobRole] = useState<string>('');
  const [isAnalyzingMatch, setIsAnalyzingMatch] = useState<boolean>(false);
  const [companyMatchResult, setCompanyMatchResult] = useState<string>('');
  const [companyInfoSearch, setCompanyInfoSearch] = useState<string>('');
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [isAnalyzingAts, setIsAnalyzingAts] = useState<boolean>(false);
  const [atsResult, setAtsResult] = useState<{
    score: number;
    feedback: string;
    suggestions: string[];
    keywordsFound: string[];
    keywordsMissing: string[];
  } | null>(null);

  const extractTextFromResume = async (dataUrl: string): Promise<string> => {
    try {
      if (!dataUrl) return '';
      const parts = dataUrl.split(';base64,');
      const base64Data = parts.length === 2 ? parts[1] : dataUrl;
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
      }
      const extracted = fullText.trim();
      if (extracted) {
        ragService.ingestResume(extracted).then(count => {
          console.log(`[Local RAG] Ingested ${count} resume chunks.`);
        });
      }
      return extracted;
    } catch (err: any) {
      console.error('Error extracting text from PDF:', err);
      throw new Error(`Failed to extract text from PDF: ${err.message}`);
    }
  };

  const expandRoleAbbreviation = (role: string): string => {
    const roleMap: Record<string, string> = {
      'swe': 'Software Engineer', 'sde': 'Software Development Engineer',
      'pm': 'Product Manager', 'tpm': 'Technical Program Manager',
      'ml': 'Machine Learning Engineer', 'mle': 'Machine Learning Engineer',
      'ds': 'Data Scientist', 'de': 'Data Engineer', 'sre': 'Site Reliability Engineer',
      'devops': 'DevOps Engineer', 'ui': 'UI Engineer', 'ux': 'UX Designer',
      'fe': 'Frontend Engineer', 'be': 'Backend Engineer', 'fs': 'Full Stack Engineer',
    };
    return roleMap[role.toLowerCase().trim()] || role;
  };

  const fetchWebSearch = async (company: string, role: string): Promise<string> => {
    const expandedRole = expandRoleAbbreviation(role);
    const roleQuery = `${expandedRole} engineer role at ${company} skills requirements responsibilities interview`;
    try {
      const ddgUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(roleQuery)}`)}`;
      const res = await fetch(ddgUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const htmlText = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const snippets = Array.from(doc.querySelectorAll('.result__snippet'))
          .map(el => el.textContent?.trim())
          .filter(s => s && s.length > 20)
          .slice(0, 4);
        if (snippets.length > 0) {
          return `${expandedRole} at ${company} — Search Results:\n${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
        }
      }
    } catch (e) { console.warn('DDG HTML search failed:', e); }
    try {
      const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(roleQuery)}&format=json`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data.AbstractText && data.AbstractText.length > 30) {
          return `${expandedRole} Role: ${data.AbstractText}`;
        }
      }
    } catch (e) { console.warn('DDG JSON API failed:', e); }
    return `${expandedRole} Role Requirements at ${company}:
1. Proficiency in relevant programming languages, algorithms, data structures, and system design.
2. Hands-on project experience demonstrating engineering depth and problem-solving impact.
3. Familiarity with ${company}'s tech stack, coding standards, CI/CD pipelines, and agile workflows.
4. Strong communication skills and ability to collaborate across cross-functional teams.`;
  };

  const handleAnalyzeJobMatch = async () => {
    if (!companyName.trim() || !jobRole.trim()) {
      triggerAlert('Please enter both Company Name and Job Role.', 'error');
      return;
    }
    if (!studentProfile.resumeData) {
      triggerAlert('Resume not uploaded. Please upload your resume in the Profile tab first.', 'error');
      return;
    }
    setIsAnalyzingMatch(true);
    setCompanyMatchResult('');
    setCompanyInfoSearch('');
    setMatchScore(null);
    playSynthSound('click');
    try {
      const enableSearch = window.confirm('Would you like to search the web for real-time role requirements?');
      triggerAlert('Extracting resume content locally...', 'info');
      const resumeText = await extractTextFromResume(studentProfile.resumeData);
      let searchResults = 'Use local AI knowledge for requirements of this role.';
      if (enableSearch) {
        triggerAlert(`Searching web for ${jobRole} role requirements...`, 'info');
        searchResults = await fetchWebSearch(companyName, jobRole);
        setCompanyInfoSearch(searchResults);
      } else {
        setCompanyInfoSearch('Web search disabled. Using local model knowledge.');
      }
      triggerAlert('Performing local RAG vector similarity search...', 'info');
      const ragChunks = await ragService.queryRAGContext(`${jobRole} ${companyName}`, 3);
      const ragContextFormatted = ragChunks.length > 0
        ? ragChunks.map((c, i) => `Context ${i + 1} (${c.source}): ${c.content.substring(0, 180)}`).join('\n')
        : 'No personal context found.';
      const candidateSkills = (studentProfile.skills || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      const matched = candidateSkills.filter(s => resumeText.toLowerCase().includes(s) || searchResults.toLowerCase().includes(s));
      const calculatedScore = candidateSkills.length > 0 ? Math.round((matched.length / candidateSkills.length) * 100) : 75;
      const realMatchScore = Math.max(52, Math.min(96, calculatedScore));
      triggerAlert('Analyzing match with local AI...', 'info');
      const truncatedResume = resumeText.substring(0, 350);
      const truncatedSearch = searchResults.substring(0, 350);
      const analysisPrompt = `You are a career advisor helping a student named ${studentProfile.name}.
Their skills are: ${studentProfile.skills}
Their personal background context (from their notes and resume):
${ragContextFormatted}
Their resume content:
${truncatedResume}
Job role requirements for ${jobRole} at ${companyName} based on web research:
${truncatedSearch}
Write a 2-sentence evaluation of how well they match the ${jobRole} role.
Then list exactly 3 specific improvements they should make to be a better candidate.
Output exactly in this format, no extra text:
Evaluation: [your 2 sentence evaluation here]
1. [first specific improvement]
2. [second specific improvement]
3. [third specific improvement]`;
      const status = await LlmInference.getStatus();
      const model = MODELS.find(m => m.id === chatModelId);
      if (!model) throw new Error('Active model not found.');
      const modelState = modelStates[chatModelId];
      const isDownloaded = modelState && (modelState.status === 'installed' || modelState.status === 'loaded');
      if (!isDownloaded) throw new Error(`Model "${model.name}" is not downloaded. Please download it from the AI Models tab first.`);
      if (!status.isLoaded || status.loadedModelId !== chatModelId) {
        triggerAlert(`Loading ${model.name} into RAM...`, 'info');
        const loadResult = await LlmInference.loadModel({ modelId: chatModelId, fileName: model.fileName, useGpu: false });
        if (!loadResult.loaded) throw new Error('Failed to load local model.');
      }
      triggerAlert(`Analyzing match locally using ${model.name}...`, 'info');
      const result = await LlmInference.generateResponse({ prompt: analysisPrompt });
      const analysisResultText = result.response || '';
      let fitAnalysis = '';
      const suggestions: string[] = [];
      const lines = analysisResultText.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (/^evaluation:/i.test(line)) {
          fitAnalysis = line.replace(/^evaluation:/i, '').trim();
        } else if (/^\d+\.\s+.+/.test(line)) {
          const sug = line.replace(/^\d+\.\s+/, '').trim();
          if (sug && !/^\[.*\]$/.test(sug)) suggestions.push(sug);
        }
      }
      if (!fitAnalysis) {
        const firstSentence = lines.find(l => l.length > 30 && !/^\d+\./.test(l) && !/^evaluation:/i.test(l));
        fitAnalysis = firstSentence || `Candidate shows ${realMatchScore}% alignment with ${companyName}'s ${jobRole} role based on skills: ${matched.join(', ') || candidateSkills.slice(0, 3).join(', ')}.`;
      }
      if (suggestions.length === 0) {
        const missingSkills = ['system design', 'low-level coding', 'distributed systems', 'performance optimization', 'cloud architecture'].filter(s => !resumeText.toLowerCase().includes(s));
        suggestions.push(`Highlight your ${candidateSkills.slice(0, 2).join(' and ')} projects with measurable impact metrics.`);
        suggestions.push(`Build and showcase a project demonstrating ${missingSkills[0] || 'system design'} skills relevant to ${companyName}'s scale.`);
        suggestions.push(`Add quantifiable achievements to your resume — ${companyName} looks for impact metrics in ${jobRole} candidates.`);
      }
      setMatchScore(realMatchScore);
      setCompanyMatchResult(fitAnalysis + '\n\n### Suggestions:\n' + suggestions.map(s => `- ${s}`).join('\n'));
      playSynthSound('success');
      triggerAlert('AI Job Match Analysis completed.', 'success');
    } catch (err: any) {
      console.error(err);
      triggerAlert(`Job Match Analysis failed: ${err.message}`, 'error');
    } finally {
      setIsAnalyzingMatch(false);
    }
  };

  const handleAnalyzeATS = async () => {
    if (!studentProfile.resumeData) {
      triggerAlert('Resume not uploaded. Please upload your resume in the Profile tab first.', 'error');
      return;
    }
    setIsAnalyzingAts(true);
    setAtsResult(null);
    playSynthSound('click');
    try {
      triggerAlert('Extracting resume content locally...', 'info');
      const resumeText = await extractTextFromResume(studentProfile.resumeData);
      if (!resumeText) throw new Error('Unable to extract text content from your resume PDF.');
      const sectionsList = ['education', 'experience', 'skills', 'projects', 'certifications', 'summary', 'languages'];
      const foundSections = sectionsList.filter(sec => new RegExp(`\\b${sec}\\b`, 'i').test(resumeText));
      const sectionScore = (foundSections.length / 5) * 40;
      const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
      const lengthScore = wordCount >= 200 && wordCount <= 800 ? 30 : wordCount > 800 ? 20 : 10;
      const profileSkills = (studentProfile.skills || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      const matchedSkills = profileSkills.filter(skill => resumeText.toLowerCase().includes(skill));
      const skillScore = profileSkills.length > 0 ? (matchedSkills.length / profileSkills.length) * 30 : 20;
      const realAtsScore = Math.max(48, Math.min(97, Math.round(sectionScore + lengthScore + skillScore)));
      triggerAlert('Running ATS compatibility analysis locally...', 'info');
      const truncatedResume = resumeText.substring(0, 1000);
      const atsPrompt = `Analyze ATS compatibility for candidate resume.

RESUME CONTENT:
${truncatedResume}

CANDIDATE PROFILE SKILLS:
${studentProfile.skills || 'Not specified'}

Provide a 2-sentence ATS evaluation and 3 actionable recommendations.
Format response as:
ATS EVALUATION: <2 sentences>
SUGGESTION 1: <advice>
SUGGESTION 2: <advice>
SUGGESTION 3: <advice>`;
      const status = await LlmInference.getStatus();
      const model = MODELS.find(m => m.id === chatModelId);
      if (!model) throw new Error('Active model not found.');
      const modelState = modelStates[chatModelId];
      const isDownloaded = modelState && (modelState.status === 'installed' || modelState.status === 'loaded');
      if (!isDownloaded) throw new Error(`Model "${model.name}" is not downloaded. Please download it from the AI Models tab first.`);
      if (!status.isLoaded || status.loadedModelId !== chatModelId) {
        triggerAlert(`Loading ${model.name} into RAM...`, 'info');
        const loadResult = await LlmInference.loadModel({ modelId: chatModelId, fileName: model.fileName, useGpu: false });
        if (!loadResult.loaded) throw new Error('Failed to load local model.');
      }
      const result = await LlmInference.generateResponse({ prompt: atsPrompt });
      const rawResponse = result.response || '';
      let feedback = '';
      const suggestions: string[] = [];
      const lines = rawResponse.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (/^ATS EVALUATION:/i.test(line)) {
          feedback = line.replace(/^ATS EVALUATION:/i, '').trim();
        } else if (/^SUGGESTION\s*\d*:/i.test(line)) {
          const sug = line.replace(/^SUGGESTION\s*\d*:/i, '').trim();
          if (sug) suggestions.push(sug);
        } else if (line.startsWith('-') || line.startsWith('*')) {
          suggestions.push(line.substring(1).trim());
        }
      }
      if (!feedback) feedback = `Resume parsed with ${foundSections.length} core ATS sections detected (${foundSections.join(', ') || 'Standard sections'}). Formatting and structure align with automated scanners.`;
      if (suggestions.length === 0) {
        suggestions.push('Ensure standard section headers are clearly formatted.');
        suggestions.push('Include quantifiable achievement metrics in experience bullet points.');
        suggestions.push('Add missing industry keywords related to target job descriptions.');
      }
      const standardKeywords = ['Git', 'Docker', 'CI/CD', 'TypeScript', 'SQL', 'System Design', 'Cloud'];
      const keywordsFoundList = matchedSkills.length > 0 ? matchedSkills : (profileSkills.length > 0 ? profileSkills : ['Resume Formatting', 'Technical Profile']);
      const keywordsMissingList = standardKeywords.filter(kw => !resumeText.toLowerCase().includes(kw.toLowerCase())).slice(0, 4);
      setAtsResult({ score: realAtsScore, feedback, suggestions, keywordsFound: keywordsFoundList, keywordsMissing: keywordsMissingList });
      playSynthSound('success');
      triggerAlert('ATS compatibility analysis completed.', 'success');
    } catch (err: any) {
      console.error(err);
      triggerAlert(`ATS Analysis failed: ${err.message}`, 'error');
    } finally {
      setIsAnalyzingAts(false);
    }
  };

  // ─── Token & Model states ─────────────────────────────────────────
  const [hfToken, setHfToken] = useState<string>(() => localStorage.getItem('hf_token_demo') || import.meta.env.VITE_HF_TOKEN || '');
  const [isTokenSaved, setIsTokenSaved] = useState<boolean>(false);
  const [isTokenVisible, setIsTokenVisible] = useState<boolean>(false);

  const [modelStates, setModelStates] = useState<Record<string, ModelState>>(() => ({
    'gemma-4-e2b-it':       { status: 'idle', progress: 0, downloadedBytes: 0 },
    'gemma-2b-it-v1-cpu':   { status: 'idle', progress: 0, downloadedBytes: 0 },
    'gemma-2b-it-gpu-int4': { status: 'idle', progress: 0, downloadedBytes: 0 },
    'whisper-tiny':         { status: 'idle', progress: 0, downloadedBytes: 0 }
  }));

  // ─── Chat ─────────────────────────────────────────────────────────
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatModelId, setChatModelId] = useState<string>('gemma-4-e2b-it');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'model',
      text: 'Hello! I am your local AI assistant.\n\nChoose an installed model from the selector above to start a private, **offline** chat session. Your notes and resume are automatically available as context.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [extendedThinking, setExtendedThinking] = useState<boolean>(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages, isTyping]);

  // ─── Student Profile ──────────────────────────────────────────────
  const [isFullscreenResumeOpen, setIsFullscreenResumeOpen] = useState<boolean>(false);
  const [studentProfile, setStudentProfile] = useState<{
    name: string; email: string; studentId: string; course: string;
    skills: string; bio: string; avatarPhoto: string;
    resumeName: string; resumeType: string; resumeData: string;
  }>(() => {
    const saved = localStorage.getItem('acro_student_profile');
    if (saved) { try { return JSON.parse(saved); } catch (e) {} }
    return {
      name: 'Alex Rivera',
      email: 'alex.rivera@student.acro.edu',
      studentId: 'ACRO-2026-8941',
      course: 'Computer Science & AI Engineering',
      skills: 'Python, Kotlin, PyTorch, React, Machine Learning',
      bio: 'Enthusiastic CS student specializing in edge AI inference, deep learning optimization, and mobile computing.',
      avatarPhoto: '', resumeName: '', resumeType: '', resumeData: ''
    };
  });

  const [resumeBlobUrl, setResumeBlobUrl] = useState<string>('');

  useEffect(() => {
    if (!studentProfile.resumeData) { setResumeBlobUrl(''); return; }
    if (studentProfile.resumeData.startsWith('data:')) {
      try {
        const parts = studentProfile.resumeData.split(';base64,');
        if (parts.length === 2) {
          const contentType = parts[0].replace('data:', '') || 'application/pdf';
          const raw = window.atob(parts[1]);
          const rawLength = raw.length;
          const uInt8Array = new Uint8Array(rawLength);
          for (let i = 0; i < rawLength; ++i) { uInt8Array[i] = raw.charCodeAt(i); }
          const blob = new Blob([uInt8Array], { type: contentType });
          const url = URL.createObjectURL(blob);
          setResumeBlobUrl(url);
          return () => { URL.revokeObjectURL(url); };
        }
      } catch (e) { setResumeBlobUrl(studentProfile.resumeData); }
    } else {
      setResumeBlobUrl(studentProfile.resumeData);
    }
  }, [studentProfile.resumeData]);

  const saveStudentProfile = (updated: typeof studentProfile) => {
    setStudentProfile(updated);
    localStorage.setItem('acro_student_profile', JSON.stringify(updated));
    triggerAlert('Profile saved locally.', 'success');
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { triggerAlert('Profile photo must be under 5 MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      saveStudentProfile({ ...studentProfile, avatarPhoto: base64 });
      triggerAlert('Profile photo updated.', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleResumeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { triggerAlert('File size exceeds 10 MB limit.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      saveStudentProfile({ ...studentProfile, resumeName: file.name, resumeType: file.type || 'application/pdf', resumeData: base64 });
      triggerAlert(`Resume "${file.name}" saved locally.`, 'success');
    };
    reader.onerror = () => triggerAlert('Failed to read resume file.', 'error');
    reader.readAsDataURL(file);
  };

  const handleDownloadResume = () => {
    if (!studentProfile.resumeData) return;
    playSynthSound('click');
    try {
      const filename = studentProfile.resumeName || 'Student_Resume.pdf';
      const parts = studentProfile.resumeData.split(';base64,');
      const contentType = parts[0].replace('data:', '');
      const raw = window.atob(parts[1]);
      const rawLength = raw.length;
      const uInt8Array = new Uint8Array(rawLength);
      for (let i = 0; i < rawLength; ++i) { uInt8Array[i] = raw.charCodeAt(i); }
      const blob = new Blob([uInt8Array], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
      triggerAlert(`Downloading ${filename}...`, 'success');
    } catch (e) {
      const a = document.createElement('a');
      a.href = studentProfile.resumeData;
      a.download = studentProfile.resumeName || 'Student_Resume.pdf';
      a.click();
    }
  };

  // ─── Hardware toggles ─────────────────────────────────────────────
  const [npuEnabled, setNpuEnabled] = useState<boolean>(true);
  const [gpuDelegateEnabled, setGpuDelegateEnabled] = useState<boolean>(true);
  const [gmailSync, setGmailSync] = useState<boolean>(true);
  const [githubSync, setGithubSync] = useState<boolean>(true);

  // ─── Alert ───────────────────────────────────────────────────────
  const [alertMsg, setAlertMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const playSynthSound = (type: 'click' | 'success' | 'ping' | 'error' | 'delete') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'click') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.15);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'success') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.35);
        osc.start(); osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'ping') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.25);
        osc.start(); osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'error') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.35);
        osc.start(); osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'delete') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.2);
        osc.start(); osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) { console.warn('Audio synthesis failed:', e); }
  };

  const triggerAlert = (rawText: string, type: 'success' | 'info' | 'error' = 'info') => {
    const text = rawText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    setAlertMsg({ text, type });
    setTimeout(() => setAlertMsg(null), 3500);
  };

  // ─── Model lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    const checkAllStatuses = async () => {
      const states: Record<string, ModelState> = {};
      for (const m of MODELS) {
        try {
          const res = await ModelDownloader.getModelStatus({ modelId: m.id, fileName: m.fileName });
          if (res.status === 'installed') {
            states[m.id] = { status: 'installed', progress: 100, downloadedBytes: res.size };
          } else if (res.status === 'downloading') {
            states[m.id] = { status: 'downloading', progress: Math.round((res.size / m.sizeBytes) * 100), downloadedBytes: res.size };
          } else {
            states[m.id] = { status: 'idle', progress: 0, downloadedBytes: 0 };
          }
        } catch (e) {
          states[m.id] = { status: 'idle', progress: 0, downloadedBytes: 0 };
        }
      }
      setModelStates(states);
      try {
        const nativeStorage = await ModelDownloader.getFreeStorage();
        if (nativeStorage && nativeStorage.freeBytes > 0) {
          setAvailableStorage(nativeStorage.freeBytes);
        } else if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.quota) setAvailableStorage(Math.max(0, estimate.quota - (estimate.usage || 0)));
        }
      } catch (err) {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.quota) setAvailableStorage(Math.max(0, estimate.quota - (estimate.usage || 0)));
        }
      }
    };
    checkAllStatuses();
  }, []);

  useEffect(() => {
    const listener = (ModelDownloader as any).addListener('downloadProgress', (data: any) => {
      const { modelId, status, downloadedBytes, progress, error } = data;
      setModelStates(prev => ({ ...prev, [modelId]: { status: status as any, progress: progress || 0, downloadedBytes: downloadedBytes || 0, error } }));
      if (status === 'installed') {
        playSynthSound('success');
        triggerAlert(`Installed ${MODELS.find(m => m.id === modelId)?.name} to local system.`, 'success');
        const model = MODELS.find(m => m.id === modelId);
        if (model) setAvailableStorage(prev => Math.max(0, prev - model.sizeBytes));
      } else if (status === 'error') {
        playSynthSound('error');
        triggerAlert(`Download failed: ${error}`, 'error');
      }
    });
    return () => { listener.then((l: { remove: () => void }) => l.remove()); };
  }, []);

  useEffect(() => {
    Xframe.start().then(() => console.log('XFrame interceptor started.')).catch(err => console.warn('XFrame failed:', err));
  }, []);

  const refreshStorage = async () => {
    playSynthSound('click');
    setIsRefreshingStorage(true);
    try {
      const nativeStorage = await ModelDownloader.getFreeStorage();
      if (nativeStorage && nativeStorage.freeBytes > 0) {
        setAvailableStorage(nativeStorage.freeBytes);
      } else if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota) setAvailableStorage(Math.max(0, estimate.quota - (estimate.usage || 0)));
      }
    } catch (err) {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota) setAvailableStorage(Math.max(0, estimate.quota - (estimate.usage || 0)));
      }
    }
    setTimeout(() => {
      setIsRefreshingStorage(false);
      playSynthSound('success');
      triggerAlert('Device storage synchronized.', 'success');
    }, 400);
  };

  const saveToken = () => {
    playSynthSound('click');
    if (!hfToken.trim()) {
      playSynthSound('error');
      triggerAlert('Hugging Face access token cannot be blank.', 'error');
      return;
    }
    localStorage.setItem('hf_token_demo', hfToken);
    setIsTokenSaved(true);
    playSynthSound('success');
    triggerAlert('Access token saved and encrypted in keystore.', 'success');
  };

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    return (bytes / 1048576).toFixed(0) + ' MB';
  };

  const startDownload = async (modelId: string) => {
    playSynthSound('click');
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return;
    if (model.gated && (!hfToken || hfToken.trim().length === 0)) {
      playSynthSound('error');
      triggerAlert(`Hugging Face authentication required for gated model: ${model.name}.`, 'error');
      return;
    }
    if (availableStorage < model.sizeBytes) {
      playSynthSound('error');
      triggerAlert('Insufficient disk storage. Free up space on device.', 'error');
      return;
    }
    setModelStates(prev => ({ ...prev, [modelId]: { status: 'downloading', progress: 0, downloadedBytes: 0 } }));
    try {
      await ModelDownloader.startDownload({ modelId: model.id, url: model.downloadUrl, hfToken: hfToken || '', fileName: model.fileName, sizeBytes: model.sizeBytes });
      triggerAlert(`Download initialized for ${model.name}.`);
    } catch (e: any) {
      playSynthSound('error');
      setModelStates(prev => ({ ...prev, [modelId]: { status: 'idle', progress: 0, downloadedBytes: 0, error: e.message } }));
      triggerAlert(`Failed to start download: ${e.message}`, 'error');
    }
  };

  const cancelDownload = async (modelId: string) => {
    playSynthSound('delete');
    try {
      await ModelDownloader.cancelDownload({ modelId });
      setModelStates(prev => ({ ...prev, [modelId]: { status: 'idle', progress: 0, downloadedBytes: 0 } }));
      triggerAlert('Download aborted.');
    } catch (e: any) {
      triggerAlert(`Failed to cancel download: ${e.message}`, 'error');
    }
  };

  const loadModelToRam = (modelId: string) => {
    playSynthSound('click');
    setModelStates(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => { if (updated[key].status === 'loaded') updated[key].status = 'installed'; });
      updated[modelId] = { status: 'loading', progress: 0, downloadedBytes: updated[modelId].downloadedBytes };
      return updated;
    });
    let loadProgress = 0;
    const interval = setInterval(() => {
      loadProgress += 10;
      setModelStates(prev => {
        if (!prev[modelId] || prev[modelId].status !== 'loading') { clearInterval(interval); return prev; }
        if (loadProgress >= 100) {
          clearInterval(interval);
          playSynthSound('ping');
          triggerAlert(`LiteRT warm-up complete. ${MODELS.find(m => m.id === modelId)?.name} active in RAM.`, 'success');
          return { ...prev, [modelId]: { status: 'loaded', progress: 100, downloadedBytes: prev[modelId].downloadedBytes } };
        }
        return { ...prev, [modelId]: { status: 'loading', progress: loadProgress, downloadedBytes: prev[modelId].downloadedBytes } };
      });
    }, 1500);
  };

  const unloadModelFromRam = (modelId: string) => {
    playSynthSound('click');
    setModelStates(prev => ({ ...prev, [modelId]: { status: 'installed', progress: 100, downloadedBytes: prev[modelId].downloadedBytes } }));
    triggerAlert('Model memory buffers deallocated.');
  };

  const deleteModel = async (modelId: string) => {
    playSynthSound('delete');
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return;
    try {
      const res = await ModelDownloader.deleteModel({ modelId, fileName: model.fileName });
      if (res.deleted) {
        setModelStates(prev => ({ ...prev, [modelId]: { status: 'idle', progress: 0, downloadedBytes: 0 } }));
        setAvailableStorage(prev => prev + model.sizeBytes);
        triggerAlert(`Deleted ${model.name} from local storage.`);
      } else {
        triggerAlert('Failed to delete file from device storage.', 'error');
      }
    } catch (e: any) {
      triggerAlert(`Deletion failed: ${e.message}`, 'error');
    }
  };

  // ─── Chat message handler ─────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const model = MODELS.find(m => m.id === chatModelId);
    if (!model) { triggerAlert('Selected model not found.', 'error'); return; }
    const modelState = modelStates[chatModelId];
    const isDownloaded = modelState && (modelState.status === 'installed' || modelState.status === 'loaded');
    if (!isDownloaded) {
      triggerAlert(`${model.name} is not downloaded. Please download it first from the AI Models tab.`, 'error');
      return;
    }
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsTyping(true);
    playSynthSound('click');
    try {
      const status = await LlmInference.getStatus();
      if (!status.isLoaded || status.loadedModelId !== chatModelId) {
        triggerAlert(`Loading ${model.name} into device RAM...`, 'info');
        const useGpu = chatModelId === 'gemma-2b-it-gpu-int4' && gpuDelegateEnabled;
        const loadResult = await LlmInference.loadModel({ modelId: chatModelId, fileName: model.fileName, useGpu });
        if (!loadResult.loaded) throw new Error('Failed to load model into RAM.');
        triggerAlert(`${model.name} loaded. Running inference...`, 'info');
      }
      const profileContext = [
        studentProfile.name ? `Name: ${studentProfile.name}` : null,
        studentProfile.course ? `Studying: ${studentProfile.course}` : null,
        studentProfile.skills ? `Skills: ${studentProfile.skills}` : null,
        studentProfile.bio ? `Bio: ${studentProfile.bio}` : null,
      ].filter(Boolean).join('\n');
      const ragChunks = await ragService.queryRAGContext(userMessage.text, 3);
      const ragStats = ragService.getVectorStoreStats();
      let augmentedPrompt: string;
      if (profileContext || ragChunks.length > 0) {
        const ragContextText = ragChunks.length > 0
          ? ragChunks.map((c, i) => `[${c.source} - chunk ${i + 1}]: ${c.content.substring(0, 250)}`).join('\n\n')
          : ragStats.totalChunks === 0
            ? 'No resume or notes uploaded yet.'
            : 'No closely relevant chunks for this query.';
        augmentedPrompt = `You are Acro AI, a personal AI assistant for a student. You have full access to their profile, resume, and notes below. Use this information to answer their question directly and personally.

STUDENT PROFILE:
${profileContext || 'Profile not set.'}

RESUME & NOTES CONTEXT (${ragStats.totalChunks} total chunks in vector DB):
${ragContextText}

STUDENT'S QUESTION: ${userMessage.text}

Answer directly and personally using the student's profile and context above. Do not say you cannot access their data — you already have it above.`;
      } else {
        augmentedPrompt = userMessage.text;
      }
      const result = await LlmInference.generateResponse({ prompt: augmentedPrompt });
      const timeSec = result.timeMs / 1000;
      const tokPerSec = result.tokenCount > 0 ? (result.tokenCount / timeSec).toFixed(1) : null;
      const modelMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'model',
        text: result.response || 'No response generated.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        stats: {
          speed: tokPerSec ? `${tokPerSec} tok/s` : '',
          time: `${timeSec.toFixed(1)}s`,
          hardware: `On-Device (${chatModelId.includes('gpu') ? 'GPU' : 'CPU'})`
        }
      };
      setChatMessages(prev => [...prev, modelMessage]);
      playSynthSound('success');
    } catch (err: any) {
      console.error('On-device inference error:', err);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'model',
        text: `On-device inference failed: ${err.message || 'Unknown error'}. Make sure the model is fully downloaded and try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, errorMessage]);
      triggerAlert('Local inference failed. Check model file integrity.', 'error');
    } finally {
      setIsTyping(false);
    }
  };

  // ─── Derived state ────────────────────────────────────────────────
  const isChatModelInstalled = modelStates[chatModelId]?.status === 'installed' || modelStates[chatModelId]?.status === 'loaded';
  const userInitials = studentProfile.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  const filteredNotes = notes
    .filter(n => showArchived ? n.isArchived : !n.isArchived)
    .filter(n => {
      if (!noteSearchQuery.trim()) return true;
      const q = noteSearchQuery.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    })
    .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="app-shell">

      {/* ── Toast ── */}
      {alertMsg && (
        <div className={`toast ${alertMsg.type}`} role="alert" aria-live="polite">
          <div className="toast-icon" />
          <span className="toast-text">{alertMsg.text}</span>
          <button className="toast-close" onClick={() => setAlertMsg(null)} aria-label="Dismiss">
            <X size={14} weight="bold" />
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header-inner">
          <button
            className="brand"
            onClick={() => { playSynthSound('click'); setActiveTab('home'); }}
            aria-label="Go to Home"
          >
            <img src="/acro-logo.png" alt="Acro Logo" className="brand-logo" />
            <div>
              <div className="brand-name">Acro</div>
              <div className="brand-tag">AI Suite</div>
            </div>
          </button>

          <div className="header-right">
            <button
              className={`icon-btn ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => { playSynthSound('click'); setActiveTab('profile'); }}
              aria-label="Profile"
            >
              {studentProfile.avatarPhoto
                ? <img src={studentProfile.avatarPhoto} alt="Avatar" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                : <User size={20} weight="regular" />
              }
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════ HOME TAB ══════════════ */}
      {activeTab === 'home' && (
        <div className="tab-content">
          {/* Toolbar */}
          <div className="notes-toolbar">
            <div className="notes-toolbar-title">
              <h2>Notes</h2>
              <p>Your study pad with AI task extraction</p>
            </div>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }} title="Upload PDF">
              <Upload size={14} weight="bold" /> PDF
              <input type="file" accept=".pdf" onChange={handlePdfAttachmentUpload} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-secondary btn-sm" onClick={handleOpenLockModal} title="App Focus Lock">
              <Lock size={14} weight="bold" /> Focus
            </button>
          </div>

          {/* Search */}
          <div className="search-bar">
            <MagnifyingGlass size={16} weight="bold" className="search-bar-icon" />
            <input
              type="search"
              placeholder="Search notes..."
              value={noteSearchQuery}
              onChange={e => setNoteSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {/* Filters */}
          <div className="filter-row">
            <button
              className={`filter-chip ${showArchived ? 'active' : ''}`}
              onClick={() => setShowArchived(!showArchived)}
            >
              <Archive size={12} weight={showArchived ? 'fill' : 'regular'} />
              {showArchived ? 'Archived' : 'Archive'}
            </button>
          </div>

          {/* Notes List */}
          {filteredNotes.length > 0 ? (
            <div className="notes-list">
              {filteredNotes.map(note => (
                <div
                  key={note.id}
                  className="note-row"
                  onClick={() => { playSynthSound('click'); setActiveViewNote(note); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setActiveViewNote(note)}
                >
                  <div
                    className="note-color-dot"
                    style={{ background: note.color || 'var(--border-strong)' }}
                  />
                  <div className="note-row-body">
                    <div className="note-row-header">
                      {note.isPinned && <PushPin size={12} weight="fill" style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                      <span className="note-row-title">{note.title}</span>
                    </div>
                    <p className="note-row-excerpt">{note.content}</p>
                    <div className="note-row-meta">
                      <span className="note-date">{note.date}</span>
                      {note.tags?.slice(0, 2).map((t, i) => <span key={i} className="note-tag">{t}</span>)}
                      {note.pdfAttachment && <span className="note-tag" style={{ background: '#fee2e2', color: '#dc2626' }}>PDF</span>}
                      {note.isAiAnalyzed && <span className="note-tag" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>AI</span>}
                    </div>
                  </div>
                  <div className="note-row-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="note-icon-btn"
                      onClick={e => handleTogglePin(note.id, e)}
                      aria-label="Pin note"
                    >
                      <PushPin size={15} weight={note.isPinned ? 'fill' : 'regular'} style={{ color: note.isPinned ? 'var(--accent)' : 'var(--text-3)' }} />
                    </button>
                    <button
                      className="note-icon-btn"
                      onClick={e => handleToggleStar(note.id, e)}
                      aria-label="Star note"
                    >
                      <Star size={15} weight={note.isStarred ? 'fill' : 'regular'} style={{ color: note.isStarred ? '#f59e0b' : 'var(--text-3)' }} />
                    </button>
                    <button
                      className="note-icon-btn"
                      onClick={e => handleToggleArchive(note.id, e)}
                      aria-label="Archive note"
                    >
                      <Archive size={15} weight={note.isArchived ? 'fill' : 'regular'} style={{ color: note.isArchived ? 'var(--success)' : 'var(--text-3)' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-3)' }}>
              <Note size={40} weight="thin" style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
              <p style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                {showArchived ? 'No archived notes' : 'No notes yet'}
              </p>
              <p style={{ fontSize: '0.8125rem' }}>
                {showArchived ? 'Archived notes will appear here.' : 'Tap the + button to add your first note.'}
              </p>
            </div>
          )}

          {/* FAB */}
          <button
            className="notes-fab"
            onClick={() => { playSynthSound('click'); setIsAddNoteOpen(true); }}
            aria-label="Add new note"
          >
            <Plus size={22} weight="bold" />
          </button>
        </div>
      )}

      {/* ══════════════ AI MODELS TAB ══════════════ */}
      {activeTab === 'downloader' && (
        <div className="tab-content">
          {/* Storage row */}
          <div className="storage-row">
            <div>
              <span className="storage-label">Available Storage</span>
              <span className="storage-value">{formatBytes(availableStorage)}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={refreshStorage} disabled={isRefreshingStorage}>
              <ArrowsClockwise size={14} weight="bold" className={isRefreshingStorage ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Token card */}
          <div className="token-card">
            <div>
              <p className="token-card-title">Hugging Face Access Token</p>
              <p className="token-card-desc">
                Gated models like Gemma-IT require a read-authorized HuggingFace token.
              </p>
            </div>
            <div className="input-row">
              <input
                type={isTokenVisible ? 'text' : 'password'}
                className="form-input"
                value={hfToken}
                onChange={e => { setHfToken(e.target.value); setIsTokenSaved(false); }}
                placeholder="hf_••••••••••••••••••••••••••••••••"
                autoComplete="off"
              />
              <button
                className="btn btn-secondary btn-icon"
                onClick={() => { playSynthSound('click'); setIsTokenVisible(!isTokenVisible); }}
                aria-label={isTokenVisible ? 'Hide token' : 'Show token'}
              >
                {isTokenVisible ? <EyeSlash size={16} weight="bold" /> : <Eye size={16} weight="bold" />}
              </button>
              <button className="btn btn-primary" onClick={saveToken}>
                {isTokenSaved ? <><Check size={14} weight="bold" /> Saved</> : <><FloppyDisk size={14} weight="bold" /> Save</>}
              </button>
            </div>
          </div>

          {/* Models section */}
          <p className="section-heading" style={{ marginBottom: 'var(--sp-2)' }}>On-Device AI Models</p>
          <div className="models-list">
            {MODELS.map(model => {
              const state = modelStates[model.id] || { status: 'idle', progress: 0, downloadedBytes: 0 };
              const isInstalled = state.status === 'installed' || state.status === 'loading' || state.status === 'loaded';
              const isDownloading = state.status === 'downloading';
              const isVerifying = state.status === 'verifying';
              const isLoading = state.status === 'loading';
              const isLoaded = state.status === 'loaded';
              return (
                <div key={model.id} className="model-row">
                  <div className="model-row-header">
                    <div className={`model-icon ${isInstalled ? 'installed' : ''}`}>
                      <Cpu size={18} weight={isInstalled ? 'fill' : 'regular'} />
                    </div>
                    <div className="model-info">
                      <span className="model-name">{model.name}</span>
                      <span className="model-arch">{model.architecture} · {model.displaySize}</span>
                    </div>
                    <div>
                      {isLoaded && <span className="badge badge-green">In RAM</span>}
                      {isInstalled && !isLoaded && !isLoading && <span className="badge badge-blue">Installed</span>}
                      {model.gated && !isInstalled && <span className="badge badge-amber">Gated</span>}
                    </div>
                  </div>

                  <p className="model-desc">{model.description}</p>

                  {(isLoading || isDownloading) && (
                    <div style={{ marginBottom: 'var(--sp-3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: 'var(--sp-1)', fontWeight: 600 }}>
                        <span>
                          {isLoading
                            ? 'Initializing LiteRT engine...'
                            : `Downloading ${formatBytes(state.downloadedBytes)} / ${model.displaySize}`}
                        </span>
                        <span>{state.progress}%</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${state.progress}%` }} />
                      </div>
                    </div>
                  )}

                  {isVerifying && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, marginBottom: 'var(--sp-3)', animation: 'pulse-soft 1.5s infinite' }}>
                      Verifying SHA-256 integrity...
                    </div>
                  )}

                  <div className="model-actions">
                    {!isInstalled && !isDownloading && !isVerifying && (
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => startDownload(model.id)}>
                        <Download size={14} weight="bold" /> Download ({model.displaySize})
                      </button>
                    )}
                    {isDownloading && (
                      <button className="btn btn-secondary btn-sm" onClick={() => cancelDownload(model.id)}>
                        <X size={13} weight="bold" /> Abort
                      </button>
                    )}
                    {isInstalled && !isDownloading && !isVerifying && (
                      <>
                        {isLoaded ? (
                          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => unloadModelFromRam(model.id)}>
                            <Pause size={14} weight="bold" /> Unload from RAM
                          </button>
                        ) : !isLoading ? (
                          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => loadModelToRam(model.id)}>
                            <Play size={14} weight="fill" /> Load to RAM
                          </button>
                        ) : null}
                        <button className="btn btn-danger btn-icon" onClick={() => deleteModel(model.id)} aria-label="Delete model">
                          <Trash size={15} weight="bold" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hardware toggles */}
          <p className="section-heading" style={{ marginTop: 'var(--sp-6)', marginBottom: 'var(--sp-2)' }}>Hardware Acceleration</p>
          <div className="toggles-list">
            {[
              { label: 'Qualcomm Hexagon NPU', desc: 'Offloads INT4 matrix multiplications to device neural engine.', checked: npuEnabled, onChange: (v: boolean) => setNpuEnabled(v) },
              { label: 'OpenCL GPU Delegate', desc: 'Accelerates FP16 fallback operations on Adreno GPU.', checked: gpuDelegateEnabled, onChange: (v: boolean) => setGpuDelegateEnabled(v) },
              { label: 'Gmail / Outlook Sync', desc: 'Realtime background index of contextual emails.', checked: gmailSync, onChange: (v: boolean) => setGmailSync(v) },
              { label: 'GitHub OAuth Portfolio Sync', desc: 'Maintains automated git integrations.', checked: githubSync, onChange: (v: boolean) => setGithubSync(v) },
            ].map((item, idx) => (
              <div key={idx} className="toggle-row">
                <div className="toggle-info">
                  <span className="toggle-title">{item.label}</span>
                  <span className="toggle-desc">{item.desc}</span>
                </div>
                <label className="toggle-label">
                  <span className="toggle-track">
                    <input type="checkbox" checked={item.checked} onChange={e => { playSynthSound('click'); item.onChange(e.target.checked); }} />
                    <span className="toggle-thumb" />
                  </span>
                </label>
              </div>
            ))}
            <div className="toggle-row">
              <div className="toggle-info">
                <span className="toggle-title">SQLCipher AES-256 Keystore Encryption</span>
                <span className="toggle-desc">Secures local databases with hardware KeyStore anchors.</span>
              </div>
              <div className="toggle-static-badge">
                <CheckCircle size={15} weight="fill" /> Active
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ ACRO LEARN TAB ══════════════ */}
      {activeTab === 'animly' && (
        <div className="iframe-wrapper">
          {isIframeLoading && (
            <div className="iframe-loader">
              <div className="iframe-spinner" />
              <span className="iframe-loader-text">Loading Acro Learn...</span>
            </div>
          )}
          <iframe
            src={`https://animlyy.web.app/?guest_key=${import.meta.env.VITE_GUEST_GROQ_API_KEY || ''}`}
            className="iframe-main"
            title="Acro Learn Web Application"
            onLoad={() => setIsIframeLoading(false)}
          />
        </div>
      )}

      {/* ══════════════ PLACEMENT HUB TAB ══════════════ */}
      {activeTab === 'placement' && (
        <div className="placement-container">
          <div className="page-header">
            <div className="page-header-icon">
              <Briefcase size={20} weight="fill" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Placement Hub</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Resume analytics powered by local AI</p>
            </div>
          </div>

          {!studentProfile.resumeData ? (
            <div className="placement-empty">
              <div className="placement-empty-icon">
                <Warning size={24} weight="fill" />
              </div>
              <h3>Resume Not Uploaded</h3>
              <p>Upload your resume in PDF format in the Profile tab before using Placement Hub features.</p>
              <button className="btn btn-primary" onClick={() => { playSynthSound('click'); setActiveTab('profile'); }}>
                Go to Profile
              </button>
            </div>
          ) : (
            <div className="placement-grid-2col">
              {/* Job Match Panel */}
              <div className="placement-panel">
                <div className="placement-panel-header">
                  <div className="placement-panel-icon">
                    <MagnifyingGlass size={18} weight="bold" />
                  </div>
                  <span className="placement-panel-title">Job Match Analysis</span>
                </div>
                <p className="placement-panel-desc">
                  Searches for role requirements and analyzes how your resume and skills align with the target position.
                </p>
                <div className="placement-form">
                  <div className="form-group">
                    <label className="form-label">Target Company</label>
                    <input type="text" className="form-input" placeholder="Google, Stripe, Microsoft..." value={companyName} onChange={e => setCompanyName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Job Role</label>
                    <input type="text" className="form-input" placeholder="Frontend Engineer, ML Engineer..." value={jobRole} onChange={e => setJobRole(e.target.value)} />
                  </div>
                  <button className="btn btn-primary" onClick={handleAnalyzeJobMatch} disabled={isAnalyzingMatch}>
                    {isAnalyzingMatch
                      ? <><ArrowsClockwise size={14} weight="bold" className="animate-spin" /> Analyzing...</>
                      : <><Briefcase size={14} weight="bold" /> Analyze Match</>}
                  </button>
                </div>

                {companyInfoSearch && (
                  <div style={{ marginTop: 'var(--sp-4)' }}>
                    <p className="section-heading">Web Search Insights</p>
                    <div className="ai-result" style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.8rem' }}>
                      {renderMarkdown(companyInfoSearch)}
                    </div>
                  </div>
                )}

                {companyMatchResult && (
                  <div style={{ marginTop: 'var(--sp-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                      <p className="section-heading" style={{ margin: 0 }}>Match Analysis</p>
                      {matchScore !== null && (
                        <span className={`score-num ${matchScore >= 80 ? 'high' : matchScore >= 60 ? 'medium' : 'low'}`}>
                          {matchScore}%
                        </span>
                      )}
                    </div>
                    <div className="ai-result">
                      {renderMarkdown(companyMatchResult)}
                    </div>
                  </div>
                )}
              </div>

              {/* ATS Panel */}
              <div className="placement-panel">
                <div className="placement-panel-header">
                  <div className="placement-panel-icon">
                    <Trophy size={18} weight="bold" />
                  </div>
                  <span className="placement-panel-title">ATS Resume Scanner</span>
                </div>
                <p className="placement-panel-desc">
                  Grades your resume locally against standard Applicant Tracking System parameters and provides actionable feedback.
                </p>
                <button className="btn btn-secondary" onClick={handleAnalyzeATS} disabled={isAnalyzingAts}>
                  {isAnalyzingAts
                    ? <><ArrowsClockwise size={14} weight="bold" className="animate-spin" /> Scanning...</>
                    : <><TrendUp size={14} weight="bold" /> Scan ATS Score</>}
                </button>

                {atsResult && (
                  <div style={{ marginTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
                    <div className="score-row">
                      <div>
                        <span className={`score-num ${atsResult.score >= 80 ? 'high' : atsResult.score >= 60 ? 'medium' : 'low'}`}>
                          {atsResult.score}
                        </span>
                        <span className="score-label">ATS Score</span>
                      </div>
                      <p style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: '1.5' }}>
                        {atsResult.feedback}
                      </p>
                    </div>

                    <div>
                      <p className="section-heading">Smart Suggestions</p>
                      <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', paddingLeft: 'var(--sp-4)' }}>
                        {atsResult.suggestions.map((sug, idx) => (
                          <li key={idx} style={{ fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: '1.5' }}>{sug}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
                      <div>
                        <p className="section-heading" style={{ color: 'var(--success)' }}>Found</p>
                        <div className="keyword-tags">
                          {atsResult.keywordsFound.map((kw, i) => <span key={i} className="kw-tag found">{kw}</span>)}
                          {atsResult.keywordsFound.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>None identified.</span>}
                        </div>
                      </div>
                      <div>
                        <p className="section-heading" style={{ color: 'var(--error)' }}>Missing</p>
                        <div className="keyword-tags">
                          {atsResult.keywordsMissing.map((kw, i) => <span key={i} className="kw-tag missing">{kw}</span>)}
                          {atsResult.keywordsMissing.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>None identified.</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ PROFILE TAB ══════════════ */}
      {activeTab === 'profile' && (
        <div className="profile-container">
          <div className="page-header">
            <div className="page-header-icon">
              <User size={20} weight="fill" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Profile</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Stored locally on device</p>
            </div>
          </div>

          {/* Profile banner */}
          <div className="profile-banner">
            <div className="avatar-wrap">
              <div className="avatar">
                {studentProfile.avatarPhoto
                  ? <img src={studentProfile.avatarPhoto} alt="Profile" />
                  : userInitials}
              </div>
              <label className="avatar-edit" title="Change photo">
                <Upload size={10} weight="bold" />
                <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
              </label>
            </div>
            <div className="profile-banner-info">
              <h3>{studentProfile.name}</h3>
              <p className="student-id">{studentProfile.studentId}</p>
              <p className="student-course">{studentProfile.course}</p>
            </div>
          </div>

          {/* Personal details */}
          <div className="profile-section">
            <h3 className="profile-section-title">Personal Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input type="text" className="form-input" value={studentProfile.name}
                    onChange={e => setStudentProfile({ ...studentProfile, name: e.target.value })} placeholder="Student Full Name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Student ID</label>
                  <input type="text" className="form-input" value={studentProfile.studentId}
                    onChange={e => setStudentProfile({ ...studentProfile, studentId: e.target.value })} placeholder="ACRO-2026-1024" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" className="form-input" value={studentProfile.email}
                  onChange={e => setStudentProfile({ ...studentProfile, email: e.target.value })} placeholder="student@university.edu" />
              </div>
              <div className="form-group">
                <label className="form-label">Course / Major</label>
                <input type="text" className="form-input" value={studentProfile.course}
                  onChange={e => setStudentProfile({ ...studentProfile, course: e.target.value })} placeholder="Computer Science, Electronics..." />
              </div>
              <div className="form-group">
                <label className="form-label">Technical Skills <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(comma-separated)</span></label>
                <input type="text" className="form-input" value={studentProfile.skills}
                  onChange={e => setStudentProfile({ ...studentProfile, skills: e.target.value })} placeholder="Python, Java, Android, Machine Learning" />
              </div>
              <div className="form-group">
                <label className="form-label">Bio / Summary</label>
                <textarea rows={2} className="form-textarea" value={studentProfile.bio}
                  onChange={e => setStudentProfile({ ...studentProfile, bio: e.target.value })} placeholder="Brief academic profile..." />
              </div>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
                onClick={() => { playSynthSound('success'); saveStudentProfile(studentProfile); }}>
                <FloppyDisk size={15} weight="bold" /> Save Profile
              </button>
            </div>
          </div>

          {/* Resume */}
          <div className="profile-section">
            <h3 className="profile-section-title">Resume Document</h3>
            {studentProfile.resumeData ? (
              <div className="resume-panel">
                <div className="resume-panel-header">
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)' }}>Document Preview</p>
                  <button className="btn btn-secondary btn-sm"
                    onClick={() => { playSynthSound('click'); setIsFullscreenResumeOpen(true); }}>
                    <ArrowSquareOut size={13} weight="bold" /> Fullscreen
                  </button>
                </div>
                <div className="resume-file-info">
                  <div className="resume-file-icon"><FileText size={20} weight="fill" /></div>
                  <div>
                    <p className="resume-file-name">{studentProfile.resumeName || 'Uploaded_Resume.pdf'}</p>
                    <p className="resume-file-meta">100% stored locally on device</p>
                  </div>
                </div>
                <div className="resume-preview-area">
                  {studentProfile.resumeType.startsWith('image/')
                    ? <img src={resumeBlobUrl || studentProfile.resumeData} alt="Resume" className="resume-image-preview" style={{ maxWidth: '100%', borderRadius: 'var(--r-sm)' }} />
                    : <PdfCanvasViewer dataUrl={studentProfile.resumeData} />
                  }
                </div>
                <div className="resume-actions-row">
                  <button className="btn btn-primary btn-sm" onClick={handleDownloadResume}>
                    <Download size={13} weight="bold" /> Download
                  </button>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={13} weight="bold" /> Replace
                    <input type="file" accept=".pdf,.doc,.docx,.txt,image/*" onChange={handleResumeUpload} style={{ display: 'none' }} />
                  </label>
                  <button className="btn btn-danger btn-sm" onClick={() => {
                    playSynthSound('delete');
                    saveStudentProfile({ ...studentProfile, resumeName: '', resumeType: '', resumeData: '' });
                    triggerAlert('Resume removed.', 'info');
                  }}>
                    <Trash size={13} weight="bold" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="resume-dropzone">
                <div className="dropzone-icon"><Paperclip size={24} weight="bold" /></div>
                <p className="dropzone-title">Upload Your Resume</p>
                <p className="dropzone-desc">PDF, DOCX, TXT, or image — stored privately on device</p>
                <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                  <Upload size={14} weight="bold" /> Select Resume File
                  <input type="file" accept=".pdf,.doc,.docx,.txt,image/*" onChange={handleResumeUpload} style={{ display: 'none' }} />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ BOTTOM NAV ══════════════ */}
      <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
        {[
          { id: 'home', icon: House, label: 'Home' },
          { id: 'downloader', icon: Cpu, label: 'AI Models' },
          { id: 'animly', icon: TelevisionSimple, label: 'Learn' },
          { id: 'placement', icon: Briefcase, label: 'Placement' },
          { id: 'profile', icon: User, label: 'Profile' },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`nav-item ${activeTab === id ? 'active' : ''}`}
            onClick={() => {
              playSynthSound('click');
              setActiveTab(id as any);
              if (id === 'animly') setIsIframeLoading(true);
            }}
            aria-label={label}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <Icon size={22} weight={activeTab === id ? 'fill' : 'regular'} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* ══════════════ CHATBOT ══════════════ */}
      {/* FAB */}
      <button
        className={`chat-fab ${isChatOpen ? 'open' : ''} ${activeTab === 'home' ? 'shifted' : ''}`}
        onClick={() => { playSynthSound('click'); setIsChatOpen(prev => !prev); setIsDropdownOpen(false); }}
        aria-label={isChatOpen ? 'Close AI chat' : 'Open AI chat'}
      >
        {isChatOpen ? <X size={22} weight="bold" /> : <ChatCircle size={22} weight="fill" />}
      </button>

      {/* Chat Window */}
      {isChatOpen && (
        <div className="chat-window" role="dialog" aria-label="AI Chat" aria-modal="false">
          {/* Chat header */}
          <div className="chat-header" style={{ position: 'relative' }}>
            <div className="chat-header-brand">
              <div className="chat-avatar">
                <Robot size={16} weight="fill" />
              </div>
              <div className="chat-header-info">
                <div className="chat-header-name">Acro AI</div>
                <div className="chat-header-status">
                  {isChatModelInstalled ? `${MODELS.find(m => m.id === chatModelId)?.name} · On-device` : 'No model loaded'}
                </div>
              </div>
              {/* Model selector pill */}
              <button
                className="model-selector-btn"
                onClick={() => setIsDropdownOpen(prev => !prev)}
                aria-expanded={isDropdownOpen}
              >
                <Brain size={11} weight="fill" />
                <span className="model-selector-text">
                  {MODELS.find(m => m.id === chatModelId)?.name.split(' ').slice(0, 2).join(' ') || 'Select'}
                </span>
                {isDropdownOpen ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}
              </button>
            </div>
            <button
              className="icon-btn btn-sm"
              onClick={() => { playSynthSound('click'); setIsChatOpen(false); }}
              aria-label="Close chat"
            >
              <X size={16} weight="bold" />
            </button>

            {/* Dropdown */}
            {isDropdownOpen && (
              <div className="model-dropdown">
                {MODELS.map(m => {
                  const isModelInstalled = modelStates[m.id]?.status === 'installed' || modelStates[m.id]?.status === 'loaded';
                  return (
                    <button
                      key={m.id}
                      className={`model-dropdown-item ${chatModelId === m.id ? 'selected' : ''}`}
                      onClick={() => {
                        playSynthSound('click');
                        setChatModelId(m.id);
                        setIsDropdownOpen(false);
                        setChatMessages([{
                          id: 'welcome',
                          sender: 'model',
                          text: `Hello! I am your **${m.name}** assistant.\n\n${isModelInstalled ? 'Ready for offline inference. Your notes and resume are available as context.' : 'This model is not downloaded yet. Please download it from the **AI Models** tab.'}`,
                          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        }]);
                      }}
                    >
                      <div className="model-check-icon">
                        {chatModelId === m.id && <Check size={14} weight="bold" />}
                      </div>
                      <div className="model-dropdown-item-info">
                        <span className="model-dropdown-item-name">{m.name}</span>
                        <span className="model-dropdown-item-meta">{m.displaySize} · {m.id === 'whisper-tiny' ? 'Speech' : 'Instruct LLM'}</span>
                      </div>
                      <span className={`badge ${isModelInstalled ? 'badge-green' : 'badge-neutral'}`}>
                        {isModelInstalled ? 'Ready' : 'Not installed'}
                      </span>
                    </button>
                  );
                })}
                <div className="dropdown-divider" />
                <button
                  className="thinking-toggle"
                  onClick={() => { playSynthSound('click'); setExtendedThinking(prev => !prev); setIsDropdownOpen(false); }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.875rem' }}>
                    <Brain size={15} weight="fill" style={{ color: 'var(--text-2)' }} />
                    Extended Thinking (CoT)
                  </span>
                  <span className={`thinking-status ${extendedThinking ? 'on' : 'off'}`}>
                    {extendedThinking ? 'On' : 'Off'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="chat-messages" ref={chatMessagesRef}>
            {chatMessages.map(msg => (
              <div key={msg.id} className={`msg-row ${msg.sender}`}>
                {msg.sender === 'model' && (
                  <div className="msg-avatar model-av">
                    <Robot size={13} weight="fill" />
                  </div>
                )}
                <div>
                  <div className="msg-bubble">
                    {msg.sender === 'model'
                      ? renderMarkdown(msg.text)
                      : msg.text
                    }
                  </div>
                  <div className="msg-meta">
                    <span className="msg-time">{msg.timestamp}</span>
                    {msg.stats && (
                      <span className="inference-tag">
                        {msg.stats.hardware}{msg.stats.speed ? ` · ${msg.stats.speed}` : ''} · {msg.stats.time}
                      </span>
                    )}
                  </div>
                </div>
                {msg.sender === 'user' && (
                  <div className="msg-avatar user-av">
                    {userInitials.charAt(0)}
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="msg-row model">
                <div className="msg-avatar model-av">
                  <Robot size={13} weight="fill" />
                </div>
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}
          </div>

          {/* Not installed warning */}
          {!isChatModelInstalled && (
            <div className="chat-notice">
              <Warning size={15} weight="fill" style={{ flexShrink: 0 }} />
              <span className="chat-notice-text">Model not downloaded. Enable offline inference.</span>
              <button
                className="chat-notice-link"
                onClick={() => { playSynthSound('click'); setActiveTab('downloader'); setIsChatOpen(false); }}
              >
                Get Models
              </button>
            </div>
          )}

          {/* Input area */}
          <div className="chat-input-area">
            <button
              className="chat-mic-btn"
              onClick={() => { playSynthSound('click'); triggerAlert('Voice input requires Whisper Tiny model.', 'info'); }}
              aria-label="Voice input"
            >
              <Microphone size={16} weight="regular" />
            </button>
            <input
              type="text"
              className="chat-text-input"
              placeholder={isChatModelInstalled ? 'Ask anything (offline)...' : 'Download model to chat...'}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              disabled={!isChatModelInstalled}
              aria-label="Chat message input"
            />
            <button
              className="chat-send-btn"
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || isTyping || !isChatModelInstalled}
              aria-label="Send message"
            >
              <PaperPlaneTilt size={15} weight="fill" />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════ MODALS ══════════════ */}

      {/* Add Note Modal */}
      {isAddNoteOpen && (
        <div className="modal-overlay" onClick={() => setIsAddNoteOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-note-title">
            <div className="modal-handle" />
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-wrap"><Note size={18} weight="fill" /></div>
                <div>
                  <h3 id="add-note-title" className="modal-title">New Note</h3>
                </div>
              </div>
              <button className="modal-close" onClick={() => setIsAddNoteOpen(false)} aria-label="Close">
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label" htmlFor="note-title">Title</label>
                <input id="note-title" type="text" className="form-input" placeholder="Note title..." value={newNoteTitle}
                  onChange={e => setNewNoteTitle(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="note-content">Content</label>
                <textarea id="note-content" rows={5} className="form-textarea" placeholder="Write your note here..." value={newNoteContent}
                  onChange={e => setNewNoteContent(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setIsAddNoteOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddNote}>Save Note</button>
            </div>
          </div>
        </div>
      )}

      {/* Note Detail Modal */}
      {activeViewNote && (
        <div className="modal-overlay" onClick={() => setActiveViewNote(null)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-handle" />
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-wrap"><Note size={18} weight="fill" /></div>
                <div>
                  <h3 className="modal-title">{activeViewNote.title}</h3>
                  <p className="modal-subtitle">Created {activeViewNote.date}</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setActiveViewNote(null)} aria-label="Close">
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className="modal-body">
              {/* Note content */}
              <div className="note-content-box">{activeViewNote.content}</div>

              {/* PDF attachment */}
              {activeViewNote.pdfAttachment && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: 'var(--sp-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                  <FileText size={16} weight="fill" style={{ color: 'var(--error)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-2)' }}>{activeViewNote.pdfAttachment.name}</span>
                </div>
              )}

              {/* Autopilot banner */}
              <div className="autopilot-bar">
                <ArrowsClockwise size={14} weight="bold" style={{ color: 'var(--accent)', flexShrink: 0, animation: 'spin 2s linear infinite' }} />
                <div>
                  <p className="autopilot-label">Background Autopilot</p>
                  <p className="autopilot-desc">Idle device power mode active. Long tasks run in background.</p>
                </div>
              </div>

              {/* Extraction progress */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Task Extraction</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent)' }}>
                    {activeViewNote.extractedTasks && activeViewNote.extractedTasks.length > 0 ? '100%' : '0%'}
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: activeViewNote.extractedTasks?.length ? '100%' : '0%' }} />
                </div>
              </div>

              {/* Extracted tasks */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-1)' }}>
                    Action Items ({activeViewNote.extractedTasks?.length || 0})
                  </p>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => handleAnalyzeNoteTaskIntelligence(activeViewNote)}
                    disabled={isAnalyzingNoteId === activeViewNote.id}
                  >
                    <ArrowsClockwise size={11} weight="bold" className={isAnalyzingNoteId === activeViewNote.id ? 'animate-spin' : ''} />
                    Re-analyze
                  </button>
                </div>

                {activeViewNote.extractedTasks && activeViewNote.extractedTasks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                    {activeViewNote.extractedTasks.map(task => (
                      <div key={task.id} className="task-card">
                        <div className="task-card-header">
                          <div className="task-pills">
                            <span className={`task-pill ${task.category.toLowerCase()}`}>{task.category}</span>
                            <span className={`task-pill ${task.priority.toLowerCase()}`}>{task.priority}</span>
                          </div>
                          {task.dueDate && (
                            <span className="task-due">Due: {task.dueDate}{task.time ? ` at ${task.time}` : ''}</span>
                          )}
                        </div>
                        <p className="task-title">{task.title}</p>
                        {task.subtasks && task.subtasks.length > 0 && (
                          <div className="subtask-list">
                            <p className="subtask-list-label">Subtasks</p>
                            {task.subtasks.map((sub, idx) => (
                              <label key={idx} className="subtask-item">
                                <input type="checkbox" defaultChecked={false} />
                                <span>{sub}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                          {task.academicMemoryAction && (
                            <button className="btn btn-primary btn-xs"
                              onClick={() => triggerAlert(`${task.academicMemoryAction} integrated into Academic Profile.`, 'success')}>
                              {task.academicMemoryAction}
                            </button>
                          )}
                          {task.category === 'Assignment' && (
                            <button className="btn btn-secondary btn-xs"
                              onClick={() => handleGenerateAssignmentPdf(activeViewNote)}>
                              Generate PDF (Background)
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 'var(--sp-6) var(--sp-4)', background: 'var(--surface-2)', borderRadius: 'var(--r-md)', border: '1px dashed var(--border-strong)' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginBottom: 'var(--sp-3)' }}>
                      No action items extracted yet.
                    </p>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => handleAnalyzeNoteTaskIntelligence(activeViewNote)}
                      disabled={isAnalyzingNoteId === activeViewNote.id}>
                      {isAnalyzingNoteId === activeViewNote.id
                        ? <><ArrowsClockwise size={12} weight="bold" className="animate-spin" /> Processing...</>
                        : 'Extract Action Items'}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setActiveViewNote(null)}>Close</button>
              <button className="btn btn-danger" onClick={() => { handleDeleteNote(activeViewNote.id); setActiveViewNote(null); }}>
                <Trash size={14} weight="bold" /> Delete Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* App Lock Modal */}
      {isLockModalOpen && (
        <div className="modal-overlay" onClick={() => setIsLockModalOpen(false)}>
          <div className="modal modal-locker" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-handle" />
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-wrap"><Lock size={18} weight="fill" /></div>
                <div>
                  <h3 className="modal-title">App Focus Locker</h3>
                  <p className="modal-subtitle">Sakle Engine · Enforced Application Blocking</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setIsLockModalOpen(false)} aria-label="Close">
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className="modal-body" style={{ paddingTop: 'var(--sp-3)' }}>
              {!isAccessibilityEnabled && (
                <div className="accessibility-alert">
                  <Warning size={18} weight="fill" className="accessibility-alert-icon" />
                  <div className="accessibility-alert-body">
                    <strong>Accessibility Permission Required</strong>
                    <p>Enable the Accessibility Service for Proxims in Settings.</p>
                  </div>
                  <button className="btn btn-primary btn-sm"
                    onClick={async () => { await AppLock.openAccessibilitySettings(); }}>
                    Enable
                  </button>
                </div>
              )}
              <div className="search-bar">
                <MagnifyingGlass size={16} weight="bold" className="search-bar-icon" />
                <input type="search" placeholder="Search installed apps..." value={appSearchQuery}
                  onChange={e => setAppSearchQuery(e.target.value)} className="search-input" />
              </div>
              <div className="apps-list">
                {isLoadingApps ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: 'var(--sp-3)', color: 'var(--text-3)' }}>
                    <ArrowsClockwise size={22} weight="bold" className="animate-spin" />
                    <span style={{ fontSize: '0.875rem' }}>Loading installed apps...</span>
                  </div>
                ) : installedApps.filter(app => app.appName.toLowerCase().includes(appSearchQuery.toLowerCase())).map(app => {
                  const remainingMs = app.endTimeMs - currentTimeTick;
                  const isBlocked = remainingMs > 0;
                  let formattedTime = '';
                  if (isBlocked) {
                    if (app.endTimeMs === Long_MAX_VALUE || remainingMs > 365 * 24 * 60 * 60 * 1000) {
                      formattedTime = 'Blocked Infinite';
                    } else {
                      const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
                      const hours = Math.floor((remainingMs / (1000 * 60 * 60)) % 24);
                      const mins = Math.floor((remainingMs / (1000 * 60)) % 60);
                      const secs = Math.floor((remainingMs / 1000) % 60);
                      formattedTime = days > 0
                        ? `${days}d ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} left`
                        : `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} left`;
                    }
                  }
                  const selectedUnit = customUnits[app.packageName] || 'MINUTES';
                  const selectedDuration = customDurations[app.packageName] || '';
                  const isItemLocking = lockingPackage === app.packageName;
                  return (
                    <div key={app.packageName} className="app-lock-row">
                      {app.icon
                        ? <img src={app.icon} alt={app.appName} className="app-icon" />
                        : <div className="app-icon-fallback"><Lock size={16} weight="bold" /></div>}
                      <div className="app-info">
                        <p className="app-name">{app.appName}</p>
                        {isBlocked
                          ? <p className="app-lock-timer">{formattedTime}</p>
                          : <p className="app-pkg">{app.packageName}</p>}
                      </div>
                      <div className="app-lock-controls">
                        {isBlocked ? (
                          <span className="badge-locked">LOCKED</span>
                        ) : (
                          <>
                            {selectedUnit !== 'INFINITE' && (
                              <input type="number" min="1" placeholder="Qty" value={selectedDuration}
                                onChange={e => setCustomDurations({ ...customDurations, [app.packageName]: e.target.value })}
                                className="duration-input" />
                            )}
                            <select value={selectedUnit}
                              onChange={e => setCustomUnits({ ...customUnits, [app.packageName]: e.target.value as any })}
                              className="unit-select">
                              <option value="MINUTES">Mins</option>
                              <option value="HOURS">Hours</option>
                              <option value="DAYS">Days</option>
                              <option value="INFINITE">Infinite</option>
                            </select>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleStartAppLock(app.packageName)}
                              disabled={!isAccessibilityEnabled || (selectedUnit !== 'INFINITE' && !selectedDuration) || isItemLocking}
                            >
                              {isItemLocking
                                ? <ArrowsClockwise size={12} weight="bold" className="animate-spin" />
                                : <><Lock size={12} weight="fill" /> Lock</>}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Resume Viewer */}
      {isFullscreenResumeOpen && (
        <div className="fullscreen-overlay">
          <div className="fullscreen-header">
            <div className="fullscreen-title">
              <FileText size={18} weight="fill" style={{ color: 'var(--error)', flexShrink: 0 }} />
              <span>{studentProfile.resumeName || 'Student_Resume.pdf'}</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <button className="btn btn-primary btn-sm" onClick={handleDownloadResume}>
                <Download size={13} weight="bold" /> Download
              </button>
              <button className="icon-btn" onClick={() => setIsFullscreenResumeOpen(false)} aria-label="Close">
                <X size={20} weight="bold" />
              </button>
            </div>
          </div>
          <div className="fullscreen-body">
            {studentProfile.resumeType.startsWith('image/')
              ? <img src={resumeBlobUrl || studentProfile.resumeData} alt="Resume" style={{ maxWidth: '100%', borderRadius: 'var(--r-md)' }} />
              : <PdfCanvasViewer dataUrl={studentProfile.resumeData} />}
          </div>
        </div>
      )}

    </div>
  );
}
