import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Save, Check, FileText, Plus, X, Wand2, Maximize2, Minimize2 } from 'lucide-react';
import { useAppStore, Essay, EssayAnnotation } from '../store/useAppStore';
import { useChatStore } from '../store/useChatStore';
import { ChatAssistant } from '../components/ChatAssistant';
import { cn } from '../lib/utils';
import { translations } from '../lib/i18n';

interface Segment {
  text: string;
  annotations: EssayAnnotation[];
}

type AnnotationType = EssayAnnotation['type'];

interface RawEvaluationAnnotation {
  id?: unknown;
  originalText?: unknown;
  text?: unknown;
  quote?: unknown;
  suggestion?: unknown;
  reason?: unknown;
  type?: unknown;
}

interface RawEvaluationResult {
  score?: unknown;
  summary?: unknown;
  annotations?: unknown;
}

const ANNOTATION_TYPES: AnnotationType[] = ['grammar', 'vocabulary', 'style'];

const toAnnotationType = (value: unknown): AnnotationType => {
  return typeof value === 'string' && ANNOTATION_TYPES.includes(value as AnnotationType) ? value as AnnotationType : 'style';
};

const normalizeForMatch = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

const findNormalizedMatch = (source: string, target: string, fromIndex: number): { startIndex: number; endIndex: number } | null => {
  const normalizedTarget = normalizeForMatch(target);
  if (!normalizedTarget) return null;

  const normalizedChars: Array<{ char: string; index: number }> = [];
  let previousWasSpace = true;

  for (let index = fromIndex; index < source.length; index++) {
    const originalChar = source[index];
    const normalizedChar = /\s/.test(originalChar) ? ' ' : originalChar.toLowerCase();
    if (normalizedChar === ' ') {
      if (previousWasSpace) continue;
      previousWasSpace = true;
    } else {
      previousWasSpace = false;
    }
    normalizedChars.push({ char: normalizedChar, index });
  }

  const normalizedSource = normalizedChars.map(item => item.char).join('').trimStart();
  const leadingTrim = normalizedChars.length - normalizedSource.length;
  const matchIndex = normalizedSource.indexOf(normalizedTarget);
  if (matchIndex === -1) return null;

  const start = normalizedChars[leadingTrim + matchIndex]?.index;
  const end = normalizedChars[leadingTrim + matchIndex + normalizedTarget.length - 1]?.index;
  if (start === undefined || end === undefined) return null;

  return { startIndex: start, endIndex: end + 1 };
};

const findTextRange = (source: string, target: string, fromIndex: number): { startIndex: number; endIndex: number } | null => {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) return null;

  const exactIndex = source.indexOf(trimmedTarget, fromIndex);
  if (exactIndex !== -1) {
    return { startIndex: exactIndex, endIndex: exactIndex + trimmedTarget.length };
  }

  const caseInsensitiveIndex = source.toLowerCase().indexOf(trimmedTarget.toLowerCase(), fromIndex);
  if (caseInsensitiveIndex !== -1) {
    return { startIndex: caseInsensitiveIndex, endIndex: caseInsensitiveIndex + trimmedTarget.length };
  }

  return findNormalizedMatch(source, trimmedTarget, fromIndex);
};

const extractRawAnnotations = (value: unknown): RawEvaluationAnnotation[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RawEvaluationAnnotation => typeof item === 'object' && item !== null);
};

const buildMatchedAnnotations = (text: string, rawAnnotations: unknown): EssayAnnotation[] => {
  let searchFrom = 0;

  return extractRawAnnotations(rawAnnotations).flatMap((annotation, index) => {
    const originalText = [annotation.originalText, annotation.text, annotation.quote].find(value => typeof value === 'string' && value.trim());
    if (typeof originalText !== 'string') return [];

    const range = findTextRange(text, originalText, searchFrom) || findTextRange(text, originalText, 0);
    if (!range) return [];

    searchFrom = range.endIndex;
    return [{
      id: typeof annotation.id === 'string' && annotation.id.trim() ? annotation.id : `a${index + 1}`,
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      suggestion: typeof annotation.suggestion === 'string' && annotation.suggestion.trim() ? annotation.suggestion : 'Revise this text.',
      reason: typeof annotation.reason === 'string' && annotation.reason.trim() ? annotation.reason : 'This part could be improved.',
      type: toAnnotationType(annotation.type)
    }];
  });
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const MOCK_EVALUATE = async (text: string): Promise<{ score: number, summary: string, annotations: EssayAnnotation[] }> => {
  const { chatCompletion } = await import('../services/llm');
  const systemPrompt = `You are an expert English writing tutor. 
Evaluate the following text and provide structured feedback in pure JSON format (without markdown blocks).
The JSON must have the following schema:
{
  "score": <number between 0-100 indicating quality>,
  "summary": "<string, a general summary of the text's strengths and weaknesses. markdown allowed>",
  "annotations": [
    {
      "id": "<string, unique id>",
      "originalText": "<exact text span from the original essay that should be highlighted>",
      "suggestion": "<string, what should be changed to>",
      "reason": "<string, why it should be changed>",
      "type": "<'style' | 'vocabulary' | 'grammar'>"
    }
  ]
}

Do not return character indexes. For each annotation, copy the exact original essay text into originalText so the app can match it locally.
`;

  const response = await chatCompletion([{ role: 'user', content: `Text to evaluate:\n\n${text}` }], systemPrompt, { task: 'writing-evaluation' });

  // Extract JSON from potential Markdown blocks or reasoning wraps
  let cleanedResponse = response;
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    cleanedResponse = jsonMatch[1];
  } else {
    // Try to find the first '{' and last '}'
    const firstBrace = response.indexOf('{');
    const lastBrace = response.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanedResponse = response.substring(firstBrace, lastBrace + 1);
    }
  }

  cleanedResponse = cleanedResponse.trim();
  let result: RawEvaluationResult;
  try {
    result = JSON.parse(cleanedResponse) as RawEvaluationResult;
  } catch (error) {
    throw new Error(`Failed to parse writing evaluation JSON: ${getErrorMessage(error)}. Response preview: ${cleanedResponse.slice(0, 500)}`);
  }
  const score = typeof result.score === 'number' ? result.score : 70;
  const summary = typeof result.summary === 'string' && result.summary.trim() ? result.summary : 'Evaluation complete.';
  const annotations = buildMatchedAnnotations(text, result.annotations);

  return {
    score,
    summary,
    annotations
  };
};

export function Writing() {
  const { essays, activeEssayId, addEssay, updateEssay, setActiveEssayId, deleteEssay, language, showAlert } = useAppStore();
  const t = translations[language];
  const evaluationSteps = useMemo(() => [
    t.evaluationStepReading,
    t.evaluationStepAnalyzing,
    t.evaluationStepChecking,
    t.evaluationStepStyle,
    t.evaluationStepGenerating
  ], [t]);
  const { addMessage } = useChatStore();
  const activeEssay = essays.find(e => e.id === activeEssayId);

  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalStep, setEvalStep] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const { isAssistantOpen, toggleAssistant } = useAppStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Tooltip state
  const [activeTooltip, setActiveTooltip] = useState<{ x: number, y: number, annotations: EssayAnnotation[] } | null>(null);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Load active essay or create one
  useEffect(() => {
    if (activeEssay) {
      setText(activeEssay.content);
      setIsReviewMode(!!activeEssay.annotations && activeEssay.annotations.length > 0);
    } else {
      setText('');
      setIsReviewMode(false);
    }
  }, [activeEssayId]);

  // Handle manual create
  const handleNewEssay = () => {
    const newEssay: Essay = {
      id: Date.now().toString(),
      title: `${t.untitled} ${new Date().toLocaleDateString()}`,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    addEssay(newEssay);
    setText('');
    setIsReviewMode(false);
    setShowHistory(false);
  };

  // Initial load
  useEffect(() => {
    if (essays.length === 0) {
      handleNewEssay();
    } else if (!activeEssayId) {
      setActiveEssayId(essays[0].id);
    }
  }, []);

  const handleSave = () => {
    if (!activeEssayId || !text.trim() || activeEssay?.content === text) return;
    
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setLastSaved(new Date());
      
      // Don't overwrite manually set titles
      const firstLine = text.split('\n')[0].substring(0, 30);
      const titleToSave = activeEssay?.title && !activeEssay.title.startsWith('Untitled') && !activeEssay.title.startsWith(t.untitled)
        ? activeEssay.title 
        : (firstLine || t.untitled);
        
      updateEssay(activeEssayId, { content: text, updatedAt: Date.now(), title: titleToSave });
    }, 500);
  };

  // Auto-save simulation
  useEffect(() => {
    if (!activeEssayId) return;
    
    // Don't auto-save if content is the same (ignoring first load)
    if (activeEssay?.content === text) return;
    if (!text.trim()) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 1500);
    return () => clearTimeout(timer);
  }, [text, activeEssayId]);

  const handleEvaluate = async () => {
    if (!text.trim() || !activeEssayId) return;
    setIsEvaluating(true);
    setEvalStep(0);
    
    const interval = setInterval(() => {
      setEvalStep(prev => (prev + 1) % evaluationSteps.length);
    }, 2500);

    try {
      const result = await MOCK_EVALUATE(text);
      
      const newEvaluationMessage = {
        id: Date.now().toString(),
        role: 'assistant' as const,
        type: 'evaluation' as const,
        content: result.summary,
        createdAt: Date.now(),
        evaluation: {
          score: result.score,
          summary: result.summary,
          annotations: result.annotations,
          contentSnapshot: text
        }
      };

      updateEssay(activeEssayId, {
        updatedAt: Date.now(),
        evaluationScore: result.score,
        evaluationSummary: result.summary,
        annotations: result.annotations
      });
      addMessage(`essay_${activeEssayId}`, newEvaluationMessage);
      setIsReviewMode(true);
    } catch (error) {
      console.error('Writing evaluation failed', error);
      showAlert({
        title: 'Evaluation failed',
        message: getErrorMessage(error),
      });
    } finally {
      clearInterval(interval);
      setIsEvaluating(false);
    }
  };

  const handleReturnToEdit = () => {
    setIsReviewMode(false);
    if (activeEssayId) {
      // We clear the annotations when starting to edit again to prevent index desync
      updateEssay(activeEssayId, {
        annotations: undefined,
        evaluationScore: undefined,
        evaluationSummary: undefined
      });
    }
  };

  // Build segments for review mode
  const segments = useMemo(() => {
    if (!text || !activeEssay?.annotations) return [];
    
    const chars = text.split('').map(char => ({ char, annotations: [] as EssayAnnotation[] }));
    
    activeEssay.annotations.forEach(ann => {
      for (let i = ann.startIndex; i < ann.endIndex; i++) {
        if (chars[i]) chars[i].annotations.push(ann);
      }
    });

    const segmentsArray: Segment[] = [];
    let currentText = '';
    let currentAnns: EssayAnnotation[] = [];

    chars.forEach((c) => {
      const idsMatch = currentAnns.length === c.annotations.length && 
                       currentAnns.every((a, i) => a.id === c.annotations[i].id);
      if (idsMatch) {
        currentText += c.char;
      } else {
        if (currentText) segmentsArray.push({ text: currentText, annotations: currentAnns });
        currentText = c.char;
        currentAnns = [...c.annotations];
      }
    });
    if (currentText) segmentsArray.push({ text: currentText, annotations: currentAnns });
    
    return segmentsArray;
  }, [text, activeEssay?.annotations]);

  const handleSegmentClick = (e: React.MouseEvent, annotations: EssayAnnotation[]) => {
    if (annotations.length === 0) {
      setActiveTooltip(null);
      return;
    }
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setActiveTooltip({
      x: rect.left,
      y: rect.bottom + 8,
      annotations
    });
  };



  return (
    <div className="w-full h-full flex flex-col lg:flex-row gap-6 relative overflow-hidden pt-4 md:pt-0">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full flex-col flex-1 pb-10 overflow-y-auto hide-scrollbar flex pr-2"
        onClick={() => setActiveTooltip(null)}
      >
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 md:mb-6 gap-4 shrink-0">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 mb-1 md:mb-2 text-blue-600 dark:text-blue-400 cursor-pointer" onClick={() => setShowHistory(true)}>
              <FileText size={18} />
              <span className="font-semibold text-sm">{t.viewHistory}</span>
            </div>
            <input 
              value={activeEssay?.title || ''}
              onChange={(e) => {
                if (activeEssayId) {
                  updateEssay(activeEssayId, { title: e.target.value, updatedAt: Date.now() });
                }
              }}
              className="w-full bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500/50 rounded px-1 -ml-1 text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-200 transition-colors"
              placeholder={t.essayTitle}
            />
            <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base transition-colors mt-1">
              {isReviewMode ? t.evaluatingReview : t.writingPrompt}
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
               onClick={handleSave}
               disabled={isSaving || !text.trim() || activeEssay?.content === text}
               className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-xs md:text-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 shrink-0"
            >
               <Save size={14} />
                <span className="hidden md:inline">{t.save}</span>
            </button>
            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-3 py-1.5 md:px-4 md:py-2 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 self-end md:self-auto min-w-[fit-content] transition-colors">
              {isSaving ? (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium text-xs md:text-sm">
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  {t.saving}
                </div>
              ) : lastSaved ? (
                <div className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400 font-medium text-xs md:text-sm">
                  <Check size={14} />
                  {t.saved} {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              ) : (
                <div className="text-slate-400 text-xs md:text-sm">{t.ready}</div>
              )}
            </div>
          </div>
        </header>

        {isReviewMode && activeEssay?.evaluationScore && (
          <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-4 flex gap-4 items-start">
            <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-xl text-indigo-600 dark:text-indigo-400 shadow-sm shrink-0 border border-indigo-100 dark:border-slate-700">
              {activeEssay.evaluationScore}
            </div>
            <div>
              <h3 className="font-bold text-indigo-900 dark:text-indigo-300">{t.evaluationResult}</h3>
              <p className="text-indigo-700 dark:text-indigo-400 text-sm mt-1">{activeEssay.evaluationSummary}</p>
            </div>
          </div>
        )}

        <div className={cn(
          "overflow-hidden flex flex-col transition-all border dark:border-slate-800 shadow-2xl",
          isFullscreen 
            ? "fixed inset-0 z-[100] m-0 rounded-none w-full h-full" 
            : "relative flex-1 rounded-[24px] md:rounded-[32px] min-h-[300px] shadow-xl",
          isReviewMode 
            ? "bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800" 
            : "bg-[#1E293B] dark:bg-black/90 focus-within:ring-2 focus-within:ring-blue-400 dark:focus-within:ring-blue-600"
        )}>
          <div className="flex justify-between items-center p-3 md:p-4 border-b border-slate-700/50 dark:border-slate-800 bg-black/10 dark:bg-white/5">
            <div className="flex gap-1.5 pl-1 md:pl-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 dark:text-slate-600 font-mono">
                {isReviewMode ? t.modeReview : t.autosaveActive}
              </span>
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-slate-400 hover:text-slate-300 dark:text-slate-500 dark:hover:text-slate-300 transition-colors pr-2 cursor-pointer z-10"
                title={isFullscreen ? t.exitFullscreen : t.fullscreen}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>
          
          <div className="flex-1 flex overflow-hidden relative">
            <AnimatePresence>
              {isEvaluating && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { delay: 0.2 } }}
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/80 dark:bg-[#1E293B]/90 backdrop-blur-md rounded-b-[24px] md:rounded-b-[32px]"
                >
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="relative w-32 h-32 mb-8 flex items-center justify-center"
                  >
                    <div className="absolute inset-0 bg-blue-500/20 dark:bg-blue-500/10 rounded-full blur-2xl animate-pulse"></div>
                    <div className="absolute inset-2 border-[3px] border-indigo-500/20 dark:border-indigo-500/30 rounded-full"></div>
                    <div className="absolute inset-2 border-[3px] border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                    
                    <div className="absolute inset-6 border-[3px] border-purple-500/20 dark:border-purple-500/30 rounded-full"></div>
                    <div className="absolute inset-6 border-[3px] border-purple-400 rounded-full border-b-transparent animate-[spin_2s_linear_infinite_reverse]"></div>
                    
                    <div className="absolute inset-10 border-[3px] border-blue-500/20 dark:border-blue-500/30 rounded-full"></div>
                    <div className="absolute inset-10 border-[3px] border-blue-400 rounded-full border-r-transparent animate-[spin_3s_linear_infinite]"></div>

                    <div className="relative z-10 w-12 h-12 bg-white dark:bg-slate-800 rounded-full shadow-xl flex items-center justify-center">
                      <Wand2 className="text-indigo-600 dark:text-indigo-400 animate-pulse" size={24} />
                    </div>
                  </motion.div>
                  
                  <div className="h-8 relative w-96 overflow-hidden text-center mb-2">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={evalStep}
                        initial={{ y: 20, opacity: 0, filter: 'blur(4px)' }}
                        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                        exit={{ y: -20, opacity: 0, filter: 'blur(4px)' }}
                        transition={{ duration: 0.4 }}
                        className="absolute inset-0 flex items-center justify-center font-medium text-lg bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400"
                      >
                        {evaluationSteps[evalStep]}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  
                  <div className="flex gap-1.5 mt-2">
                    <motion.div 
                      className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400"
                      animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                    />
                    <motion.div 
                      className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400"
                      animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.div 
                      className="w-1.5 h-1.5 rounded-full bg-purple-500 dark:bg-purple-400"
                      animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!isReviewMode ? (
              <textarea
                ref={textAreaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="flex-1 w-full h-full bg-transparent border-none outline-none resize-none p-4 md:p-6 font-mono text-sm leading-relaxed text-slate-300 dark:text-slate-400 hide-scrollbar transition-colors"
                spellCheck={false}
                placeholder={t.startWriting}
              />
            ) : (
              <div className="flex-1 overflow-y-auto p-4 md:p-6 font-sans text-base leading-relaxed text-slate-800 dark:text-slate-300 whitespace-pre-wrap">
                {segments.map((seg, i) => {
                  if (seg.annotations.length === 0) {
                    return <span key={i}>{seg.text}</span>;
                  }

                  
                  // Has annotations
                  const isOverlap = seg.annotations.length > 1;
                  
                  if (isOverlap) {
                    const uniqueTypes = Array.from(new Set(seg.annotations.map(a => a.type))).sort();
                    const colorValues = {
                      grammar: 'rgba(239, 68, 68, 0.25)', // red
                      vocabulary: 'rgba(245, 158, 11, 0.25)', // amber
                      style: 'rgba(59, 130, 246, 0.25)' // blue
                    };
                    
                    let stops = '';
                    const segmentSize = 8;
                    uniqueTypes.forEach((t, index) => {
                      const color = colorValues[t as keyof typeof colorValues] || 'rgba(168, 85, 247, 0.25)';
                      const start = index * segmentSize;
                      const end = (index + 1) * segmentSize;
                      stops += `${color} ${start}px, ${color} ${end}px${index < uniqueTypes.length - 1 ? ', ' : ''}`;
                    });
                    
                    return (
                      <span 
                        key={i} 
                        className="cursor-pointer transition-opacity px-0.5 rounded-sm hover:opacity-80 border-b-2 border-dashed border-slate-400 dark:border-slate-500 text-slate-900 dark:text-slate-100"
                        style={{
                          backgroundImage: `repeating-linear-gradient(-45deg, ${stops})`
                        }}
                        title={t.multipleSuggestions}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSegmentClick(e, seg.annotations);
                        }}
                      >
                        {seg.text}
                      </span>
                    );
                  }

                  const type = seg.annotations[0].type;
                  
                  const colors = {
                    grammar: "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-900 dark:text-red-200",
                    vocabulary: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200",
                    style: "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200",
                  };

                  return (
                    <span 
                      key={i} 
                      className={cn("border-b-2 cursor-pointer transition-colors px-0.5 rounded-sm hover:opacity-80", colors[type as keyof typeof colors])}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSegmentClick(e, seg.annotations);
                      }}
                    >
                      {seg.text}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 md:mt-6 flex justify-end gap-3 md:gap-4 pb-2">
          {isReviewMode ? (
            <button 
              onClick={handleReturnToEdit}
              className="px-4 py-2.5 md:px-6 md:py-3 rounded-xl md:rounded-2xl font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              {t.resumeEditing}
            </button>
          ) : (
            <button 
              onClick={handleEvaluate}
              disabled={isEvaluating || !text.trim()}
              className="px-4 py-2.5 md:px-6 md:py-3 rounded-xl md:rounded-2xl font-bold text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 shadow-lg shadow-blue-500/20 dark:shadow-none transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEvaluating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t.evaluating}</span>
                </>
              ) : (
                <>
                  <Wand2 size={16} />
                  <span>{t.evaluate}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* All Suggestions List */}
        {isReviewMode && activeEssay?.annotations && activeEssay.annotations.length > 0 && (
          <div className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-6">
            <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-slate-200">{t.allSuggestions} ({activeEssay.annotations.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeEssay.annotations.map(ann => (
                <div key={ann.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col h-full text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                      ann.type === 'grammar' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      ann.type === 'vocabulary' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    )}>
                      {ann.type}
                    </span>
                  </div>
                  <div className="bg-slate-100 dark:bg-black/20 text-slate-500 dark:text-slate-400 p-2 rounded text-xs line-through mb-2 italic">
                    "{text.substring(ann.startIndex, ann.endIndex)}"
                  </div>
                  <div className="font-medium text-emerald-600 dark:text-emerald-400 mb-2 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">💡</span>
                    <span>{ann.suggestion}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-auto">
                    {ann.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Chat / Discussion Panel */}
      <AnimatePresence>
        {isAssistantOpen && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
            className="hidden lg:flex w-80 xl:w-96 shrink-0 mb-10 h-[calc(100%-2.5rem)]"
          >
            <ChatAssistant 
              contextId={`essay_${activeEssayId}`} 
              title={t.writingAssistant}
              description={t.askWritingEvaluations}
              systemContext={`The user is currently writing/reviewing an essay titled "${activeEssay?.title || t.untitled}". The current text is:\n\n${text}\n\nEvaluations/Annotations (if any): ${JSON.stringify(activeEssay?.annotations)}`}
              onClose={toggleAssistant}
              className="h-full"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Chat / Discussion Drawer */}
      <AnimatePresence>
        {isAssistantOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-40 backdrop-blur-sm lg:hidden"
              onClick={toggleAssistant}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 right-0 bottom-0 h-[80vh] z-50 rounded-t-3xl border-t border-slate-100 dark:border-slate-800 flex flex-col lg:hidden bg-white dark:bg-slate-900 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
            >
               <ChatAssistant 
                  contextId={`essay_${activeEssayId}`} 
                  title={t.writingAssistant}
                  description={t.askWriting}
                  systemContext={`The user is currently writing/reviewing an essay titled "${activeEssay?.title || t.untitled}". The current text is:\n\n${text}\n\nEvaluations/Annotations (if any): ${JSON.stringify(activeEssay?.annotations)}`}
                  onClose={toggleAssistant}
                  className="rounded-none border-none shadow-none h-full"
                  isEmbedded={true}
                />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-40 backdrop-blur-sm"
              onClick={() => setShowHistory(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-slate-900 shadow-2xl z-50 border-l border-slate-100 dark:border-slate-800 flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                <h2 className="font-bold text-lg dark:text-white">{t.writingHistory}</h2>
                <div className="flex gap-2">
                  <button onClick={handleNewEssay} className="p-2 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors" title={t.newEssay}>
                    <Plus size={18} />
                  </button>
                  <button onClick={() => setShowHistory(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {essays.map(essay => (
                  <div 
                    key={essay.id}
                    onClick={() => {
                      setActiveEssayId(essay.id);
                      setShowHistory(false);
                    }}
                    className={cn(
                      "p-3 rounded-xl cursor-pointer border transition-all",
                      activeEssayId === essay.id 
                        ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" 
                        : "bg-white border-slate-100 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:hover:border-slate-600"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-medium text-slate-800 dark:text-slate-200 truncate pr-2">{essay.title || t.untitled}</h3>
                      {confirmDeleteId === essay.id ? (
                        <div className="flex gap-2 items-center">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteEssay(essay.id);
                              setConfirmDeleteId(null);
                            }}
                            className="bg-red-500 text-white text-xs px-2 py-0.5 rounded hover:bg-red-600 w-12"
                          >
                            {t.sure}
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                            className="text-slate-400 hover:text-slate-600 text-xs px-1"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(essay.id);
                          }}
                          className="text-slate-300 hover:text-red-500 mt-0.5 px-1 py-1 -mr-1"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 truncate">
                      {essay.content || t.noContentYet}
                    </p>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{new Date(essay.updatedAt).toLocaleDateString()}</span>
                      {essay.evaluationScore !== undefined && (
                        <span className="font-medium text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                          {t.score}: {essay.evaluationScore}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {essays.length === 0 && (
                  <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-10">{t.noHistoryFound}</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Tooltip for Annotations */}
      {activeTooltip && (
        <div 
          className="fixed z-[110] bg-white dark:bg-slate-800 shadow-2xl rounded-xl border border-slate-100 dark:border-slate-700 p-4 w-72 max-w-[90vw]"
          style={{ top: activeTooltip.y, left: Math.min(activeTooltip.x, window.innerWidth - 300) }}
        >
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100 dark:border-slate-700">
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{t.suggestions} ({activeTooltip.annotations.length})</h4>
            <button onClick={() => setActiveTooltip(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1">
            {activeTooltip.annotations.map(ann => (
              <div key={ann.id} className="text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                    ann.type === 'grammar' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                    ann.type === 'vocabulary' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  )}>
                    {ann.type}
                  </span>
                </div>
                <div className="bg-slate-100 dark:bg-black/20 text-slate-500 dark:text-slate-400 p-2 rounded text-xs line-through mb-2 italic">
                  "{text.substring(ann.startIndex, ann.endIndex)}"
                </div>
                <div className="font-medium text-emerald-600 dark:text-emerald-400 mb-1 flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">💡</span>
                  <span>{ann.suggestion}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                  {ann.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
