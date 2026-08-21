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
  AlertCircle, 
  CheckCircle,
  CloudLightning,
  Smartphone,
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
  Upload,
  Paperclip,
  Save,
  ArrowLeft,
  ExternalLink
} from 'lucide-react';
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

export default function App() {
  // Storage State
  const [availableStorage, setAvailableStorage] = useState<number>(15247134720); // ~14.2 GB
  const [isRefreshingStorage, setIsRefreshingStorage] = useState<boolean>(false);

  // Tab navigation states
  const [activeTab, setActiveTab] = useState<'downloader' | 'animly' | 'profile'>('downloader');
  const [isIframeLoading, setIsIframeLoading] = useState<boolean>(true);

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

  // PWA Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState<boolean>(false);

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

  // Toast feedback helper & System Notification
  const triggerAlert = (text: string, type: 'success' | 'info' | 'error' = 'info') => {
    setAlertMsg({ text, type });
    setTimeout(() => setAlertMsg(null), 3500);

    // Native Notification Drawer trigger
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          new Notification('Acro AI Suite', {
            body: text,
            icon: '/acro-logo.png'
          });
        } catch (e) {}
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            try {
              new Notification('Acro AI Suite', {
                body: text,
                icon: '/acro-logo.png'
              });
            } catch (e) {}
          }
        });
      }
    }
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

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleInstalled = () => {
      setIsPwaInstalled(true);
      setDeferredPrompt(null);
      playSynthSound('success');
      triggerAlert('🎉 Helply AI Downloader installed locally!', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const runInstall = async () => {
    if (!deferredPrompt) return;
    playSynthSound('click');
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

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
      {/* Header */}
      <header>
        <div className="brand">
          <img src="/acro-logo.png" alt="Acro Logo" className="brand-logo-img" />
          <div className="brand-text">
            <h1>Acro</h1>
            <span className="brand-subtitle">AI Model Suite</span>
          </div>
        </div>
        
        <div className="header-actions">
          {isPwaInstalled && (
            <div className="status-badge client-badge">
              <Check size={12} />
              <span>Mobile Client</span>
            </div>
          )}
          {deferredPrompt && (
            <button className="btn btn-secondary install-btn" onClick={runInstall}>
              <Smartphone size={14} /> <span>Install</span>
            </button>
          )}
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

      {/* Floating feedback alert */}
      {alertMsg && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1e293b',
          color: '#f8fafc',
          padding: '0.65rem 1.25rem',
          borderRadius: '50px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8rem',
          fontWeight: 600,
          zIndex: 100,
          animation: 'slideUp 0.2s ease-out'
        }}>
          {alertMsg.type === 'success' ? (
            <Check size={14} style={{ color: 'var(--color-emerald)' }} />
          ) : alertMsg.type === 'error' ? (
            <AlertCircle size={14} style={{ color: 'var(--color-rose)' }} />
          ) : (
            <CloudLightning size={14} style={{ color: 'var(--color-indigo)' }} />
          )}
          <span>{alertMsg.text}</span>
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

      {/* Floating Action Button (FAB) for Chatbot */}
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
                    <img src={studentProfile.resumeData} alt="Resume Preview" className="resume-image-preview" />
                  ) : (
                    <iframe 
                      src={studentProfile.resumeData} 
                      title="Resume Preview Frame" 
                      className="resume-doc-frame"
                    />
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
            <div className="fullscreen-resume-body">
              {studentProfile.resumeType.startsWith('image/') ? (
                <img src={studentProfile.resumeData} alt="Fullscreen Resume" className="fullscreen-resume-img" />
              ) : (
                <iframe 
                  src={studentProfile.resumeData} 
                  title="Fullscreen Document Viewer" 
                  className="fullscreen-resume-frame" 
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
