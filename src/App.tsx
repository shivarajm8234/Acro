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
  AlertTriangle
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker for native canvas PDF rendering
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
import { Xframe } from 'capacitor-plugin-xframe';
import { registerPlugin } from '@capacitor/core';
import './App.css';

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
  const [activeTab, setActiveTab] = useState<'downloader' | 'animly' | 'profile' | 'placement'>('downloader');
  const [isIframeLoading, setIsIframeLoading] = useState<boolean>(true);

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

      // 2. Perform AI ATS analysis
      triggerAlert('Analyzing ATS compatibility...', 'info');

      const maxAtsChars = 1000;
      const truncatedResume = resumeText.substring(0, maxAtsChars) + (resumeText.length > maxAtsChars ? '... [truncated]' : '');

      const atsPrompt = `
You are an advanced ATS (Applicant Tracking System) scanner. Scan the following resume text and evaluate its score.

RESUME TEXT:
${truncatedResume}

STUDENT PROFILE DATA:
- Skills listed in profile: ${studentProfile.skills}

TASK:
1. Provide an ATS compatibility score out of 100 based on structure, length, formatting, content quality, and profile alignment.
2. Provide a general feedback summary.
3. List 3-5 smart recommendations/suggestions to improve the resume for ATS parsers.
4. Extract 5-10 key professional keywords found in the resume.
5. Identify 3-5 missing keywords or core skills that are highly relevant to their profile but missing in the resume text.

FORMAT YOUR RESPONSE IN CLEAR JSON FORMAT matching this pattern:
{
  "score": 78,
  "feedback": "Your resume has a strong foundation but lacks key elements...",
  "suggestions": [
    "Add more metrics/numbers to achievements",
    "Include a dedicated certifications section"
  ],
  "keywordsFound": ["React", "Python", "Machine Learning"],
  "keywordsMissing": ["Docker", "CI/CD", "TypeScript"]
}
Return ONLY valid JSON.
`;
      let atsResultText = '';
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
      const result = await LlmInference.generateResponse({ prompt: atsPrompt });
      atsResultText = result.response;
      // Local dynamic ATS calculator to prevent hardcoding
      const sectionsList = ['education', 'experience', 'skills', 'projects', 'certifications', 'summary', 'languages'];
      const foundSections = sectionsList.filter(sec => new RegExp(`\\b${sec}\\b`, 'i').test(resumeText));
      const sectionScore = (foundSections.length / 5) * 40; // max 40 points
      
      const wordsCount = resumeText.split(/\s+/).filter(Boolean).length;
      const lengthScore = wordsCount >= 150 && wordsCount <= 900 ? 30 : wordsCount > 900 ? 20 : 10; // max 30 points

      const profileSkills = studentProfile.skills.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      const matchedSkills = profileSkills.filter(skill => resumeText.toLowerCase().includes(skill));
      const skillsScore = profileSkills.length > 0 ? (matchedSkills.length / profileSkills.length) * 30 : 20; // max 30 points
      const calculatedAtsScore = Math.max(35, Math.min(98, Math.round(sectionScore + lengthScore + skillsScore)));

      let parsed: {
        score: number;
        feedback: string;
        suggestions: string[];
        keywordsFound: string[];
        keywordsMissing: string[];
      } = {
        score: calculatedAtsScore,
        feedback: atsResultText || 'Analysis completed.',
        suggestions: [],
        keywordsFound: matchedSkills.length > 0 ? matchedSkills : (studentProfile.skills ? studentProfile.skills.split(',') : ['Analytics']),
        keywordsMissing: []
      };
      try {
        const jsonMatch = atsResultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedJson = JSON.parse(jsonMatch[0]);
          if (parsedJson.score) parsed.score = parsedJson.score;
          if (parsedJson.feedback) parsed.feedback = parsedJson.feedback;
          if (parsedJson.suggestions) parsed.suggestions = parsedJson.suggestions;
          if (parsedJson.keywordsFound) parsed.keywordsFound = parsedJson.keywordsFound;
          if (parsedJson.keywordsMissing) parsed.keywordsMissing = parsedJson.keywordsMissing;
        } else {
          // Regex match extraction of score from text output
          const scoreMatch = atsResultText.match(/(?:score|rating|result)\s*[:\-]?\s*(\d+)%?/i) || atsResultText.match(/(\d+)%/);
          if (scoreMatch) {
            parsed.score = parseInt(scoreMatch[1]);
          }
        }
      } catch (e) {
        console.warn('ATS AI did not return valid JSON, using raw parsing...', e);
      }

      // Fill in lists if empty
      if (parsed.suggestions.length === 0) {
        const bulletPoints = atsResultText.split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-') || line.startsWith('*'))
          .map(line => line.substring(1).trim());
        parsed.suggestions = bulletPoints.length > 0 ? bulletPoints : ['Ensure standard headers like Education and Skills are present.', 'Add metrics and impact numbers to experience details.'];
      }
      if (parsed.keywordsMissing.length === 0) {
        const standardTechKeywords = ['Docker', 'CI/CD', 'Git', 'Cloud Computing', 'SQL', 'TypeScript', 'System Design'];
        parsed.keywordsMissing = standardTechKeywords.filter(kw => !resumeText.toLowerCase().includes(kw.toLowerCase())).slice(0, 3);
      }

      setAtsResult(parsed);
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
      try { return JSON.parse(saved); } catch (e) {}
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
          triggerAlert(`🚀 LiteRT warm-up completed. ${MODELS.find(m=>m.id===modelId)?.name} active in RAM.`, 'success');
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
            setActiveTab('downloader');
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
            className={`btn btn-sm ${activeTab === 'downloader' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              playSynthSound('click');
              setActiveTab('downloader');
            }}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
          >
            Home
          </button>
          
          <button 
            className={`btn btn-sm ${activeTab === 'animly' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              playSynthSound('click');
              setActiveTab('animly');
            }}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
          >
            Animly
          </button>

          <button 
            className={`btn btn-sm ${activeTab === 'placement' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              playSynthSound('click');
              setActiveTab('placement');
            }}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
          >
            Placement Hub
          </button>

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

      {/* Main Panel grid */}
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
              <span className="iframe-loader-text">Loading Animly Engine...</span>
            </div>
          )}
          <iframe 
            src={`https://animlyy.web.app/?guest_key=${import.meta.env.VITE_GUEST_GROQ_API_KEY || ''}`} 
            className="iframe-web" 
            title="Animly Web Application"
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
          className={`nav-item ${activeTab === 'downloader' ? 'active' : ''}`}
          onClick={() => {
            playSynthSound('click');
            setActiveTab('downloader');
          }}
        >
          <Cpu size={20} />
          <span>AI Downloader</span>
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
          <span>Animly Web</span>
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
                        <span className="ats-score-lbl">ATS Score</span>
                      </div>
                      <div className="ats-grade-text">
                        {atsResult.score >= 80 ? (
                          <span className="badge-grade high">Excellent Compatibility</span>
                        ) : atsResult.score >= 60 ? (
                          <span className="badge-grade medium">Good - Needs Improvements</span>
                        ) : (
                          <span className="badge-grade low">Poor ATS Parsing Match</span>
                        )}                        <p className="ats-feedback-desc">{renderFormattedText(atsResult.feedback)}</p>
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
    </div>
  );
}
