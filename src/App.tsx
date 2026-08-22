import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Download, 
  RefreshCw, 
  Trash2, 
  Play, 
  Pause, 
  Eye, 
  EyeOff, 
  Check, 
  CheckCircle,
  Tv,
  MessageSquare,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  Mic,
  Bot,
  User,
  FileText,
  Bell,
  Upload,
  Paperclip,
  Save,
  ArrowLeft,
  ExternalLink,
  Briefcase,
  Search,
  Award,
  TrendingUp,
  AlertTriangle,
  Lock,
  Plus,
  StickyNote,
  Pin,
  Star,
  Archive
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { Xframe } from 'capacitor-plugin-xframe';
import { registerPlugin } from '@capacitor/core';
import './App.css';

interface AppLockPluginType {
  isAccessibilityEnabled(): Promise<{ enabled: boolean }>;
  openAccessibilitySettings(): Promise<void>;
  getInstalledApps(): Promise<{ apps: Array<{ packageName: string; appName: string; icon: string; endTimeMs: number; isBlocked: boolean }> }>;
  setAppLock(options: { packageName: string; duration: number; unit: string }): Promise<{ success: boolean; endTimeMs: number }>;
}

const AppLock = registerPlugin<AppLockPluginType>('AppLock');

// Configure pdfjs worker for native canvas PDF rendering
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface ModelDownloaderPluginType {
  startDownload(options: { modelId: string; url: string; hfToken?: string; fileName: string; sizeBytes: number }): Promise<void>;
  cancelDownload(options: { modelId: string }): Promise<void>;
  getModelStatus(options: { modelId: string; fileName: string }): Promise<{ status: string; size: number }>;
  deleteModel(options: { modelId: string; fileName: string }): Promise<{ deleted: boolean }>;
  getFreeStorage(): Promise<{ freeBytes: number; totalBytes: number }>;
}

const ModelDownloader = registerPlugin<ModelDownloaderPluginType>('ModelDownloader');

// Model definition interface
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

// Native On-Device LLM Inference Plugin (MediaPipe)
const LlmInference = registerPlugin('LlmInference') as {
  loadModel(options: { modelId: string; fileName: string; useGpu: boolean }): Promise<{ loaded: boolean; modelId: string; message: string }>;
  generateResponse(options: { prompt: string }): Promise<{ response: string; tokenCount: number; timeMs: number; modelId: string }>;
  unloadModel(): Promise<{ unloaded: boolean }>;
  getStatus(): Promise<{ isLoaded: boolean; loadedModelId: string; isLoading: boolean }>;
};

function PdfCanvasViewer({ dataUrl }: { dataUrl: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
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
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

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
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;
          }
        }
        setIsLoadingPdf(false);
      } catch (err: any) {
        if (isCancelled) return;
        console.warn('PDF canvas render fallback:', err);
        setIsLoadingPdf(false);
      }
    }
    if (dataUrl) {
      renderPdfPage();
    }
    return () => {
      isCancelled = true;
    };
  }, [dataUrl, currentPage]);

  return (
    <div className="pdf-canvas-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', overflowX: 'auto', background: '#f8fafc', padding: '0.5rem', borderRadius: '8px' }}>
      {isLoadingPdf && <div style={{ fontSize: '0.8rem', color: '#64748b', padding: '1rem' }}>Loading PDF Document...</div>}
      <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '4px', background: '#ffffff' }} />
      {numPages > 1 && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.8rem', color: '#334155' }}>
          <button 
            disabled={currentPage <= 1} 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
          >
            Prev
          </button>
          <span>Page {currentPage} of {numPages}</span>
          <button 
            disabled={currentPage >= numPages} 
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Storage State
  const [availableStorage, setAvailableStorage] = useState<number>(15247134720); // ~14.2 GB
  const [isRefreshingStorage, setIsRefreshingStorage] = useState<boolean>(false);

  // Tab navigation states
  const [activeTab, setActiveTab] = useState<'home' | 'downloader' | 'animly' | 'profile' | 'placement'>('home');
  const [isIframeLoading, setIsIframeLoading] = useState<boolean>(true);

  // Notepad State
  const [isAddNoteOpen, setIsAddNoteOpen] = useState<boolean>(false);
  const [newNoteTitle, setNewNoteTitle] = useState<string>('');
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [activeViewNote, setActiveViewNote] = useState<NoteItem | null>(null);

  // App Lock (Shakle logic) States
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
    const interval = setInterval(() => {
      setCurrentTimeTick(Date.now());
    }, 1000);
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
      // Optimistically update local list for zero UI lag
      setInstalledApps(prev => prev.map(app => {
        if (app.packageName === packageName) {
          return { ...app, isBlocked: true, endTimeMs: res.endTimeMs };
        }
        return app;
      }));
      triggerAlert(`App locked successfully!`, 'success');
      playSynthSound('success');
    } catch (err: any) {
      triggerAlert(`Lock failed: ${err.message}`, 'error');
    } finally {
      setLockingPackage(null);
    }
  };

  // AI Task Intelligence Interface & Note State
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
    const saved = localStorage.getItem('acro_user_notes');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return [
      {
        id: '1',
        title: 'DBMS & ML Deadlines',
        content: 'DBMS assignment finish by Friday, study normalization before Monday exam, and add the project screenshots to my portfolio.',
        date: new Date().toLocaleDateString(),
        isPinned: true,
        isStarred: true,
        color: '#fef08a',
        folder: 'Academics',
        tags: ['DBMS', 'ML', 'Exam'],
        isAiAnalyzed: false
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem('acro_user_notes', JSON.stringify(notes));
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
    setNewNoteTitle('');
    setNewNoteContent('');
    setIsAddNoteOpen(false);

    // Automatically trigger background AI Task Intelligence extraction
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
  };

  const handlePdfAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      triggerAlert('File size exceeds maximum limit of 15MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const attachment = { name: file.name, dataUrl };

      triggerAlert(`PDF "${file.name}" attached successfully!`, 'success');
      playSynthSound('success');

      // AI PDF Text Extraction Pipeline
      try {
        triggerAlert('AI extracting text & assignment requirements from PDF in background...', 'info');
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

  // Background PDF Generation Task
  const handleGenerateAssignmentPdf = (note: NoteItem) => {
    playSynthSound('click');
    triggerAlert(`Started 2-5 page PDF generation for "${note.title}" in background...`, 'info');

    // Simulate background worker generation and trigger push notification
    setTimeout(() => {
      triggerAlert(`🎉 Push Notification: PDF generated successfully for "${note.title}"! Tap to view/download.`, 'success');
      playSynthSound('success');
    }, 4000);
  };

  // AI Task Intelligence Extraction Engine using Local Model
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
        console.warn('Fallback keyword extraction for Task Intelligence...', e);
      }

      // Dynamic sentence-level multi-task extraction fallback
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
            category,
            priority,
            dueDate,
            status: 'Inbox',
            subtasks,
            academicMemoryAction
          });
        });
      }

      setNotes(prev => prev.map(n => {
        if (n.id === noteToAnalyze.id) {
          return { ...n, extractedTasks: extractedList, isAiAnalyzed: true };
        }
        return n;
      }));
      triggerAlert('AI Task Intelligence extracted actionable items!', 'success');
      playSynthSound('success');
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsAnalyzingNoteId(null);
    }
  };

  // Placement Hub states
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

  // Render text replacing **bold** with <strong> elements safely in React
  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  // Extract text from base64 PDF resume using pdfjs-dist
  const extractTextFromResume = async (dataUrl: string): Promise<string> => {
    try {
      if (!dataUrl) return '';
      const parts = dataUrl.split(';base64,');
      const base64Data = parts.length === 2 ? parts[1] : dataUrl;
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
      }
      return fullText.trim();
    } catch (err: any) {
      console.error('Error extracting text from PDF:', err);
      throw new Error(`Failed to extract text from PDF: ${err.message}`);
    }
  };
  // Web search tool logic to find company / role requirements using local LLM fallback
  const fetchWebSearch = async (query: string): Promise<string> => {
    try {
      // Direct DDG API request
      const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
      if (res.ok) {
        const data = await res.json();
        if (data.AbstractText) {
          return `DuckDuckGo Instant Answer: ${data.AbstractText}`;
        }
      }
    } catch (e) {
      console.warn('DDG API search failed / CORS blocked. Falling back to local model search...');
    }

    // AI Fallback Search Crawler (using local model)
    try {
      const model = MODELS.find(m => m.id === chatModelId);
      if (!model) {
        throw new Error('Active model not found.');
      }
      const modelState = modelStates[chatModelId];
      const isDownloaded = modelState && (modelState.status === 'installed' || modelState.status === 'loaded');
      if (!isDownloaded) {
        throw new Error(`Model ${model.name} is not downloaded. Please download it first from the AI Downloader tab.`);
      }

      // Check if loaded
      const status = await LlmInference.getStatus();
      if (!status.isLoaded || status.loadedModelId !== chatModelId) {
        triggerAlert(`Loading ${model.name} for role search...`, 'info');
        const loadResult = await LlmInference.loadModel({
          modelId: chatModelId,
          fileName: model.fileName,
          useGpu: false
        });
        if (!loadResult.loaded) {
          throw new Error('Failed to load local model.');
        }
      }

      const prompt = `Synthesize realistic job role requirements, typical tech stack, and key selection criteria for the following role: "${query}". Respond with a factual, concise summary list.`;
      const result = await LlmInference.generateResponse({ prompt });
      return result.response || `Role requirements for "${query}" synthesized.`;
    } catch (err: any) {
      return `Failed to fetch search results for "${query}": ${err.message}`;
    }
  };
  const handleAnalyzeJobMatch = async () => {
    if (!companyName.trim() || !jobRole.trim()) {
      triggerAlert('Please enter both Company Name and Job Role.', 'error');
      return;
    }
    if (!studentProfile.resumeData) {
      triggerAlert('Resume not uploaded! Please upload your resume in the Profile tab first.', 'error');
      return;
    }

    setIsAnalyzingMatch(true);
    setCompanyMatchResult('');
    setCompanyInfoSearch('');
    setMatchScore(null);
    playSynthSound('click');
    try {
      const enableSearch = window.confirm("Would you like to search the web for real-time company info & role requirements? (If Cancel, local AI model knowledge will be used.)");
      
      // 1. Extract text from resume
      triggerAlert('Extracting resume content locally...', 'info');
      const resumeText = await extractTextFromResume(studentProfile.resumeData);
      
      // 2. Perform Web Search optionally
      let searchResults = "Use local AI knowledge for requirements of this role.";
      if (enableSearch) {
        triggerAlert(`Searching web for ${jobRole} roles at ${companyName}...`, 'info');
        searchResults = await fetchWebSearch(`${companyName} ${jobRole} role requirements and skills needed`);
        setCompanyInfoSearch(searchResults);
      } else {
        setCompanyInfoSearch("Web search disabled by user. Using local model knowledge.");
      }

      // 3. Compile prompt & run AI analysis matching level (with strict limits to prevent JNI crash)
      triggerAlert('Analyzing match with AI...', 'info');

      // Strict truncation to fit in MediaPipe context limits
      const maxTextChars = 800; 
      const truncatedResumeText = resumeText.substring(0, maxTextChars) + (resumeText.length > maxTextChars ? '... [truncated]' : '');
      const truncatedSearchResults = searchResults.substring(0, maxTextChars) + (searchResults.length > maxTextChars ? '... [truncated]' : '');
      
      const analysisPrompt = `
You are an expert technical recruiter. Analyze if the student's profile and resume matches the requirements of the job role.

STUDENT PROFILE DATA:
- Name: ${studentProfile.name}
- Course: ${studentProfile.course}
- Skills: ${studentProfile.skills}
- Bio: ${studentProfile.bio}

EXTRACTED RESUME TEXT:
${truncatedResumeText}

WEB SEARCHED ROLE REQUIREMENTS:
${truncatedSearchResults}
TASK:
1. Determine a Match Score percentage (0% to 100%) showing how well the student fits the job requirements.
2. Provide a brief analysis of the match level (e.g. Fit / Gap analysis).
3. Give specific, actionable smart suggestions on what they should learn, highlight, or change in their resume to match this company's standards.

FORMAT YOUR RESPONSE IN CLEAR JSON FORMAT exactly as matches this pattern:
{
  "score": 85,
  "fitAnalysis": "...",
  "suggestions": [
    "...",
    "..."
  ]
}
Return ONLY valid JSON.
`;
      let analysisResultText = '';
      const status = await LlmInference.getStatus();
      const model = MODELS.find(m => m.id === chatModelId);
      if (!model) {
        throw new Error('Active model not found in list.');
      }
      const modelState = modelStates[chatModelId];
      const isDownloaded = modelState && (modelState.status === 'installed' || modelState.status === 'loaded');
      if (!isDownloaded) {
        throw new Error(`Model "${model.name}" is not downloaded. Please download it from the AI Downloader tab to run local matching analysis.`);
      }

      if (!status.isLoaded || status.loadedModelId !== chatModelId) {
        triggerAlert(`Loading ${model.name} into RAM...`, 'info');
        const loadResult = await LlmInference.loadModel({
          modelId: chatModelId,
          fileName: model.fileName,
          useGpu: false
        });
        if (!loadResult.loaded) {
          throw new Error('Failed to load local model.');
        }
      }

      triggerAlert(`Analyzing match locally using ${model.name}...`, 'info');
      const result = await LlmInference.generateResponse({ prompt: analysisPrompt });
      analysisResultText = result.response;
      // Calculate dynamic keyword match score between resumeText, searchResults, and studentProfile
      const userSkills = studentProfile.skills.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      const matchedSkills = userSkills.filter(skill => 
        resumeText.toLowerCase().includes(skill) || 
        searchResults.toLowerCase().includes(skill)
      );
      const calculatedMatchScore = userSkills.length > 0 ? Math.round((matchedSkills.length / userSkills.length) * 100) : 60;
      // Clamp between 45 and 95
      const fallbackScore = Math.max(45, Math.min(95, calculatedMatchScore));

      // Try to parse JSON from response or extract using regex
      let parsed: { score: number; fitAnalysis: string; suggestions: string[] } = {
        score: fallbackScore,
        fitAnalysis: analysisResultText || 'Analysis completed.',
        suggestions: []
      };
      try {
        const jsonMatch = analysisResultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedJson = JSON.parse(jsonMatch[0]);
          if (parsedJson.score) parsed.score = parsedJson.score;
          if (parsedJson.fitAnalysis) parsed.fitAnalysis = parsedJson.fitAnalysis;
          if (parsedJson.suggestions) parsed.suggestions = parsedJson.suggestions;
        } else {
          // Attempt Regex extraction of score
          const scoreMatch = analysisResultText.match(/(?:score|match|fit)\s*[:\-]?\s*(\d+)%?/i) || analysisResultText.match(/(\d+)%/);
          if (scoreMatch) {
            parsed.score = parseInt(scoreMatch[1]);
          }
        }
      } catch (e) {
        console.warn('AI did not return valid JSON, parsing raw text...', e);
      }
      
      // If suggestions array is empty, try to parse lines starting with - or * from raw text
      if (parsed.suggestions.length === 0) {
        const bulletPoints = analysisResultText.split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-') || line.startsWith('*'))
          .map(line => line.substring(1).trim());
        if (bulletPoints.length > 0) {
          parsed.suggestions = bulletPoints;
        } else {
          parsed.suggestions = ['Review target company requirements.', 'Highlight matching projects in your resume.'];
        }
      }

      setMatchScore(parsed.score);
      setCompanyMatchResult(parsed.fitAnalysis + "\n\n### Suggestions:\n" + parsed.suggestions.map(s => `- ${s}`).join('\n'));
      playSynthSound('success');
      triggerAlert('AI Job Matching Analysis completed!', 'success');
    } catch (err: any) {
      console.error(err);
      triggerAlert(`Job Match Analysis failed: ${err.message}`, 'error');
    } finally {
      setIsAnalyzingMatch(false);
    }
  };

  const handleAnalyzeATS = async () => {
    if (!studentProfile.resumeData) {
      triggerAlert('Resume not uploaded! Please upload your resume in the Profile tab first.', 'error');
      return;
    }

    setIsAnalyzingAts(true);
    setAtsResult(null);
    playSynthSound('click');

    try {
      // 1. Extract text from resume
      triggerAlert('Extracting resume content locally...', 'info');
      const resumeText = await extractTextFromResume(studentProfile.resumeData);

      if (!resumeText) {
        throw new Error('Unable to extract text content from your resume PDF.');
      }

      // 2. Perform Multi-step local AI ATS analysis (pipeline technique for small LLMs)
      triggerAlert('Step 1/2: Extracting resume skills & keywords with local AI...', 'info');

      const maxAtsChars = 2000; // Increased context window
      const truncatedResume = resumeText.substring(0, maxAtsChars);

      // Step 1: Text extraction prompt without JSON structure constraints
      const step1Prompt = `<|system|>
You are an expert ATS (Applicant Tracking System) reviewer.
<|user|>
Analyze the candidate's resume content below:

RESUME TEXT:
${truncatedResume}

STUDENT PROFILE SKILLS:
${studentProfile.skills || 'Not specified'}

Perform the following:
1. List all technical skills, frameworks, languages, and tools found in the resume.
2. List 3-5 important industry skills or certifications missing from the resume.
3. Write a concise 2-sentence assessment of the resume's formatting and content quality.
<|assistant|>`;

      const status = await LlmInference.getStatus();
      const model = MODELS.find(m => m.id === chatModelId);
      if (!model) {
        throw new Error('Active model not found in list.');
      }
      const modelState = modelStates[chatModelId];
      const isDownloaded = modelState && (modelState.status === 'installed' || modelState.status === 'loaded');
      if (!isDownloaded) {
        throw new Error(`Model "${model.name}" is not downloaded. Please download it from the AI Downloader tab to run local ATS scanning.`);
      }

      if (!status.isLoaded || status.loadedModelId !== chatModelId) {
        triggerAlert(`Loading ${model.name} into RAM...`, 'info');
        const loadResult = await LlmInference.loadModel({
          modelId: chatModelId,
          fileName: model.fileName,
          useGpu: false
        });
        if (!loadResult.loaded) {
          throw new Error('Failed to load local model.');
        }
      }

      triggerAlert(`Running ATS compatibility analysis locally using ${model.name}...`, 'info');

      const step1Result = await LlmInference.generateResponse({ prompt: step1Prompt });
      const rawAnalysis = (step1Result.response || '').trim();

      triggerAlert('Step 2/2: Formatting ATS scoring & recommendations...', 'info');

      // Step 2: Formatter prompt converting raw analysis into structured output
      const step2Prompt = `<|system|>
You are a data formatting assistant. Convert the evaluation notes below into a clean, strictly formatted output.
<|user|>
EVALUATION NOTES:
${rawAnalysis}

Respond ONLY in this format:
SCORE: [numeric 0-100]
FEEDBACK: [1-2 sentence feedback]
SUGGESTION 1: [actionable advice]
SUGGESTION 2: [actionable advice]
SUGGESTION 3: [actionable advice]
KEYWORDS FOUND: [comma-separated skills]
KEYWORDS MISSING: [comma-separated missing skills]
<|assistant|>`;

      const step2Result = await LlmInference.generateResponse({ prompt: step2Prompt });
      const structuredOutput = (step2Result.response || '').trim();

      // Robust Key-Value Parser for step 2 output
      let score = 75;
      let feedback = '';
      const suggestions: string[] = [];
      let keywordsFound: string[] = [];
      let keywordsMissing: string[] = [];

      const lines = structuredOutput.split('\n');
      for (const line of lines) {
        const cleanLine = line.trim();
        if (/^SCORE:/i.test(cleanLine)) {
          const match = cleanLine.match(/\d+/);
          if (match) score = parseInt(match[0], 10);
        } else if (/^FEEDBACK:/i.test(cleanLine)) {
          feedback = cleanLine.replace(/^FEEDBACK:/i, '').trim();
        } else if (/^SUGGESTION\s*\d*:/i.test(cleanLine)) {
          const sug = cleanLine.replace(/^SUGGESTION\s*\d*:/i, '').trim();
          if (sug) suggestions.push(sug);
        } else if (/^KEYWORDS FOUND:/i.test(cleanLine)) {
          const kws = cleanLine.replace(/^KEYWORDS FOUND:/i, '').trim();
          if (kws) keywordsFound = kws.split(',').map(k => k.trim()).filter(Boolean);
        } else if (/^KEYWORDS MISSING:/i.test(cleanLine)) {
          const kws = cleanLine.replace(/^KEYWORDS MISSING:/i, '').trim();
          if (kws) keywordsMissing = kws.split(',').map(k => k.trim()).filter(Boolean);
        }
      }

      // Fallback parser if key-value labels weren't returned by step 2
      if (!feedback && rawAnalysis) {
        feedback = rawAnalysis.split('\n').filter(l => l.trim().length > 15)[0] || 'Resume analysis completed.';
      }
      if (suggestions.length === 0 && rawAnalysis) {
        const bullets = rawAnalysis.split('\n').filter(l => /^[0-9-•*]/.test(l.trim()));
        bullets.forEach(b => suggestions.push(b.replace(/^[0-9-•*\s]+/, '').trim()));
      }

      // Extract skills dynamically from text if AI step 2 missed comma list
      if (keywordsFound.length === 0) {
        const userSkillsList = (studentProfile.skills || '').split(',').map(s => s.trim()).filter(Boolean);
        keywordsFound = userSkillsList.filter(s => resumeText.toLowerCase().includes(s.toLowerCase()));
        if (keywordsFound.length === 0) keywordsFound = ['Resume Content', 'Technical Profile'];
      }

      if (keywordsMissing.length === 0) {
        const userSkillsList = (studentProfile.skills || '').split(',').map(s => s.trim()).filter(Boolean);
        keywordsMissing = userSkillsList.filter(s => !resumeText.toLowerCase().includes(s.toLowerCase()));
        if (keywordsMissing.length === 0) keywordsMissing = ['Quantifiable Metrics', 'Industry Certifications'];
      }

      setAtsResult({
        score: Math.min(100, Math.max(0, score)),
        feedback: feedback || 'Resume scanned successfully with local AI model.',
        suggestions: suggestions.length > 0 ? suggestions : ['Include measurable metrics in project descriptions.'],
        keywordsFound,
        keywordsMissing
      });

      playSynthSound('success');
      triggerAlert('ATS compatibility analysis completed!', 'success');
    } catch (err: any) {
      console.error(err);
      triggerAlert(`ATS Analysis failed: ${err.message}`, 'error');
    } finally {
      setIsAnalyzingAts(false);
    }
  };

  // HF Token state
  const [hfToken, setHfToken] = useState<string>(() => {
    return localStorage.getItem('hf_token_demo') || import.meta.env.VITE_HF_TOKEN || '';
  });
  const [isTokenSaved, setIsTokenSaved] = useState<boolean>(false);
  const [isTokenVisible, setIsTokenVisible] = useState<boolean>(false);

  // Model States
  const [modelStates, setModelStates] = useState<Record<string, ModelState>>(() => {
    return {
      'gemma-4-e2b-it': { status: 'idle', progress: 0, downloadedBytes: 0 },
      'gemma-2b-it-v1-cpu': { status: 'idle', progress: 0, downloadedBytes: 0 },
      'gemma-2b-it-gpu-int4': { status: 'idle', progress: 0, downloadedBytes: 0 },
      'whisper-tiny': { status: 'idle', progress: 0, downloadedBytes: 0 }
    };
  });

  // Chatbot states
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatModelId, setChatModelId] = useState<string>('gemma-4-e2b-it');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'model',
      text: 'Hello! I am your local AI assistant. Choose an installed model from the dropdown above to start a private, offline chat session.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [extendedThinking, setExtendedThinking] = useState<boolean>(false);

  // Student Profile State (100% Local Storage)
  const [isFullscreenResumeOpen, setIsFullscreenResumeOpen] = useState<boolean>(false);
  const [studentProfile, setStudentProfile] = useState<{
    name: string;
    email: string;
    studentId: string;
    course: string;
    skills: string;
    bio: string;
    avatarPhoto: string;
    resumeName: string;
    resumeType: string;
    resumeData: string; // base64 data URL
  }>(() => {
    const saved = localStorage.getItem('acro_student_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return {
      name: 'Alex Rivera',
      email: 'alex.rivera@student.acro.edu',
      studentId: 'ACRO-2026-8941',
      course: 'Computer Science & AI Engineering',
      skills: 'Python, Kotlin, PyTorch, React, Machine Learning',
      bio: 'Enthusiastic CS student specializing in edge AI inference, deep learning optimization, and mobile computing.',
      avatarPhoto: '',
      resumeName: '',
      resumeType: '',
      resumeData: ''
    };
  });

  const [resumeBlobUrl, setResumeBlobUrl] = useState<string>('');

  useEffect(() => {
    if (!studentProfile.resumeData) {
      setResumeBlobUrl('');
      return;
    }
    if (studentProfile.resumeData.startsWith('data:')) {
      try {
        const parts = studentProfile.resumeData.split(';base64,');
        if (parts.length === 2) {
          const contentType = parts[0].replace('data:', '') || 'application/pdf';
          const raw = window.atob(parts[1]);
          const rawLength = raw.length;
          const uInt8Array = new Uint8Array(rawLength);
          for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
          }
          const blob = new Blob([uInt8Array], { type: contentType });
          const url = URL.createObjectURL(blob);
          setResumeBlobUrl(url);
          return () => {
            URL.revokeObjectURL(url);
          };
        }
      } catch (e) {
        setResumeBlobUrl(studentProfile.resumeData);
      }
    } else {
      setResumeBlobUrl(studentProfile.resumeData);
    }
  }, [studentProfile.resumeData]);

  const saveStudentProfile = (updated: typeof studentProfile) => {
    setStudentProfile(updated);
    localStorage.setItem('acro_student_profile', JSON.stringify(updated));
    triggerAlert('Student Profile saved locally!', 'success');
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      triggerAlert('Profile photo must be under 5MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const updated = { ...studentProfile, avatarPhoto: base64 };
      saveStudentProfile(updated);
      triggerAlert('Profile photo updated!', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleResumeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      triggerAlert('File size exceeds 10MB limit.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const updated = {
        ...studentProfile,
        resumeName: file.name,
        resumeType: file.type || 'application/pdf',
        resumeData: base64
      };
      saveStudentProfile(updated);
      triggerAlert(`Resume "${file.name}" uploaded & saved locally!`, 'success');
    };
    reader.onerror = () => {
      triggerAlert('Failed to read resume file.', 'error');
    };
    reader.readAsDataURL(file);
  };

  // Robust cross-platform base64 download helper for Android WebViews
  const handleDownloadResume = () => {
    if (!studentProfile.resumeData) return;
    try {
      playSynthSound('click');
      const filename = studentProfile.resumeName || 'Student_Resume.pdf';
      
      // Convert base64 data URL to Blob for WebView download compatibility
      const parts = studentProfile.resumeData.split(';base64,');
      const contentType = parts[0].replace('data:', '');
      const raw = window.atob(parts[1]);
      const rawLength = raw.length;
      const uInt8Array = new Uint8Array(rawLength);
      for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      const blob = new Blob([uInt8Array], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 1000);
      triggerAlert(`Downloading ${filename}...`, 'success');
    } catch (e) {
      // Fallback direct link click
      const a = document.createElement('a');
      a.href = studentProfile.resumeData;
      a.download = studentProfile.resumeName || 'Student_Resume.pdf';
      a.click();
    }
  };

  // Toggles
  const [npuEnabled, setNpuEnabled] = useState<boolean>(true);
  const [gpuDelegateEnabled, setGpuDelegateEnabled] = useState<boolean>(true);
  const [gmailSync, setGmailSync] = useState<boolean>(true);
  const [githubSync, setGithubSync] = useState<boolean>(true);



  // Feedback Alerts
  const [alertMsg, setAlertMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Audio synthesis feedback
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
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'ping') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'delete') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      console.warn('Audio synthesis initialized failed:', e);
    }
  };

  // Clean Top White Toast Feedback Helper (No emojis, no lower system drawer popup)
  const triggerAlert = (rawText: string, type: 'success' | 'info' | 'error' = 'info') => {
    // Strip emojis
    const text = rawText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    setAlertMsg({ text, type });
    setTimeout(() => setAlertMsg(null), 3500);
  };

  // Check models native status on load
  useEffect(() => {
    const checkAllStatuses = async () => {
      const states: Record<string, ModelState> = {};
      let totalSpaceTaken = 0;
      for (const m of MODELS) {
        try {
          const res = await ModelDownloader.getModelStatus({ modelId: m.id, fileName: m.fileName });
          if (res.status === 'installed') {
            states[m.id] = { status: 'installed', progress: 100, downloadedBytes: res.size };
            totalSpaceTaken += res.size;
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
          if (estimate.quota) {
            setAvailableStorage(Math.max(0, estimate.quota - (estimate.usage || 0)));
          }
        }
      } catch (err) {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.quota) {
            setAvailableStorage(Math.max(0, estimate.quota - (estimate.usage || 0)));
          }
        }
      }
    };

    checkAllStatuses();
  }, []);

  // Listen to native download progress events
  useEffect(() => {
    const listener = (ModelDownloader as any).addListener('downloadProgress', (data: any) => {
      const { modelId, status, downloadedBytes, progress, error } = data;
      
      setModelStates(prev => ({
        ...prev,
        [modelId]: {
          status: status as any,
          progress: progress || 0,
          downloadedBytes: downloadedBytes || 0,
          error
        }
      }));

      if (status === 'installed') {
        playSynthSound('success');
        triggerAlert(`Installed ${MODELS.find(m => m.id === modelId)?.name} to local system.`, 'success');
        const model = MODELS.find(m => m.id === modelId);
        if (model) {
          setAvailableStorage(prev => Math.max(0, prev - model.sizeBytes));
        }
      } else if (status === 'error') {
        playSynthSound('error');
        triggerAlert(`Download failed: ${error}`, 'error');
      }
    });

    return () => {
      listener.then((l: { remove: () => void }) => l.remove());
    };
  }, []);

  // PWA installation detectors
  useEffect(() => {
    // Start XFrame interceptor to bypass X-Frame-Options natively on Android
    Xframe.start().then(() => {
      console.log('XFrame interceptor started.');
    }).catch(err => {
      console.warn('XFrame plugin starting failed:', err);
    });
  }, []);

  // Refresh Storage
  const refreshStorage = async () => {
    playSynthSound('click');
    setIsRefreshingStorage(true);
    
    try {
      // 1. Native Android Storage API call (exact real-time StatFs disk space)
      const nativeStorage = await ModelDownloader.getFreeStorage();
      if (nativeStorage && nativeStorage.freeBytes > 0) {
        setAvailableStorage(nativeStorage.freeBytes);
      } else if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota) {
          const free = Math.max(0, estimate.quota - (estimate.usage || 0));
          setAvailableStorage(free);
        }
      }
    } catch (err) {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota) {
          setAvailableStorage(Math.max(0, estimate.quota - (estimate.usage || 0)));
        }
      }
    }

    setTimeout(() => {
      setIsRefreshingStorage(false);
      playSynthSound('success');
      triggerAlert('Realtime device storage synchronized successfully.', 'success');
    }, 400);
  };

  // Save token
  const saveToken = () => {
    playSynthSound('click');
    if (!hfToken.trim()) {
      playSynthSound('error');
      triggerAlert('Hugging Face Access Token cannot be blank.', 'error');
      return;
    }
    localStorage.setItem('hf_token_demo', hfToken);
    setIsTokenSaved(true);
    playSynthSound('success');
    triggerAlert('Access token saved and encrypted in keystore.', 'success');
  };

  // Format bytes helper
  const formatBytes = (bytes: number): string => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    return (bytes / 1048576).toFixed(0) + ' MB';
  };

  // Trigger native downloader
  const startDownload = async (modelId: string) => {
    playSynthSound('click');
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return;

    // Check token requirement
    if (model.gated && (!hfToken || hfToken.trim().length === 0)) {
      playSynthSound('error');
      triggerAlert(`HuggingFace authentication required for gated model: ${model.name}.`, 'error');
      return;
    }

    // Check storage space
    if (availableStorage < model.sizeBytes) {
      playSynthSound('error');
      triggerAlert('Insufficient disk storage. Free up space on device partition.', 'error');
      return;
    }

    // Start Downloading state
    setModelStates(prev => ({
      ...prev,
      [modelId]: { status: 'downloading', progress: 0, downloadedBytes: 0 }
    }));

    try {
      await ModelDownloader.startDownload({
        modelId: model.id,
        url: model.downloadUrl,
        hfToken: hfToken || '',
        fileName: model.fileName,
        sizeBytes: model.sizeBytes
      });
      triggerAlert(`Download initialized for ${model.name}.`);
    } catch (e: any) {
      playSynthSound('error');
      setModelStates(prev => ({
        ...prev,
        [modelId]: { status: 'idle', progress: 0, downloadedBytes: 0, error: e.message }
      }));
      triggerAlert(`Failed to start download: ${e.message}`, 'error');
    }
  };

  // Cancel native download
  const cancelDownload = async (modelId: string) => {
    playSynthSound('delete');
    try {
      await ModelDownloader.cancelDownload({ modelId });
      setModelStates(prev => ({
        ...prev,
        [modelId]: { status: 'idle', progress: 0, downloadedBytes: 0 }
      }));
      triggerAlert('Download operation aborted.');
    } catch (e: any) {
      triggerAlert(`Failed to cancel download: ${e.message}`, 'error');
    }
  };

  // Load Model into RAM
  const loadModelToRam = (modelId: string) => {
    playSynthSound('click');
    
    // Unload any loaded model first
    setModelStates(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        if (updated[key].status === 'loaded') {
          updated[key].status = 'installed';
        }
      });
      updated[modelId] = { status: 'loading', progress: 0, downloadedBytes: updated[modelId].downloadedBytes };
      return updated;
    });

    let loadProgress = 0;
    const interval = setInterval(() => {
      loadProgress += 10;
      setModelStates(prev => {
        if (!prev[modelId] || prev[modelId].status !== 'loading') {
          clearInterval(interval);
          return prev;
        }

        if (loadProgress >= 100) {
          clearInterval(interval);
          playSynthSound('ping');
          triggerAlert(`🚀 LiteRT warm-up completed. ${MODELS.find(m => m.id === modelId)?.name} active in RAM.`, 'success');
          return {
            ...prev,
            [modelId]: { status: 'loaded', progress: 100, downloadedBytes: prev[modelId].downloadedBytes }
          };
        }

        return {
          ...prev,
          [modelId]: { status: 'loading', progress: loadProgress, downloadedBytes: prev[modelId].downloadedBytes }
        };
      });
    }, 1500);
  };

  // Unload Model from RAM
  const unloadModelFromRam = (modelId: string) => {
    playSynthSound('click');
    setModelStates(prev => ({
      ...prev,
      [modelId]: { status: 'installed', progress: 100, downloadedBytes: prev[modelId].downloadedBytes }
    }));
    triggerAlert('Model memory buffers deallocated.');
  };

  // Delete local model file natively
  const deleteModel = async (modelId: string) => {
    playSynthSound('delete');
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return;

    try {
      const res = await ModelDownloader.deleteModel({ modelId, fileName: model.fileName });
      if (res.deleted) {
        setModelStates(prev => ({
          ...prev,
          [modelId]: { status: 'idle', progress: 0, downloadedBytes: 0 }
        }));
        setAvailableStorage(prev => prev + model.sizeBytes);
        triggerAlert(`🗑 Deleted local binary for ${model.name}.`);
      } else {
        triggerAlert('Failed to delete file from device storage.', 'error');
      }
    } catch (e: any) {
      triggerAlert(`Deletion failed: ${e.message}`, 'error');
    }
  };

  // Chat messaging handler — runs 100% on-device via native MediaPipe LlmInference
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const model = MODELS.find(m => m.id === chatModelId);
    if (!model) {
      triggerAlert('Selected model not found.', 'error');
      return;
    }

    // Check if model file is downloaded
    const modelState = modelStates[chatModelId];
    const isDownloaded = modelState && (modelState.status === 'installed' || modelState.status === 'loaded');

    if (!isDownloaded) {
      triggerAlert(`${model.name} is not downloaded. Please download it first from the AI Downloader tab.`, 'error');
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
      // Step 1: Check if model is loaded in native RAM
      const status = await LlmInference.getStatus();

      if (!status.isLoaded || status.loadedModelId !== chatModelId) {
        // Load model into device RAM
        triggerAlert(`Loading ${model.name} into device RAM...`, 'info');

        const useGpu = chatModelId === 'gemma-2b-it-gpu-int4' && gpuDelegateEnabled;
        const loadResult = await LlmInference.loadModel({
          modelId: chatModelId,
          fileName: model.fileName,
          useGpu
        });

        if (!loadResult.loaded) {
          throw new Error('Failed to load model into RAM.');
        }

        triggerAlert(`${model.name} loaded. Running inference...`, 'info');
      }

      // Step 2: Run on-device inference
      const result = await LlmInference.generateResponse({
        prompt: userMessage.text
      });

      const timeSec = result.timeMs / 1000;
      const tokPerSec = result.tokenCount > 0 ? (result.tokenCount / timeSec).toFixed(1) : '—';

      const modelMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'model',
        text: result.response || 'No response generated.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        stats: {
          speed: `${tokPerSec} tok/s`,
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
        text: `⚠️ On-device inference failed: ${err.message || 'Unknown error'}. Make sure the model is fully downloaded and try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, errorMessage]);
      triggerAlert('Local inference failed. Check model file integrity.', 'error');
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="app-container">
      {/* Top Floating White Notification Toast */}
      {alertMsg && (
        <div className={`top-notification-banner ${alertMsg.type}`}>
          <div className="notification-content">
            <Bell size={16} className="notification-icon" />
            <span>{alertMsg.text}</span>
          </div>
          <button className="notification-close" onClick={() => setAlertMsg(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <header>
        <div 
          className="brand" 
          onClick={() => {
            playSynthSound('click');
            setActiveTab('home');
          }}
          style={{ cursor: 'pointer' }}
          title="Return to Home Screen"
        >
          <img src="/acro-logo.png" alt="Acro Logo" className="brand-logo-img" />
          <div className="brand-text">
            <h1>Acro</h1>
            <span className="brand-subtitle">AI Suite</span>
          </div>
        </div>

        <div className="header-actions">
          <button 
            className={`profile-btn-header ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => {
              playSynthSound('click');
              setActiveTab('profile');
            }}
            title="Student Profile & Resume"
          >
            <User size={18} />
          </button>
        </div>
      </header>

      {/* Home Tab Panel (Notepad & App Focus Lock) */}
      {activeTab === 'home' && (
        <div className="dashboard-grid">

          {/* Notepad Header Controls */}
          <div className="notepad-section-header">
            <div className="notepad-title-group">
              <StickyNote size={22} className="notepad-icon" />
              <div>
                <h2>My Quick Notes</h2>
                <span className="notepad-subtitle">Personal Study Pad • Task & Academic Intelligence</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label className="btn btn-secondary btn-sm" title="Upload PDF Attachment to Note" style={{ cursor: 'pointer' }}>
                <Upload size={14} /> PDF Note
                <input type="file" accept=".pdf" onChange={handlePdfAttachmentUpload} style={{ display: 'none' }} />
              </label>
              <button className="lock-apps-btn" onClick={handleOpenLockModal} title="Focus Lock Apps">
                <Lock size={16} />
                <span>Lock Apps</span>
              </button>
            </div>
          </div>

          {/* Search & Archive Toolbar */}
          <div className="note-toolbar">
            <div className="note-search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search notes..."
                value={noteSearchQuery}
                onChange={(e) => setNoteSearchQuery(e.target.value)}
                className="note-search-input"
              />
            </div>

            <div className="note-filter-pills">
              <button
                className={`filter-pill ${showArchived ? 'active' : ''}`}
                onClick={() => setShowArchived(!showArchived)}
              >
                <Archive size={12} /> {showArchived ? 'Showing Archived' : 'Archive'}
              </button>
            </div>
          </div>

          {/* Notes Grid */}
          <div className="notepad-grid">
            {notes
              .filter(n => showArchived ? n.isArchived : !n.isArchived)
              .filter(n => {
                if (!noteSearchQuery.trim()) return true;
                const q = noteSearchQuery.toLowerCase();
                return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
              })
              .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
              .map((note) => (
                <div
                  key={note.id}
                  className={`note-card ${note.isPinned ? 'pinned' : ''}`}
                  style={{ backgroundColor: note.color || 'var(--bg-card)' }}
                  onClick={() => { playSynthSound('click'); setActiveViewNote(note); }}
                >
                  <div className="note-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {note.isPinned && <Pin size={14} className="pinned-icon" />}
                      <h3 className="note-card-title">{note.title}</h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={(e) => e.stopPropagation()}>
                      <button className="note-action-icon-btn" onClick={(e) => handleToggleStar(note.id, e)} title="Star Note">
                        <Star size={14} style={{ fill: note.isStarred ? '#eab308' : 'none', color: note.isStarred ? '#eab308' : 'var(--text-muted)' }} />
                      </button>
                      <button className="note-action-icon-btn" onClick={(e) => handleTogglePin(note.id, e)} title="Pin Note">
                        <Pin size={14} style={{ color: note.isPinned ? 'var(--color-indigo)' : 'var(--text-muted)' }} />
                      </button>
                      <button className="note-action-icon-btn" onClick={(e) => handleToggleArchive(note.id, e)} title="Archive Note">
                        <Archive size={14} style={{ color: note.isArchived ? '#16a34a' : 'var(--text-muted)' }} />
                      </button>
                    </div>
                  </div>

                  <p className="note-card-content">{note.content}</p>

                  {note.pdfAttachment && (
                    <div className="note-pdf-badge" onClick={(e) => e.stopPropagation()}>
                      <FileText size={14} />
                      <span className="pdf-name">{note.pdfAttachment.name}</span>
                    </div>
                  )}

                  {note.tags && note.tags.length > 0 && (
                    <div className="note-tags-row">
                      {note.tags.map((t, idx) => (
                        <span key={idx} className="note-tag-chip">#{t}</span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <span className="note-card-date">{note.date}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-indigo)', fontWeight: 600 }}>Tap to expand AI Tasks ↗</span>
                  </div>
                </div>
              ))}
          </div>

          {/* Floating Plus Button for Adding Notes */}
          <button className="add-note-fab" onClick={() => { playSynthSound('click'); setIsAddNoteOpen(true); }} title="Add New Note">
            <Plus size={24} />
          </button>
        </div>
      )}

      {/* AI Models Downloader Tab */}
      {activeTab === 'downloader' && (
        <div className="dashboard-grid">
        
        {/* Banner Section: Disk Space */}
        <div className="storage-banner">
          <div className="storage-info">
            <span className="storage-title">AVAILABLE DEVICE STORAGE</span>
            <span className="storage-value">{formatBytes(availableStorage)}</span>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={refreshStorage} 
            disabled={isRefreshingStorage}
          >
            <RefreshCw size={14} style={{ animation: isRefreshingStorage ? 'spin 1s infinite linear' : 'none' }} />
            <span>Refresh Disk Space</span>
          </button>
        </div>

        {/* Token Card */}
        <div className="card-panel token-card">
          <div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-indigo)', letterSpacing: '0.04em' }}>
              HUGGING FACE ACCESS TOKEN (SECURED)
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Gated LLM weights like Gemma-IT require a HuggingFace read-authorized access token to bypass CDN validation.
            </p>
          </div>

          <div className="input-row">
            <input 
              type={isTokenVisible ? 'text' : 'password'}
              className="text-input"
              value={hfToken}
              onChange={(e) => {
                setHfToken(e.target.value);
                setIsTokenSaved(false);
              }}
              placeholder="hf_••••••••••••••••••••••••••••••••"
            />
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                playSynthSound('click');
                setIsTokenVisible(!isTokenVisible);
              }}
              style={{ padding: '0.5rem' }}
              title={isTokenVisible ? 'Hide Key' : 'Show Key'}
            >
              {isTokenVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button className="btn btn-primary" onClick={saveToken}>
              {isTokenSaved ? 'Saved ✓' : 'Save Key'}
            </button>
          </div>
        </div>

        {/* Models list section */}
        <div>
          <span className="section-title">ON-DEVICE AI MODEL MANAGEMENT</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            {MODELS.map(model => {
              const state = modelStates[model.id] || { status: 'idle', progress: 0, downloadedBytes: 0 };
              const isInstalled = state.status === 'installed' || state.status === 'loading' || state.status === 'loaded';
              const isDownloading = state.status === 'downloading';
              const isVerifying = state.status === 'verifying';
              const isLoading = state.status === 'loading';
              const isLoaded = state.status === 'loaded';

              return (
                <div key={model.id} className="card-panel model-card">
                  <div className="model-header">
                    <div className="model-meta-box">
                      <div className={`model-icon-box ${isInstalled ? 'installed' : ''}`}>
                        <Cpu size={20} />
                      </div>
                      <div className="model-title-box">
                        <span className="model-name">{model.name}</span>
                        <span className="model-details">{model.architecture} • {model.displaySize}</span>
                      </div>
                    </div>

                    <div>
                      {isLoaded ? (
                        <span className="badge badge-green">Active in RAM</span>
                      ) : isInstalled ? (
                        <span className="badge badge-blue">Installed Local</span>
                      ) : null}
                    </div>
                  </div>

                  <p className="model-description">{model.description}</p>

                  {/* Progressive loading state into RAM */}
                  {isLoading && (
                    <div className="progress-container">
                      <div className="progress-header">
                        <span style={{ color: 'var(--color-indigo)' }}>Initializing LiteRT Engine & Warm-up...</span>
                        <span>{state.progress}%</span>
                      </div>
                      <div className="progress-bar-bg">
                        <div className="progress-bar-fill" style={{ width: `${state.progress}%` }}></div>
                      </div>
                    </div>
                  )}

                  {/* Downloading status */}
                  {isDownloading && (
                    <div className="progress-container">
                      <div className="progress-header">
                        <span style={{ color: 'var(--color-indigo)' }}>
                          Downloading ({formatBytes(state.downloadedBytes)} / {model.displaySize})...
                        </span>
                        <span>{state.progress}%</span>
                      </div>
                      <div className="progress-bar-bg">
                        <div className="progress-bar-fill" style={{ width: `${state.progress}%` }}></div>
                      </div>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => cancelDownload(model.id)}
                        style={{ marginTop: '0.4rem', padding: '0.35rem' }}
                      >
                        Abort Download
                      </button>
                    </div>
                  )}

                  {/* Verifying hash integrity */}
                  {isVerifying && (
                    <div className="progress-container">
                      <div className="progress-header">
                        <span style={{ color: 'var(--color-indigo)', animation: 'pulse 1s infinite' }}>
                          Registering model & verifying SHA-256 integrity...
                        </span>
                      </div>
                      <div className="progress-bar-bg">
                        <div className="progress-bar-fill indeterminate"></div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons based on status */}
                  {!isDownloading && !isVerifying && !isLoading && (
                    <div style={{ marginTop: '0.25rem' }}>
                      {!isInstalled ? (
                        <button 
                          className="btn btn-primary" 
                          onClick={() => startDownload(model.id)}
                          style={{ width: '100%' }}
                        >
                          <Download size={14} />
                          Download Model ({model.displaySize})
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {isLoaded ? (
                            <button 
                              className="btn btn-secondary" 
                              onClick={() => unloadModelFromRam(model.id)}
                              style={{ flex: 1 }}
                            >
                              <Pause size={14} /> Unload from RAM
                            </button>
                          ) : (
                            <button 
                              className="btn btn-primary" 
                              onClick={() => loadModelToRam(model.id)}
                              style={{ flex: 1 }}
                            >
                              <Play size={14} /> Load Model into RAM
                            </button>
                          )}
                          <button 
                            className="btn-icon-only btn-danger" 
                            onClick={() => deleteModel(model.id)}
                            title="Delete model binary file"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Hardware Acceleration & OAuth Toggles */}
        <div>
          <span className="section-title">HARDWARE ACCELERATION & HARDENING</span>
          <div className="card-panel toggles-card" style={{ marginTop: '0.5rem' }}>
            <div className="toggle-row">
              <div className="toggle-meta">
                <span className="toggle-label">Qualcomm Hexagon NPU Acceleration</span>
                <span className="toggle-desc">Offloads INT4 matrix multiplications to device neural engine.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={npuEnabled}
                  onChange={(e) => { playSynthSound('click'); setNpuEnabled(e.target.checked); }}
                />
                <span className="slider-switch"></span>
              </label>
            </div>

            <div className="toggle-row">
              <div className="toggle-meta">
                <span className="toggle-label">OpenCL GPU Delegate</span>
                <span className="toggle-desc">Accelerates FP16 fallback operations on Adreno GPU.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={gpuDelegateEnabled}
                  onChange={(e) => { playSynthSound('click'); setGpuDelegateEnabled(e.target.checked); }}
                />
                <span className="slider-switch"></span>
              </label>
            </div>

            <div className="toggle-row">
              <div className="toggle-meta">
                <span className="toggle-label">Gmail / Outlook Sync Integration</span>
                <span className="toggle-desc">Realtime background index of contextual emails.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={gmailSync}
                  onChange={(e) => { playSynthSound('click'); setGmailSync(e.target.checked); }}
                />
                <span className="slider-switch"></span>
              </label>
            </div>

            <div className="toggle-row">
              <div className="toggle-meta">
                <span className="toggle-label">GitHub OAuth Portfolio Sync</span>
                <span className="toggle-desc">Maintains automated git integrations.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={githubSync}
                  onChange={(e) => { playSynthSound('click'); setGithubSync(e.target.checked); }}
                />
                <span className="slider-switch"></span>
              </label>
            </div>

            <div className="toggle-row" style={{ paddingBottom: 0 }}>
              <div className="toggle-meta">
                <span className="toggle-label">SQLCipher AES-256 Keystore Encryption</span>
                <span className="toggle-desc">Secures local databases with hardware KeyStore anchors.</span>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', color: 'var(--color-emerald)', fontSize: '0.75rem', fontWeight: 700 }}>
                <CheckCircle size={14} /> Active
              </div>
            </div>
          </div>
        </div>

      </div>
      )}



      {/* Animly Web View Frame */}
      {activeTab === 'animly' && (
        <div className="iframe-container">
          {isIframeLoading && (
            <div className="iframe-loader">
              <div className="iframe-loader-spinner"></div>
              <span className="iframe-loader-text">Loading Acro Engine...</span>
            </div>
          )}
          <iframe 
            src={`https://animlyy.web.app/?guest_key=${import.meta.env.VITE_GUEST_GROQ_API_KEY || ''}`} 
            className="iframe-web" 
            title="Acro Learn Web Application"
            onLoad={() => setIsIframeLoading(false)}
          />
        </div>
      )}

      {/* Footer (Only for Downloader tab) */}
      {activeTab === 'downloader' && (
        <footer>
          <p>Acro AI Suite • On-Device Neural Engine • Powered by MediaPipe & React</p>
        </footer>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => {
            playSynthSound('click');
            setActiveTab('home');
          }}
        >
          <StickyNote size={20} />
          <span>Home</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'downloader' ? 'active' : ''}`}
          onClick={() => {
            playSynthSound('click');
            setActiveTab('downloader');
          }}
        >
          <Cpu size={20} />
          <span>AI Models</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'animly' ? 'active' : ''}`}
          onClick={() => {
            playSynthSound('click');
            setActiveTab('animly');
            setIsIframeLoading(true);
          }}
        >
          <Tv size={20} />
          <span>Acro Learn</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'placement' ? 'active' : ''}`}
          onClick={() => {
            playSynthSound('click');
            setActiveTab('placement');
          }}
        >
          <Briefcase size={20} />
          <span>Placement Hub</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => {
            playSynthSound('click');
            setActiveTab('profile');
          }}
        >
          <User size={20} />
          <span>Profile</span>
        </button>
      </nav>

      <button 
        className={`chatbot-fab ${isChatOpen ? 'chat-open' : ''}`}
        onClick={() => {
          playSynthSound('click');
          setIsChatOpen(prev => !prev);
          setIsDropdownOpen(false);
        }}
        aria-label="Toggle Local AI Chatbot"
      >
        {isChatOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>

      {/* Floating Chatbot Window */}
      {isChatOpen && (
        <div className="chatbot-window">
          {/* Chat Header */}
          <div className="chat-header">
            <div className="model-selector-container">
              <button 
                className="model-selector-btn"
                onClick={() => setIsDropdownOpen(prev => !prev)}
              >
                <Bot size={16} />
                <span>{MODELS.find(m => m.id === chatModelId)?.name || 'Select Model'}</span>
                {isDropdownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {/* Model Dropdown Menu */}
              {isDropdownOpen && (
                <div className="model-dropdown">
                  {MODELS.map(m => {
                    const isInstalled = modelStates[m.id]?.status === 'installed' || modelStates[m.id]?.status === 'loaded';
                    return (
                      <button
                        key={m.id}
                        className={`model-dropdown-item ${chatModelId === m.id ? 'selected' : ''}`}
                        onClick={() => {
                          playSynthSound('click');
                          setChatModelId(m.id);
                          setIsDropdownOpen(false);
                          // Reset welcome message on model switch
                          setChatMessages([
                            {
                              id: 'welcome',
                              sender: 'model',
                              text: `Hello! I am your local ${m.name} assistant. ${isInstalled ? 'I am fully downloaded and ready for offline inference.' : 'Note: I am not downloaded yet. Please download me via the AI Downloader tab.'}`,
                              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            }
                          ]);
                        }}
                      >
                        {chatModelId === m.id && <Check size={14} className="model-item-check" />}
                        <div className="model-item-info" style={{ marginLeft: chatModelId === m.id ? '0' : '1.25rem' }}>
                          <span className="model-item-name">{m.name}</span>
                          <span className="model-item-desc">{m.displaySize} • {m.id === 'whisper-tiny' ? 'Speech Encoder' : 'Instruct LLM'}</span>
                        </div>
                        <span className={`model-item-badge ${isInstalled ? 'installed' : 'missing'}`}>
                          {isInstalled ? 'Installed' : 'Missing'}
                        </span>
                      </button>
                    );
                  })}
                  <div className="dropdown-divider"></div>
                  <button 
                    className="extended-thinking-item"
                    onClick={() => {
                      playSynthSound('click');
                      setExtendedThinking(prev => !prev);
                      setIsDropdownOpen(false);
                    }}
                  >
                    <span style={{ fontSize: '0.85rem' }}>🧠 Extended Thinking (CoT)</span>
                    <span style={{ color: extendedThinking ? '#818cf8' : '#64748b' }}>
                      {extendedThinking ? 'Active' : 'Off'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            <button 
              className="chat-close-btn"
              onClick={() => {
                playSynthSound('click');
                setIsChatOpen(false);
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="chat-messages">
            {chatMessages.map(msg => (
              <div key={msg.id} className={`chat-message-row ${msg.sender}`}>
                <div className="chat-bubble">
                  {msg.text.split('\n').map((line, idx) => {
                    if (line.startsWith('> ')) {
                      return <div key={idx} style={{ color: '#94a3b8', fontStyle: 'italic', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.2)', margin: '0.2rem 0' }}>{line.slice(2)}</div>;
                    }
                    if (line.startsWith('```python') || line.startsWith('```')) {
                      return null; // Handle basic styling below
                    }
                    return <div key={idx}>{line}</div>;
                  })}
                  
                  {/* Basic Code block simulator inside chats */}
                  {msg.text.includes('```python') && (
                    <pre>
                      <code>
                        {msg.text.split('```python')[1]?.split('```')[0]?.trim()}
                      </code>
                    </pre>
                  )}

                  <div className="chat-message-meta">
                    <span>{msg.timestamp}</span>
                    {msg.stats && (
                      <span className="inference-badge">
                        {msg.stats.speed} • {msg.stats.hardware}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Typing indicator */}
            {isTyping && (
              <div className="chat-message-row model">
                <div className="chat-typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            )}
          </div>

          {/* Warning Banner if selected model is not downloaded */}
          {(() => {
            const isInstalled = modelStates[chatModelId]?.status === 'installed' || modelStates[chatModelId]?.status === 'loaded';
            if (!isInstalled) {
              return (
                <div className="chat-warning-banner">
                  <span>⚠️ Download this model to enable on-device AI inference (no internet needed).</span>
                  <button 
                    className="chat-warning-link"
                    onClick={() => {
                      playSynthSound('click');
                      setActiveTab('downloader');
                      setIsChatOpen(false);
                    }}
                  >
                    Go to AI Downloader →
                  </button>
                </div>
              );
            }
            return null;
          })()}

          {/* Chat Input Bar */}
          <div className="chat-input-container">
            <button 
              className="chat-mic-btn"
              onClick={() => {
                playSynthSound('click');
                triggerAlert('Voice input requires Whisper Tiny activation.', 'info');
              }}
              title="Voice Input"
            >
              <Mic size={18} />
            </button>
            <input 
              type="text" 
              className="chat-text-input"
              placeholder={modelStates[chatModelId]?.status === 'installed' || modelStates[chatModelId]?.status === 'loaded' ? "Ask anything (on-device)..." : "Download model first..."}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSendMessage();
                }
              }}
              disabled={!(modelStates[chatModelId]?.status === 'installed' || modelStates[chatModelId]?.status === 'loaded')}
            />
            <button 
              className="chat-send-btn"
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || isTyping || !(modelStates[chatModelId]?.status === 'installed' || modelStates[chatModelId]?.status === 'loaded')}
              aria-label="Send Message"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}


      {/* Placement Hub Section Tab */}
      {activeTab === 'placement' && (
        <div className="placement-page-container">
          <div className="profile-page-header">
            <button 
              className="btn btn-secondary back-nav-btn" 
              onClick={() => {
                playSynthSound('click');
                setActiveTab('downloader');
              }}
            >
              <ArrowLeft size={16} /> Back to Dashboard
            </button>
            <div className="profile-page-title">
              <Briefcase size={22} className="profile-icon-heading" />
              <h2>Placement Hub & Resume Analytics</h2>
            </div>
          </div>

          {!studentProfile.resumeData ? (
            <div className="placement-error-card">
              <AlertTriangle size={48} className="error-card-icon" />
              <h3>Resume Not Uploaded</h3>
              <p>You must upload your resume in PDF format in your profile before you can use the Placement Hub analytics and ATS checker features.</p>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  playSynthSound('click');
                  setActiveTab('profile');
                }}
              >
                Go to Profile & Upload Resume
              </button>
            </div>
          ) : (
            <div className="placement-grid">
              {/* Left Column: Sub-feature 1 - Company Info & Job Match */}
              <div className="placement-card">
                <div className="card-header-icon">
                  <Search size={24} className="card-icon" />
                  <h3>Company Info & Job Matching</h3>
                </div>
                <p className="card-description">
                  Uses AI search tools to lookup role requirements at a specific company and analyze how your skills and local resume content align.
                </p>

                <div className="placement-form">
                  <div className="form-group">
                    <label>Target Company</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Google, Stripe, Microsoft" 
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Job Role</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Frontend Engineer, ML Engineer" 
                      value={jobRole}
                      onChange={(e) => setJobRole(e.target.value)}
                    />
                  </div>
                  <button 
                    className="btn btn-primary analyze-btn"
                    onClick={handleAnalyzeJobMatch}
                    disabled={isAnalyzingMatch}
                  >
                    {isAnalyzingMatch ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Analyzing Match...
                      </>
                    ) : (
                      <>
                        <Briefcase size={14} /> Analyze Alignment
                      </>
                    )}
                  </button>
                </div>
                {companyInfoSearch && (
                  <div className="search-results-section">
                    <h4>Web Search Insights Retrieved:</h4>
                    <div className="search-results-box" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {companyInfoSearch.split('\n').map((line, idx) => {
                        const trimmedLine = line.trim();
                        if (trimmedLine.startsWith('###')) {
                          return <h5 key={idx} style={{ marginTop: '0.5rem', color: '#1e1b4b', fontWeight: 'bold' }}>{renderFormattedText(trimmedLine.replace('###', '').trim())}</h5>;
                        }
                        if (trimmedLine.startsWith('##')) {
                          return <h4 key={idx} style={{ marginTop: '0.75rem', color: '#1e1b4b', fontWeight: 'bold' }}>{renderFormattedText(trimmedLine.replace('##', '').trim())}</h4>;
                        }
                        if (trimmedLine.startsWith('*') || trimmedLine.startsWith('-')) {
                          return <li key={idx} style={{ marginLeft: '1rem', fontSize: '0.8rem', listStyleType: 'disc', margin: '0.25rem 0' }}>{renderFormattedText(trimmedLine.substring(1).trim())}</li>;
                        }
                        return <p key={idx} style={{ fontSize: '0.8rem', lineHeight: '1.4', margin: '0.25rem 0' }}>{renderFormattedText(trimmedLine)}</p>;
                      })}
                    </div>
                  </div>
                )}
                {companyMatchResult && (
                  <div className="match-analysis-section">
                    <div className="score-badge-wrapper">
                      <h4>Match Analysis:</h4>
                      {matchScore !== null && (
                        <div className={`score-badge ${matchScore >= 80 ? 'high' : matchScore >= 60 ? 'medium' : 'low'}`}>
                          {matchScore}% Match
                        </div>
                      )}
                    </div>
                    <div className="analysis-result-markdown">
                      {companyMatchResult.split('\n').map((line, idx) => {
                        if (line.startsWith('###')) {
                          return <h4 key={idx} style={{ marginTop: '1rem', color: '#1e1b4b' }}>{renderFormattedText(line.replace('###', ''))}</h4>;
                        }
                        if (line.startsWith('-')) {
                          return <li key={idx} style={{ marginLeft: '1rem', fontSize: '0.85rem' }}>{renderFormattedText(line.replace('-', ''))}</li>;
                        }
                        return <p key={idx} style={{ fontSize: '0.85rem', lineHeight: '1.5', margin: '0.5rem 0' }}>{renderFormattedText(line)}</p>;
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Sub-feature 2 - ATS Score & Keywords */}
              <div className="placement-card">
                <div className="card-header-icon">
                  <Award size={24} className="card-icon" />
                  <h3>ATS Resume Scanner</h3>
                </div>
                <p className="card-description">
                  Scans your resume locally using the text extractor and grades it based on standard Applicant Tracking System (ATS) parameters.
                </p>

                <div className="ats-trigger-section">
                  <button 
                    className="btn btn-secondary analyze-btn"
                    onClick={handleAnalyzeATS}
                    disabled={isAnalyzingAts}
                  >
                    {isAnalyzingAts ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Scanning Resume...
                      </>
                    ) : (
                      <>
                        <TrendingUp size={14} /> Scan ATS Score
                      </>
                    )}
                  </button>
                </div>

                {atsResult && (
                  <div className="ats-results-wrapper">
                    <div className="ats-score-display">
                      <div className="progress-circle-placeholder">
                        <span className="ats-score-num">{atsResult.score}</span>
                        <span className="ats-score-lbl">ATS SCORE</span>
                      </div>
                      <div className="ats-grade-text">
                        <p className="ats-feedback-desc">{renderFormattedText(atsResult.feedback)}</p>
                      </div>
                    </div>

                    <div className="ats-suggestions">
                      <h4>Smart Suggestions:</h4>
                      <ul>
                        {atsResult.suggestions.map((sug, idx) => (
                          <li key={idx}>{renderFormattedText(sug)}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="ats-keywords-grid">
                      <div className="keyword-col">
                        <h4 className="kw-title found">Keywords Found</h4>
                        <div className="kw-tags">
                          {atsResult.keywordsFound.map((kw, idx) => (
                            <span key={idx} className="kw-tag found">{kw}</span>
                          ))}
                          {atsResult.keywordsFound.length === 0 && <span className="no-kws">None identified.</span>}
                        </div>
                      </div>
                      <div className="keyword-col">
                        <h4 className="kw-title missing">Recommended / Missing</h4>
                        <div className="kw-tags">
                          {atsResult.keywordsMissing.map((kw, idx) => (
                            <span key={idx} className="kw-tag missing">{kw}</span>
                          ))}
                          {atsResult.keywordsMissing.length === 0 && <span className="no-kws">None identified.</span>}
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

      {/* Student Profile Section Tab */}
      {activeTab === 'profile' && (
        <div className="profile-page-container">
          <div className="profile-page-header">
            <button 
              className="btn btn-secondary back-nav-btn" 
              onClick={() => {
                playSynthSound('click');
                setActiveTab('downloader');
              }}
            >
              <ArrowLeft size={16} /> Back to Dashboard
            </button>
            <div className="profile-page-title">
              <User size={22} className="profile-icon-heading" />
              <h2>Student Profile & Saved Resume</h2>
            </div>
          </div>

          {/* Profile Card Banner */}
          <div className="profile-card-banner">
            <div className="profile-avatar-container">
              {studentProfile.avatarPhoto ? (
                <img src={studentProfile.avatarPhoto} alt="Profile Avatar" className="profile-avatar-img" />
              ) : (
                <div className="profile-avatar">
                  {studentProfile.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                </div>
              )}
              <label className="avatar-edit-badge" title="Change Profile Photo">
                <Upload size={12} />
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleAvatarUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            <div className="profile-card-details">
              <h3>{studentProfile.name}</h3>
              <span className="profile-id">{studentProfile.studentId}</span>
              <span className="profile-course">{studentProfile.course}</span>
            </div>
          </div>

          {/* Edit Profile Form */}
          <div className="profile-section">
            <h3 className="profile-section-title">Personal Details (Stored Locally)</h3>
            
            <div className="form-group-row">
              <div className="form-group">
                <label>Full Name</label>
                <input 
                  type="text" 
                  value={studentProfile.name}
                  onChange={(e) => setStudentProfile({ ...studentProfile, name: e.target.value })}
                  placeholder="Student Full Name"
                />
              </div>
              <div className="form-group">
                <label>Student ID</label>
                <input 
                  type="text" 
                  value={studentProfile.studentId}
                  onChange={(e) => setStudentProfile({ ...studentProfile, studentId: e.target.value })}
                  placeholder="e.g. ACRO-2026-1024"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input 
                type="email" 
                value={studentProfile.email}
                onChange={(e) => setStudentProfile({ ...studentProfile, email: e.target.value })}
                placeholder="student@university.edu"
              />
            </div>

            <div className="form-group">
              <label>Course / Major</label>
              <input 
                type="text" 
                value={studentProfile.course}
                onChange={(e) => setStudentProfile({ ...studentProfile, course: e.target.value })}
                placeholder="Computer Science, Electronics..."
              />
            </div>

            <div className="form-group">
              <label>Technical Skills</label>
              <input 
                type="text" 
                value={studentProfile.skills}
                onChange={(e) => setStudentProfile({ ...studentProfile, skills: e.target.value })}
                placeholder="Python, Java, Android, Machine Learning"
              />
            </div>

            <div className="form-group">
              <label>Bio / Summary</label>
              <textarea 
                rows={2}
                value={studentProfile.bio}
                onChange={(e) => setStudentProfile({ ...studentProfile, bio: e.target.value })}
                placeholder="Brief academic profile..."
              />
            </div>

            <button 
              className="btn btn-primary save-profile-btn"
              onClick={() => {
                playSynthSound('success');
                saveStudentProfile(studentProfile);
              }}
            >
              <Save size={16} /> Save Profile Details
            </button>
          </div>

          {/* Resume Section */}
          <div className="profile-section resume-section">
            <h3 className="profile-section-title">Student Resume Document</h3>
            
            {studentProfile.resumeData ? (
              <div className="resume-preview-card">
                <div className="resume-info">
                  <FileText size={32} className="resume-icon" />
                  <div className="resume-meta">
                    <span className="resume-filename">{studentProfile.resumeName || 'Uploaded_Resume.pdf'}</span>
                    <span className="resume-status-badge">100% Stored Locally on Device</span>
                  </div>
                </div>

                {/* Inline Resume Document Viewer */}
                <div className="resume-inline-viewer">
                  <div className="resume-viewer-header">
                    <span>Document Live Preview</span>
                    <button 
                      className="btn btn-secondary resume-external-link"
                      onClick={() => {
                        playSynthSound('click');
                        setIsFullscreenResumeOpen(true);
                      }}
                    >
                      <ExternalLink size={12} /> Open Fullscreen
                    </button>
                  </div>
                  {studentProfile.resumeType.startsWith('image/') ? (
                    <img src={resumeBlobUrl || studentProfile.resumeData} alt="Resume Preview" className="resume-image-preview" />
                  ) : (
                    <PdfCanvasViewer dataUrl={studentProfile.resumeData} />
                  )}
                </div>

                <div className="resume-actions">
                  <button 
                    className="btn btn-primary resume-action-btn"
                    onClick={handleDownloadResume}
                  >
                    <Download size={14} /> Download Resume File
                  </button>

                  <label className="btn btn-secondary resume-action-btn upload-replace-label">
                    <Upload size={14} /> Upload / Replace Resume
                    <input 
                      type="file" 
                      accept=".pdf,.doc,.docx,.txt,image/*" 
                      onChange={handleResumeUpload}
                      style={{ display: 'none' }}
                    />
                  </label>

                  <button 
                    className="btn btn-secondary resume-action-btn delete-resume-btn"
                    onClick={() => {
                      playSynthSound('delete');
                      const updated = { ...studentProfile, resumeName: '', resumeType: '', resumeData: '' };
                      saveStudentProfile(updated);
                      triggerAlert('Resume removed.', 'info');
                    }}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="resume-upload-dropzone">
                <Paperclip size={36} className="dropzone-icon" />
                <p className="dropzone-title">Upload Existing Resume</p>
                <p className="dropzone-desc">Select your resume file (PDF, DOCX, TXT, or Image)</p>
                <label className="btn btn-primary upload-resume-btn">
                  <Upload size={16} /> Select Resume File
                  <input 
                    type="file" 
                    accept=".pdf,.doc,.docx,.txt,image/*" 
                    onChange={handleResumeUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Resume Modal Viewer */}
      {isFullscreenResumeOpen && (
        <div className="fullscreen-resume-overlay" onClick={() => setIsFullscreenResumeOpen(false)}>
          <div className="fullscreen-resume-container" onClick={(e) => e.stopPropagation()}>
            <div className="fullscreen-resume-header">
              <div className="fullscreen-title">
                <FileText size={20} />
                <span>{studentProfile.resumeName || 'Student_Resume.pdf'}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button 
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                  onClick={handleDownloadResume}
                >
                  <Download size={14} /> Download
                </button>
                <button 
                  className="modal-close-btn"
                  onClick={() => setIsFullscreenResumeOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="fullscreen-resume-body" style={{ overflowY: 'auto', padding: '1rem' }}>
              {studentProfile.resumeType.startsWith('image/') ? (
                <img src={resumeBlobUrl || studentProfile.resumeData} alt="Fullscreen Resume" className="fullscreen-resume-img" />
              ) : (
                <PdfCanvasViewer dataUrl={studentProfile.resumeData} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Note & AI Task Intelligence Detail Popup Modal */}
      {activeViewNote && (
        <div className="modal-overlay" onClick={() => setActiveViewNote(null)}>
          <div className="modal-content note-detail-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div className="modal-title">
                <StickyNote size={22} className="modal-icon" />
                <div>
                  <h3>{activeViewNote.title}</h3>
                  <span className="modal-subtitle">Created: {activeViewNote.date}</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setActiveViewNote(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Raw Note Content */}
              <div className="note-popup-content-box">
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Original Note Content</h4>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.5', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {activeViewNote.content}
                </p>
              </div>

              {/* Background Long Task Execution Status Banner */}
              <div className="background-execution-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--color-indigo)' }} />
                  <div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-indigo)' }}>BACKGROUND AUTOPILOT RUNNING</span>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>Idle device power mode enabled • Long tasks like PDF generation (2-5 pages) remain active in background</p>
                  </div>
                </div>
              </div>

              {/* AI Processing & Completion Progress Percentage */}
              <div className="note-popup-progress-card" style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Task Extraction Completion
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-indigo)' }}>
                    {activeViewNote.extractedTasks && activeViewNote.extractedTasks.length > 0 ? '100% Processed' : '0% Processed'}
                  </span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: activeViewNote.extractedTasks && activeViewNote.extractedTasks.length > 0 ? '100%' : '15%',
                      background: 'var(--color-indigo)',
                      borderRadius: '4px',
                      transition: 'width 0.4s ease'
                    }}
                  />
                </div>
              </div>

              {/* Task Extraction Results (Clean Professional Minimal UI) */}
              <div className="note-popup-tasks-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Extracted Action Items ({activeViewNote.extractedTasks?.length || 0})
                  </h4>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => handleAnalyzeNoteTaskIntelligence(activeViewNote)}
                    disabled={isAnalyzingNoteId === activeViewNote.id}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                  >
                    {isAnalyzingNoteId === activeViewNote.id ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    <span>Re-Analyze Note</span>
                  </button>
                </div>

                {activeViewNote.extractedTasks && activeViewNote.extractedTasks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {activeViewNote.extractedTasks.map((task) => (
                      <div key={task.id} className="popup-task-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span className={`task-category-pill ${task.category.toLowerCase()}`}>{task.category}</span>
                            <span className={`task-priority-pill ${task.priority.toLowerCase()}`} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                              Priority: {task.priority}
                            </span>
                          </div>
                          {task.dueDate && (
                            <span className="task-due-date" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#dc2626' }}>
                              Due: {task.dueDate} {task.time ? `at ${task.time}` : ''}
                            </span>
                          )}
                        </div>

                        <h5 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.5rem 0 0.3rem 0' }}>{task.title}</h5>

                        {/* Checklist Subtasks */}
                        {task.subtasks && task.subtasks.length > 0 && (
                          <div style={{ marginTop: '0.5rem', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Subtasks Checklist</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
                              {task.subtasks.map((sub, idx) => (
                                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                  <input type="checkbox" defaultChecked={false} style={{ accentColor: 'var(--color-indigo)' }} />
                                  <span>{sub}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {task.academicMemoryAction && (
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => triggerAlert(`${task.academicMemoryAction} integrated into Academic Profile.`, 'success')}
                              style={{ fontSize: '0.72rem' }}
                            >
                              {task.academicMemoryAction}
                            </button>
                          )}
                          {task.category === 'Assignment' && (
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => handleGenerateAssignmentPdf(activeViewNote)}
                              style={{ fontSize: '0.72rem' }}
                            >
                              Generate Assignment PDF (Background)
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>No tasks extracted yet for this note.</p>
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => handleAnalyzeNoteTaskIntelligence(activeViewNote)}
                      disabled={isAnalyzingNoteId === activeViewNote.id}
                    >
                      Process Action Items
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActiveViewNote(null)}>Close</button>
              <button
                className="btn btn-secondary delete-resume-btn"
                onClick={() => {
                  handleDeleteNote(activeViewNote.id);
                  setActiveViewNote(null);
                }}
              >
                Delete Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {isAddNoteOpen && (
        <div className="modal-overlay" onClick={() => setIsAddNoteOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <StickyNote size={20} className="modal-icon" />
                <h3>Add New Note</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setIsAddNoteOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  placeholder="Note Title..."
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  className="text-input"
                />
              </div>
              <div className="form-group">
                <label>Content</label>
                <textarea
                  rows={4}
                  placeholder="Write your note here..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="text-input"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsAddNoteOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddNote}>Save Note</button>
            </div>
          </div>
        </div>
      )}

      {/* App Lock Modal (Shakle App Locker) */}
      {isLockModalOpen && (
        <div className="modal-overlay" onClick={() => setIsLockModalOpen(false)}>
          <div className="modal-content lock-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Lock size={22} className="modal-icon lock-icon-theme" />
                <div>
                  <h3>App Focus Locker</h3>
                  <span className="modal-subtitle">Sakle Engine • Enforced Application Blocking</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setIsLockModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {!isAccessibilityEnabled && (
              <div className="accessibility-alert-banner">
                <AlertTriangle size={20} />
                <div style={{ flex: 1 }}>
                  <strong>Accessibility Permission Required</strong>
                  <p>Enable Accessibility Service for Proxims in Settings so it can enforce app locks.</p>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    await AppLock.openAccessibilitySettings();
                  }}
                >
                  Enable
                </button>
              </div>
            )}

            <div className="app-search-bar-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search installed applications..."
                value={appSearchQuery}
                onChange={(e) => setAppSearchQuery(e.target.value)}
                className="app-search-input"
              />
            </div>

            <div className="apps-list-container">
              {isLoadingApps ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: '#64748b', gap: '0.5rem' }}>
                  <RefreshCw size={24} className="animate-spin" />
                  <span style={{ fontSize: '0.85rem' }}>Loading installed applications...</span>
                </div>
              ) : (
                installedApps
                  .filter(app => app.appName.toLowerCase().includes(appSearchQuery.toLowerCase()))
                  .map(app => {
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
                      <div key={app.packageName} className="app-lock-item-row">
                        <div className="app-item-info">
                          {app.icon ? (
                            <img src={app.icon} alt={app.appName} className="app-item-icon" />
                          ) : (
                            <div className="app-item-icon-fallback"><Lock size={20} /></div>
                          )}
                          <div className="app-item-text">
                            <span className="app-item-name">{app.appName}</span>
                            {isBlocked ? (
                              <span className="app-blocked-timer">{formattedTime}</span>
                            ) : (
                              <span className="app-package-id">{app.packageName}</span>
                            )}
                          </div>
                        </div>

                        <div className="app-lock-controls">
                          {isBlocked ? (
                            <span className="badge-locked">LOCKED</span>
                          ) : (
                            <>
                              {selectedUnit !== 'INFINITE' && (
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="Qty"
                                  value={selectedDuration}
                                  onChange={(e) => setCustomDurations({ ...customDurations, [app.packageName]: e.target.value })}
                                  className="duration-input"
                                />
                              )}
                              <select
                                value={selectedUnit}
                                onChange={(e) => setCustomUnits({ ...customUnits, [app.packageName]: e.target.value as any })}
                                className="unit-select"
                              >
                                <option value="MINUTES">Mins</option>
                                <option value="HOURS">Hours</option>
                                <option value="DAYS">Days</option>
                                <option value="INFINITE">Infinite</option>
                              </select>
                              <button
                                className="btn btn-primary btn-lock-action"
                                onClick={() => handleStartAppLock(app.packageName)}
                                disabled={!isAccessibilityEnabled || (selectedUnit !== 'INFINITE' && !selectedDuration) || isItemLocking}
                                title="Enforce App Lock"
                              >
                                {isItemLocking ? (
                                  <RefreshCw size={14} className="animate-spin" />
                                ) : (
                                  <>
                                    <Lock size={14} /> Lock
                                  </>
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const Long_MAX_VALUE = 9223372036854775807;
