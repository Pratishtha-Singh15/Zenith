/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Rocket, 
  Target, 
  Sparkles, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  ArrowRight, 
  TrendingUp, 
  ChevronRight, 
  Plus, 
  Database,
  RefreshCw,
  Loader2,
  Calendar,
  BookOpen,
  Briefcase,
  Lightbulb,
  Heart,
  ChevronLeft,
  Sparkle,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  MountainSnow,
  ChevronDown,
  HelpCircle
} from 'lucide-react';
import { 
  getOrCreateGuestUser, 
  saveCommitmentAndTasks, 
  getCommitments, 
  getTasksForCommitment, 
  seedDemoCommitments,
  updateTaskCompletion,
  getAllTasksForCommitments,
  saveReplannedTasks,
  saveChatMessage,
  getChatMessages,
  deleteCommitmentAndTasks,
  resetUserSessionData
} from './lib/dbService';
import { calculateConfidenceScore } from './utils/confidence';
import { User, Commitment, Task, Priority, Milestone, ChatMessage } from './types';

const FAQ_ITEMS = [
  {
    q: "How is this different from a regular to-do list or reminder app?",
    a: "Most apps just remind you what's due. Zenith actually builds your plan, explains why it sequenced things the way it did, and rebuilds your schedule when something gets in the way — instead of just sending another notification."
  },
  {
    q: "What happens if I miss a task?",
    a: "Tell Zenith why — too little time, too hard, or something unexpected came up — and the AI restructures your remaining plan to protect your deadline, instead of just pushing everything back a day."
  },
  {
    q: "Do I need to sign up to try it?",
    a: "No. You can start using Zenith immediately as a guest — no email, no password. Your data stays private to your own session."
  },
  {
    q: "Is this only for students?",
    a: "No. Zenith is built for students, professionals, and entrepreneurs alike — anything from interview prep to client deliverables to bill payments works the same way."
  },
  {
    q: "What if it's the last minute and I don't even know where to start?",
    a: "That's exactly what Need Help is for. Click it on any task, and you'll instantly get the key questions to think through, a simple structure to follow, and one clear next step — so you can stop panicking and start moving, even with zero time left."
  }
];

export default function App() {
  // Session states
  const [user, setUser] = useState<User | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Routing state
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard' | 'create' | 'plan' | 'coach' | 'calendar'>('landing');
  const [showCompleted, setShowCompleted] = useState(true);

  // Calendar states
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());

  // Focus Timer states
  const [timerMode, setTimerMode] = useState<'work' | 'rest'>('work');
  const [timeLeft, setTimeLeft] = useState<number>(25 * 60);
  const [timerIsActive, setTimerIsActive] = useState<boolean>(false);

  // AI Coach Chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    deadline: '',
    availableTime: '',
    priority: 'medium' as Priority,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Navigation and scroll behaviors
  const [shouldHideHeader, setShouldHideHeader] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [activeBgIndex, setActiveBgIndex] = useState(0);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Selected Plan state (for AI Plan View)
  const [selectedCommitment, setSelectedCommitment] = useState<Commitment | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [loadingPlanDetails, setLoadingPlanDetails] = useState(false);

  // Replanning states
  const [replanTask, setReplanTask] = useState<Task | null>(null);
  const [replanReason, setReplanReason] = useState<'No Time' | 'Too Difficult' | 'Unexpected Event' | null>(null);
  const [replanningLoading, setReplanningLoading] = useState(false);
  const [replanResult, setReplanResult] = useState<{
    updatedTasks: any[];
    explanation: string;
    deadlineRisk: 'low' | 'medium' | 'high';
    isFallback?: boolean;
    durationSeconds?: number;
  } | null>(null);
  const [showReplanModal, setShowReplanModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Task Help states
  const [showTaskHelpModal, setShowTaskHelpModal] = useState(false);
  const [helpTask, setHelpTask] = useState<Task | null>(null);
  const [taskHelpLoading, setTaskHelpLoading] = useState(false);
  const [taskHelpError, setTaskHelpError] = useState<string | null>(null);
  const [taskHelpData, setTaskHelpData] = useState<{
    opener: string;
    keyQuestions: string[];
    startingStructure: string[];
    nextAction: string;
  } | null>(null);

  const handleGetTaskHelp = async (task: Task) => {
    // Find parent commitment
    const parentCommitment = commitments.find(c => c.id === task.commitmentId);
    
    setHelpTask(task);
    setTaskHelpData(null);
    setTaskHelpError(null);
    setTaskHelpLoading(true);
    setShowTaskHelpModal(true);

    try {
      const response = await fetch('/api/task-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          priority: task.priority,
          commitmentTitle: parentCommitment ? parentCommitment.title : '',
          commitmentDescription: parentCommitment ? parentCommitment.description : '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch starting point helper from server');
      }

      const data = await response.json();
      setTaskHelpData(data);
    } catch (error: any) {
      console.error('Error fetching task starting point helper:', error);
      setTaskHelpError(error.message || 'An error occurred while fetching starting point help.');
    } finally {
      setTaskHelpLoading(false);
    }
  };

  const handleOpenReplanModal = (task: Task) => {
    setReplanTask(task);
    setReplanReason(null);
    setReplanResult(null);
    setShowReplanModal(true);
  };

  const handleSubmitReplan = async () => {
    if (!replanTask || !replanReason) return;

    setReplanningLoading(true);
    const startTime = Date.now();

    try {
      // Find parent commitment
      const commitment = commitments.find(c => c.id === replanTask.commitmentId);
      if (!commitment) {
        throw new Error('Parent commitment not found');
      }

      // Filter all tasks for this specific commitment
      const commitmentTasks = allTasks.filter(t => t.commitmentId === replanTask.commitmentId);

      // Call server-side replan API
      const response = await fetch('/api/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: replanTask,
          reason: replanReason,
          commitment: {
            title: commitment.title,
            description: commitment.description,
            deadline: commitment.deadline,
          },
          allTasks: commitmentTasks,
        }),
      });

      if (!response.ok) {
        throw new Error('Server returned an error');
      }

      const result = await response.json();
      const endTime = Date.now();
      const durationSeconds = parseFloat(((endTime - startTime) / 1000).toFixed(1));

      setReplanResult({
        ...result,
        durationSeconds,
      });
    } catch (err) {
      console.error('Failed to submit replan:', err);
      // Fallback
      const commitment = commitments.find(c => c.id === replanTask.commitmentId);
      const commitmentTasks = allTasks.filter(t => t.commitmentId === replanTask.commitmentId);
      
      const today = new Date();
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const deadlineDate = commitment ? new Date(commitment.deadline) : tomorrow;
      let targetDate = tomorrow;
      if (targetDate > deadlineDate) {
        targetDate = deadlineDate;
      }
      const formattedDate = targetDate.toISOString().split('T')[0];

      const updatedTasks = commitmentTasks.filter(t => !t.completed).map(t => {
        if (t.id === replanTask.id) {
          return {
            ...t,
            dueDate: formattedDate,
          };
        }
        return t;
      });

      setReplanResult({
        updatedTasks,
        explanation: "Simplified replan applied: The missed task has been shifted forward by 1 day as a temporary fallback adjustment.",
        deadlineRisk: "medium",
        isFallback: true,
        durationSeconds: 0.1,
      });
    } finally {
      setReplanningLoading(false);
    }
  };

  const handleConfirmReplan = async () => {
    if (!replanTask || !replanResult) return;

    try {
      // Persist changes to firestore
      await saveReplannedTasks(replanTask.commitmentId, replanResult.updatedTasks);
      
      // Sync from Database to refresh states
      await refreshCommitments();

      // If we are currently in AI Plan view for this commitment, reload its task list
      if (selectedCommitment && selectedCommitment.id === replanTask.commitmentId) {
        const freshTasks = await getTasksForCommitment(replanTask.commitmentId);
        setSelectedTasks(freshTasks);
        
        // Also update the selectedCommitment progress/status on the fly
        const total = freshTasks.length;
        const completedCount = freshTasks.filter(t => t.completed).length;
        const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;
        const status = progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending';
        setSelectedCommitment(prev => prev ? { ...prev, progress, status } : null);
      }

      // Close modal
      setShowReplanModal(false);
      setReplanTask(null);
      setReplanReason(null);
      setReplanResult(null);
    } catch (err) {
      console.error('Failed to apply replan:', err);
      alert('Error updating database. Please try again.');
    }
  };

  // Load guest user and their commitments on mount
  useEffect(() => {
    async function initSession() {
      try {
        const guestUser = await getOrCreateGuestUser();
        setUser(guestUser);
        const list = await getCommitments(guestUser.id);
        setCommitments(list);
        if (list.length > 0) {
          setLoadingTasks(true);
          const tasks = await getAllTasksForCommitments(list.map(c => c.id));
          setAllTasks(tasks);
        }

        // Load chat messages from Firestore database
        const msgs = await getChatMessages(guestUser.id);
        
        // Deduplicate loaded messages to handle any legacy duplicates saved in the DB
        const uniqueMsgs: ChatMessage[] = [];
        const seenTexts = new Set<string>();
        for (const msg of msgs) {
          if (msg.sender === 'assistant' && seenTexts.has(msg.text)) {
            continue;
          }
          if (msg.sender === 'assistant') {
            seenTexts.add(msg.text);
          }
          uniqueMsgs.push(msg);
        }

        if (uniqueMsgs.length === 0) {
          const welcomeMsg = await saveChatMessage(
            guestUser.id,
            'assistant',
            "Hello! I am your Zenith Coach. I'm connected directly to your workspace. How can I help you optimize your schedule or get back on track today?",
            `welcome_${guestUser.id}`
          );
          setChatMessages([welcomeMsg]);
        } else {
          setChatMessages(uniqueMsgs);
        }
      } catch (err) {
        console.error('Failed to initialize guest session', err);
      } finally {
        setLoadingUser(false);
        setLoadingTasks(false);
      }
    }
    initSession();
  }, []);

  // Scroll to bottom of chat whenever messages or chat loading state changes
  useEffect(() => {
    const chatContainer = document.getElementById('chat-messages-container');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  const lastScrollYRef = React.useRef(0);
  // Sticky header scroll behavior (auto-hide when scrolling down, show when scrolling up)
  useEffect(() => {
    const handleScrollHeader = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollYRef.current && currentScrollY > 80) {
        setShouldHideHeader(true);
      } else {
        setShouldHideHeader(false);
      }
      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScrollHeader, { passive: true });
    return () => window.removeEventListener('scroll', handleScrollHeader);
  }, [currentView]);

  // Section-by-section background shift
  useEffect(() => {
    if (currentView !== 'landing') return;

    const sections = [
      'section-hero',
      'section-reasoning',
      'section-how-works',
      'section-clarity',
      'section-balance',
      'section-resilience',
      'section-cta'
    ];

    const handleScrollBackground = () => {
      const viewportHeight = window.innerHeight;
      let currentActive = 0;
      let minDistance = Infinity;

      sections.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - viewportHeight / 2);
          if (distance < minDistance) {
            minDistance = distance;
            currentActive = idx;
          }
        }
      });

      setActiveBgIndex(currentActive);
    };

    window.addEventListener('scroll', handleScrollBackground, { passive: true });
    handleScrollBackground();
    return () => window.removeEventListener('scroll', handleScrollBackground);
  }, [currentView]);

  // Focus Timer mode-change duration update
  useEffect(() => {
    if (!timerIsActive) {
      setTimeLeft(timerMode === 'work' ? 25 * 60 : 5 * 60);
    }
  }, [timerMode, timerIsActive]);

  // Focus Timer tick and mode transition when reaching 0
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerIsActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerIsActive) {
      setTimerIsActive(false);
      if (timerMode === 'work') {
        setTimerMode('rest');
        setTimeLeft(5 * 60);
      } else {
        setTimerMode('work');
        setTimeLeft(25 * 60);
      }
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [timerIsActive, timeLeft, timerMode]);

  const handleResetTimer = () => {
    setTimerIsActive(false);
    setTimeLeft(timerMode === 'work' ? 25 * 60 : 5 * 60);
  };

  // Handler to send message to Coach
  const handleSendChatMessage = async (text: string) => {
    if (!text.trim() || !user || chatLoading) return;

    // Save user message
    const userMsg = await saveChatMessage(user.id, 'user', text.trim());
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Context building
      const commitmentsContext = commitments.map(c => ({
        title: c.title,
        deadline: c.deadline,
        priority: c.priority,
        progress: c.progress,
        status: c.status,
      }));

      const today = new Date().toDateString();
      const todayIncompleteHighTasks = allTasks.filter(t => {
        if (t.completed) return false;
        if (t.priority !== 'critical' && t.priority !== 'high') return false;
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === today;
      }).map(t => ({
        title: t.title,
        priority: t.priority,
        impactLevel: t.impactLevel,
        estimatedMinutes: t.estimatedMinutes,
        dueDate: t.dueDate,
      }));

      const response = await fetch('/api/coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          commitments: commitmentsContext,
          incompleteTasks: todayIncompleteHighTasks,
        }),
      });

      if (!response.ok) {
        throw new Error('Coach API failed');
      }

      const data = await response.json();
      const coachMsg = await saveChatMessage(user.id, 'assistant', data.reply);
      setChatMessages(prev => [...prev, coachMsg]);
    } catch (err) {
      console.error('Error in coach chat handler:', err);
      // Fallback
      let fallbackText = "I'm having trouble connecting right now — in the meantime, make sure you keep the momentum going on your goals!";
      
      const today = new Date().toDateString();
      const todayIncompleteHighTasks = allTasks.filter(t => {
        if (t.completed) return false;
        if (t.priority !== 'critical' && t.priority !== 'high') return false;
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === today;
      });

      if (todayIncompleteHighTasks.length > 0) {
        const highestPriorityTask = todayIncompleteHighTasks[0];
        fallbackText = `I'm having trouble connecting right now — in the meantime, focus on "${highestPriorityTask.title}", since it has the nearest deadline.`;
      } else {
        const anyIncompleteHigh = allTasks.filter(t => !t.completed && (t.priority === 'critical' || t.priority === 'high'));
        if (anyIncompleteHigh.length > 0) {
          fallbackText = `I'm having trouble connecting right now — in the meantime, focus on "${anyIncompleteHigh[0].title}", since it has the nearest deadline.`;
        }
      }

      const fallbackMsg = await saveChatMessage(user.id, 'assistant', fallbackText);
      setChatMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  // Sync / refresh commitment lists
  const refreshCommitments = async () => {
    if (user) {
      setLoadingTasks(true);
      try {
        const list = await getCommitments(user.id);
        setCommitments(list);
        if (list.length > 0) {
          const tasks = await getAllTasksForCommitments(list.map(c => c.id));
          setAllTasks(tasks);
        } else {
          setAllTasks([]);
        }
      } catch (err) {
        console.error('Failed to refresh commitments and tasks', err);
      } finally {
        setLoadingTasks(false);
      }
    }
  };

  // Seed data trigger
  const handleSeedDemoData = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      await seedDemoCommitments(user.id);
      await refreshCommitments();
    } catch (err) {
      console.error('Seeding failed', err);
    } finally {
      setSeeding(false);
    }
  };

  // Form submission: plan generation & save flow
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.title || !formData.deadline) {
      setSubmitError('Commitment Name and Deadline are required fields.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Call server-side Gemini generation
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          deadline: formData.deadline,
          availableTime: formData.availableTime,
          priority: formData.priority,
        }),
      });

      if (!response.ok) {
        throw new Error('Server returned an error while generating your plan.');
      }

      const generatedPlan = await response.json();

      // 2. Save commitment & tasks to Firestore database
      const { commitmentId } = await saveCommitmentAndTasks(
        user.id,
        {
          title: formData.title,
          description: formData.description,
          deadline: formData.deadline,
          availableTime: formData.availableTime,
          priority: formData.priority,
          summary: generatedPlan.summary,
          milestones: generatedPlan.milestones,
          priorityLogic: generatedPlan.priorityLogic,
        },
        generatedPlan.tasks
      );

      // Refresh commitments list in background
      await refreshCommitments();

      // Retrieve full data to display
      const savedCommitments = await getCommitments(user.id);
      const match = savedCommitments.find((c) => c.id === commitmentId);
      if (match) {
        const tasks = await getTasksForCommitment(commitmentId);
        setSelectedCommitment(match);
        setSelectedTasks(tasks);
        
        // Reset form
        setFormData({
          title: '',
          description: '',
          deadline: '',
          availableTime: '',
          priority: 'medium',
        });

        // Navigate to Plan View
        setCurrentView('plan');
      } else {
        throw new Error('Saved commitment could not be verified in store.');
      }

    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message || 'An unexpected error occurred during planning.');
    } finally {
      setSubmitting(false);
    }
  };

  // Selects an existing commitment from the list and displays its plan
  const handleSelectCommitment = async (commitment: Commitment) => {
    setLoadingPlanDetails(true);
    setSelectedCommitment(commitment);
    try {
      const tasks = await getTasksForCommitment(commitment.id);
      setSelectedTasks(tasks);
      setCurrentView('plan');
    } catch (err) {
      console.error('Error loading tasks for saved commitment', err);
    } finally {
      setLoadingPlanDetails(false);
    }
  };

  // Permanently deletes a commitment and all its tasks
  const handleDeleteCommitment = async (commitmentId: string) => {
    try {
      await deleteCommitmentAndTasks(commitmentId);
      setCommitments(prev => prev.filter(c => c.id !== commitmentId));
      setAllTasks(prev => prev.filter(t => t.commitmentId !== commitmentId));
      if (selectedCommitment?.id === commitmentId) {
        setSelectedCommitment(null);
        setSelectedTasks([]);
      }
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Failed to delete commitment:', err);
      alert('Could not delete commitment. Please try again.');
    }
  };

  // Permanently deletes all commitments and tasks for the current guest user
  const handleResetAllData = async () => {
    if (!user) return;
    try {
      setLoadingTasks(true);
      await resetUserSessionData(user.id);
      setCommitments([]);
      setAllTasks([]);
      setSelectedCommitment(null);
      setSelectedTasks([]);
      setConfirmDeleteId(null);
      setShowResetConfirm(false);
    } catch (err) {
      console.error('Failed to reset all data:', err);
      alert('Could not reset data. Please try again.');
    } finally {
      setLoadingTasks(false);
    }
  };

  // Toggle task completion and update database
  const handleToggleTask = async (taskId: string, commitmentId: string) => {
    // 1. Determine next completed state
    const taskInAll = allTasks.find(t => t.id === taskId);
    const taskInSelected = selectedTasks.find(t => t.id === taskId);
    const currentlyCompleted = taskInAll ? taskInAll.completed : (taskInSelected ? taskInSelected.completed : false);
    const nextCompletedState = !currentlyCompleted;

    // 2. Optimistic state updates
    setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: nextCompletedState } : t));
    setSelectedTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: nextCompletedState } : t));

    // Recalculate and update local commitments array progress on the fly
    setCommitments(prevCommitments => {
      return prevCommitments.map(c => {
        if (c.id === commitmentId) {
          const tasksForThisCommitment = allTasks.map(t => t.id === taskId ? { ...t, completed: nextCompletedState } : t)
                                                .filter(t => t.commitmentId === commitmentId);
          const total = tasksForThisCommitment.length;
          const completedCount = tasksForThisCommitment.filter(t => t.completed).length;
          const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;
          const status = progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending';
          return { ...c, progress, status };
        }
        return c;
      });
    });

    // Recalculate selected commitment if currently active in plan view
    if (selectedCommitment && selectedCommitment.id === commitmentId) {
      setSelectedCommitment(prev => {
        if (!prev) return null;
        const tasksForThisCommitment = selectedTasks.map(t => t.id === taskId ? { ...t, completed: nextCompletedState } : t);
        const total = tasksForThisCommitment.length;
        const completedCount = tasksForThisCommitment.filter(t => t.completed).length;
        const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;
        const status = progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending';
        return { ...prev, progress, status };
      });
    }

    // 3. Persist to Firestore
    try {
      await updateTaskCompletion(taskId, commitmentId, nextCompletedState);
    } catch (err) {
      console.error('Failed to update task completion in database:', err);
      // Revert state if error
      setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: currentlyCompleted } : t));
      setSelectedTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: currentlyCompleted } : t));
      await refreshCommitments();
    }
  };

  // Calculated stats for plan view
  const totalMinutes = selectedTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  const confidenceStats = selectedCommitment 
    ? calculateConfidenceScore(totalMinutes, selectedCommitment.availableTime, selectedCommitment.deadline)
    : null;

  // Blockers detection for low confidence priority panel
  const blockerKeywords = [
    'review', 'approval', 'approve', 'submit', 'publishing', 'external', 
    'third-party', 'api key', 'verification', 'verify', 'dependencies', 'deploy', 'app store', 'play store'
  ];
  const flaggedTasks = selectedTasks.filter(t => 
    blockerKeywords.some(keyword => 
      t.title.toLowerCase().includes(keyword) || 
      (t.description && t.description.toLowerCase().includes(keyword))
    )
  );

  const getDynamicSummary = () => {
    if (!selectedCommitment) return "";
    const summaryText = selectedCommitment.summary || "This plan lists sequential tasks to meet your milestone deadline parameters. Execute key deliverables early to construct buffer intervals.";
    if (!confidenceStats) return summaryText;

    const { confidence, estimatedWorkDays, remainingDays } = confidenceStats;

    if (confidence >= 70) {
      return summaryText;
    } else if (confidence >= 40) {
      return `This is an ambitious timeline. Staying disciplined on the critical-priority tasks will be essential to hit your deadline. ${summaryText}`;
    } else {
      const daysNeeded = Math.ceil(estimatedWorkDays - remainingDays);
      const suggestedDateObj = new Date();
      suggestedDateObj.setDate(suggestedDateObj.getDate() + Math.ceil(estimatedWorkDays));
      const suggestedDateString = suggestedDateObj.toLocaleDateString(undefined, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      return `This timeline is not realistic — your estimated effort (${(totalMinutes / 60).toFixed(1)} hrs) is significantly higher than the time you have available. To make this plan feasible, we recommend extending your deadline to ${suggestedDateString} (adding at least ${daysNeeded} day${daysNeeded > 1 ? 's' : ''} of buffer), or descoping to a minimum viable version of this commitment.`;
    }
  };

  const getDynamicPriorityLogic = () => {
    if (!selectedCommitment) return "";
    const logicText = selectedCommitment.priorityLogic || "Tasks have been structured chronologically based on impact-effort ratios, placing high-impact foundation building blocks first to maximize leverage under deadline constraints.";
    if (!confidenceStats) return logicText;

    const { confidence } = confidenceStats;

    if (confidence >= 70) {
      return logicText;
    } else if (confidence >= 40) {
      return `Tight Deadline Priority Shift: With an ambitious timeline, task order is optimized strictly for critical-path execution. Avoid perfectionism and focus entirely on minimum functional requirements. ${logicText}`;
    } else {
      return `CRITICAL OVERALLOCATION DETECTED: Standard prioritization rules are mathematically insufficient because your estimated effort exceeds your available time budget. Descoping or deadline extension is required immediately to make this plan executable. ${logicText}`;
    }
  };

  // --- DASHBOARD CALCULATIONS ---

  // Time-aware greeting
  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Good Morning';
    if (hours < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Helper to calculate exact progress for a single commitment from real task data
  const getCommitmentProgress = (commitmentId: string) => {
    const commitmentTasks = allTasks.filter(t => t.commitmentId === commitmentId);
    if (commitmentTasks.length === 0) return 0;
    const completedCount = commitmentTasks.filter(t => t.completed).length;
    return Math.round((completedCount / commitmentTasks.length) * 100);
  };

  // Zenith Score: rounded (total completed tasks across all commitments / total tasks across all commitments) * 100
  const totalTasksCount = allTasks.length;
  const completedTasksCount = allTasks.filter(t => t.completed).length;
  const momentumScore = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  // Today's / Recommended tasks selection
  const todayTasks = allTasks.filter(task => {
    if (!task.dueDate) return false;
    if (task.completed) return false;
    const d1 = new Date(task.dueDate).toDateString();
    const d2 = new Date().toDateString();
    return d1 === d2;
  });

  const completedTodayTasksCount = allTasks.filter(task => {
    if (!task.dueDate || !task.completed) return false;
    const d1 = new Date(task.dueDate).toDateString();
    const d2 = new Date().toDateString();
    return d1 === d2;
  }).length;

  // If no tasks have explicit due date today, get fallback highest impact tasks ranked by priority, then impact level
  const priorityWeight: Record<Priority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const impactWeight = { high: 3, medium: 2, low: 1 };

  const fallbackTasks = [...allTasks]
    .filter(t => !t.completed)
    .sort((a, b) => {
      const pA = priorityWeight[a.priority] || 0;
      const pB = priorityWeight[b.priority] || 0;
      if (pB !== pA) return pB - pA;
      const iA = impactWeight[a.impactLevel] || 0;
      const iB = impactWeight[b.impactLevel] || 0;
      return iB - iA;
    })
    .slice(0, 5);

  const displayTasks = (todayTasks.length > 0 ? todayTasks : fallbackTasks).filter(t => !t.completed);

  // AI Coach panel contextual logical tips (computed from real commitment/task data)
  const getCoachTips = () => {
    const activeCommitments = commitments.filter(c => getCommitmentProgress(c.id) < 100);
    const tipsList: string[] = [];

    if (activeCommitments.length > 0) {
      // Find commitment with nearest deadline that is not complete
      const sortedByDeadline = [...activeCommitments].sort(
        (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      );
      const nearestCommitment = sortedByDeadline[0];
      const nearestProgress = getCommitmentProgress(nearestCommitment.id);
      
      tipsList.push(
        `"${nearestCommitment.title}" has the closest deadline (${new Date(
          nearestCommitment.deadline
        ).toLocaleDateString()}) with only ${nearestProgress}% completed tasks. Consider prioritizing its high-impact tasks today.`
      );

      // Find commitment with lowest progress
      const sortedByProgress = [...activeCommitments].sort(
        (a, b) => getCommitmentProgress(a.id) - getCommitmentProgress(b.id)
      );
      const lowestProgressCommitment = sortedByProgress[0];
      
      if (lowestProgressCommitment.id !== nearestCommitment.id) {
        const lowestProgress = getCommitmentProgress(lowestProgressCommitment.id);
        tipsList.push(
          `"${lowestProgressCommitment.title}" has your lowest completion rate at ${lowestProgress}%. Completing one simple task can restart your momentum.`
        );
      } else if (activeCommitments.length > 1) {
        const secondNearest = sortedByDeadline[1];
        const secondProgress = getCommitmentProgress(secondNearest.id);
        tipsList.push(
          `"${secondNearest.title}" is your next chronological focus with ${secondProgress}% progress. Keep a steady pace to prevent last-minute stress.`
        );
      } else {
        tipsList.push(
          "Consistent small steps lead to massive outcomes. Focus on checking off 1-2 small action tasks to maintain a high Zenith Score!"
        );
      }
    } else if (commitments.length > 0) {
      tipsList.push(
        "Sensational work! You have completed 100% of your current commitments. Enjoy this perfect run, and click 'Add Commitment' when you are ready to conquer your next objective."
      );
    } else {
      tipsList.push(
        "Welcome to your Zenith workspace. Add a commitment or load the demo files to see the analytical planning engines in action!"
      );
    }
    return tipsList;
  };

  const coachTips = getCoachTips();

  // Find the single highest-impact incomplete task right now
  const getSmartReminder = () => {
    const activeCommitments = commitments.filter(c => getCommitmentProgress(c.id) < 100);
    if (activeCommitments.length === 0) return null;

    // Sort commitments:
    // 1. Nearest deadline (earliest time first)
    // 2. Lowest progress (lowest percentage first)
    const sortedCommitments = [...activeCommitments].sort((a, b) => {
      const deadlineA = new Date(a.deadline).getTime();
      const deadlineB = new Date(b.deadline).getTime();
      if (deadlineA !== deadlineB) {
        return deadlineA - deadlineB;
      }
      const progressA = getCommitmentProgress(a.id);
      const progressB = getCommitmentProgress(b.id);
      return progressA - progressB;
    });

    for (const commitment of sortedCommitments) {
      const commitmentTasks = allTasks.filter(t => t.commitmentId === commitment.id && !t.completed);
      if (commitmentTasks.length > 0) {
        // Sort tasks by priority (critical, high, medium, low)
        const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        const sortedTasks = [...commitmentTasks].sort((a, b) => {
          const weightA = priorityWeight[a.priority] || 0;
          const weightB = priorityWeight[b.priority] || 0;
          return weightB - weightA;
        });
        return {
          task: sortedTasks[0],
          commitment
        };
      }
    }
    return null;
  };

  const smartReminder = getSmartReminder();

  const getSmartReminderWhy = (task: Task, commitment: Commitment) => {
    const formattedDeadline = new Date(commitment.deadline).toLocaleDateString();
    if (task.priority === 'critical' || task.priority === 'high') {
      return `Resolving this ${task.priority} priority item keeps your "${commitment.title}" on schedule for its upcoming deadline of ${formattedDeadline}.`;
    }
    return `Completing this task is the highest-leverage step today to maintain steady momentum toward "${commitment.title}" (due ${formattedDeadline}).`;
  };

  // Upcoming non-complete commitments by deadline
  const upcomingCommitments = [...commitments]
    .filter(c => getCommitmentProgress(c.id) < 100)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 3);

  const activeCommitments = commitments.filter(c => getCommitmentProgress(c.id) < 100);
  const completedCommitments = commitments.filter(c => getCommitmentProgress(c.id) === 100);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-tr from-[#F7CAC9]/25 via-[#F7F9FC]/90 to-[#92A8D1]/25 text-slate-900 font-sans" id="app-root">
      
      {/* Dynamic Header */}
      <header 
        className={`h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 sticky top-0 z-50 flex items-center justify-between shrink-0 transition-transform duration-300 ease-in-out ${
          shouldHideHeader ? '-translate-y-full shadow-none' : 'translate-y-0'
        }`} 
        id="app-header"
      >
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentView('landing')}>
            <div className="w-8 h-8 bg-[#6C5CE7]/10 rounded-lg flex items-center justify-center shadow-sm border border-[#6C5CE7]/25">
              <MountainSnow className="w-4 h-4 text-[#6C5CE7]" />
            </div>
            <div>
              <span className="font-wordmark text-[32.92px] leading-[44.88px] tracking-normal bg-gradient-to-r from-[#6C5CE7] to-[#0F172A] bg-clip-text text-transparent inline-block pl-[6px] w-[88.425px] h-[41.8875px] font-normal">Zenith</span>
            </div>
          </div>

          <nav className="flex items-center gap-6">
            <span 
              onClick={() => setCurrentView('dashboard')}
              className={`text-sm font-medium cursor-pointer transition-colors ${
                currentView === 'dashboard' 
                  ? 'text-[#6C5CE7] font-semibold border-b-2 border-[#6C5CE7] h-16 flex items-center' 
                  : 'text-slate-500 hover:text-slate-900 h-16 flex items-center'
              }`}
            >
              Dashboard
            </span>
            <span 
              onClick={() => setCurrentView('create')}
              className={`text-sm font-medium cursor-pointer transition-colors ${
                currentView === 'create' 
                  ? 'text-[#6C5CE7] font-semibold border-b-2 border-[#6C5CE7] h-16 flex items-center' 
                  : 'text-slate-500 hover:text-slate-900 h-16 flex items-center'
              }`}
            >
              Add Commitment
            </span>
            {selectedCommitment && (
              <span 
                onClick={() => setCurrentView('plan')}
                className={`text-sm font-medium cursor-pointer transition-colors ${
                  currentView === 'plan' 
                    ? 'text-[#6C5CE7] font-semibold border-b-2 border-[#6C5CE7] h-16 flex items-center' 
                    : 'text-slate-500 hover:text-slate-900 h-16 flex items-center'
                }`}
              >
                AI Plan View
              </span>
            )}

            <span 
              onClick={() => setCurrentView('calendar')}
              className={`text-sm font-medium cursor-pointer transition-colors ${
                currentView === 'calendar' 
                  ? 'text-[#6C5CE7] font-semibold border-b-2 border-[#6C5CE7] h-16 flex items-center' 
                  : 'text-slate-500 hover:text-slate-900 h-16 flex items-center'
              }`}
            >
              Calendar
            </span>

            <span 
              onClick={() => setCurrentView('coach')}
              className={`text-sm font-medium cursor-pointer transition-colors ${
                currentView === 'coach' 
                  ? 'text-[#6C5CE7] font-semibold border-b-2 border-[#6C5CE7] h-16 flex items-center' 
                  : 'text-slate-500 hover:text-slate-900 h-16 flex items-center'
              }`}
            >
              AI Coach
            </span>

            {user && (
              <div className="hidden md:flex items-center space-x-1.5 bg-slate-50 py-1 px-2.5 rounded-full text-[11px] font-medium text-slate-500 border border-slate-200">
                <span className="w-1.5 h-1.5 bg-[#6C5CE7] rounded-full animate-pulse"></span>
                <span>{user.name}</span>
              </div>
            )}


          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main 
        className={`flex-1 w-full ${
          currentView === 'landing' 
            ? 'p-0 m-0 max-w-none' 
            : 'max-w-7xl mx-auto px-4 pt-4 pb-8 sm:px-6 md:pt-6 md:pb-12'
        }`} 
        id="main-content"
      >
        
        <AnimatePresence mode="wait">
          
          {/* LANDING PAGE VIEW */}
          {currentView === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className={`w-full transition-colors duration-1000 ease-in-out ${
                activeBgIndex === 0 ? 'bg-[#FAF8F5]' :
                activeBgIndex === 1 ? 'bg-[#F4F1FC]' :
                activeBgIndex === 2 ? 'bg-[#F0F4F8]' :
                activeBgIndex === 3 ? 'bg-[#FDFBF7]' :
                activeBgIndex === 4 ? 'bg-[#FAF5F0]' :
                activeBgIndex === 5 ? 'bg-[#F5F2FC]' :
                'bg-[#FAF8F5]'
              }`}
            >
              {/* ONBOARDING LANDING PAGE */}
              <div className="space-y-0" id="landing-hero-container">
                
                {/* SECTION 1: HERO */}
                <section 
                  id="section-hero" 
                  className="w-full min-h-[75vh] sm:min-h-[80vh] flex flex-col justify-center items-center pt-12 pb-16 sm:pt-16 sm:pb-20 md:pt-20 md:pb-24 px-6 sm:px-8 relative"
                >
                  <div className="max-w-5xl mx-auto text-center space-y-8 relative z-10">

                    <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-medium tracking-tight text-[#0F172A] leading-[1.1] sm:leading-tight">
                      Conquer your deadlines. <br className="hidden sm:block" />
                      <span className="text-[#6C5CE7]">Build unstoppable momentum.</span>
                    </h1>
                    <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed font-normal tracking-wide">
                      Zenith empowers students, professionals, and entrepreneurs to conquer deadlines. Moving beyond passive reminders, it transforms commitments into adaptive action plans — proactively prioritizing tasks, restructuring schedules, and guiding users step-by-step to finish work on time with greater confidence and less stress.
                    </p>

                    <div className="pt-6 flex flex-col sm:flex-row justify-center items-center gap-4">
                      <button
                        id="hero-get-started-btn"
                        onClick={() => setCurrentView('create')}
                        className="w-full sm:w-auto px-10 py-4 bg-[#0F172A] hover:bg-[#1e293b] text-white font-semibold rounded-2xl shadow-lg transition-all transform hover:-translate-y-0.5 flex items-center justify-center space-x-2.5 cursor-pointer text-base"
                      >
                        <span>Get Started</span>
                        <ArrowRight className="w-5 h-5 text-[#A29BFE]" />
                      </button>

                      {commitments.length > 0 && (
                        <button
                          onClick={() => setCurrentView('dashboard')}
                          className="w-full sm:w-auto px-8 py-4 bg-[#6C5CE7]/10 text-[#6C5CE7] font-semibold border border-[#6C5CE7]/30 rounded-2xl hover:bg-[#6C5CE7]/20 transition-all flex items-center justify-center space-x-2 cursor-pointer text-base"
                        >
                          <TrendingUp className="w-5 h-5" />
                          <span>Go to Dashboard</span>
                        </button>
                      )}


                    </div>
                  </div>
                </section>

                {/* SECTION 2: EVERY PLAN COMES WITH ITS REASONING */}
                <section 
                  id="section-reasoning" 
                  className="w-full py-12 md:py-16 px-6 sm:px-8 relative"
                >
                  <div className="max-w-6xl mx-auto w-full relative z-10" id="product-preview-section">
                    <div className="text-center mb-8">
                      <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-display font-semibold text-[#0F172A] leading-tight tracking-tight">Every plan comes with its reasoning.</h2>
                    </div>
                  
                    {/* Browser Frame */}
                    <div className="bg-white rounded-2xl border border-slate-300/80 shadow-[0_20px_50px_rgba(0,0,0,0.06)] hover:shadow-[0_30px_70px_rgba(108,92,231,0.1)] transition-all duration-500 ease-out hover:-translate-y-1 overflow-hidden">
                      {/* Browser Content - Replica of the App's Actual Plan View */}
                      <div className="p-4 sm:p-6 md:p-6 bg-[#faf8f5] space-y-5 text-left">
                        {/* Title block replica */}
                        <div className="bg-white border border-slate-150 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-sm">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono">
                                Academic Milestone
                              </span>
                              <span className="text-[9px] text-slate-400 font-mono font-bold">Research & Writing</span>
                            </div>
                            <h4 className="font-display font-bold text-lg text-[#0F172A]">Master's Thesis: AI Ethics</h4>
                          </div>
                          
                          {/* Available Hours */}
                          <div className="bg-slate-50 border border-slate-150 rounded-xl px-3.5 py-2 text-xs flex items-center gap-2 shadow-2xs">
                            <Clock className="w-4 h-4 text-[#6C5CE7]" />
                            <div>
                              <div className="text-[8px] uppercase font-mono text-slate-400 font-bold">Time Budget</div>
                              <div className="font-bold text-slate-700">2 hours/day</div>
                            </div>
                          </div>
                        </div>

                        {/* Progress & Confidence replica */}
                        <div className="bg-white border border-slate-150 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
                          <div className="space-y-0.5 text-center md:text-left">
                            <div className="inline-flex items-center space-x-1.5 bg-[#F0EEFF] py-0.5 px-2.5 rounded-full text-[10px] font-bold text-[#6C5CE7] font-mono">
                              <TrendingUp className="w-3 h-3" />
                              <span>Success Predictor</span>
                            </div>
                            <p className="text-slate-500 text-xs mt-0.5">Comparing estimated study hours against remaining days.</p>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <div className="text-[9px] font-mono uppercase text-slate-400 font-bold">Confidence Score</div>
                              <div className="text-sm font-bold text-[#6C5CE7]">89% (High Confidence)</div>
                            </div>
                            <div className="w-10 h-10 rounded-full border-4 border-[#F0EEFF] border-t-[#6C5CE7] flex items-center justify-center text-xs font-bold text-slate-700 font-mono">
                              89
                            </div>
                          </div>
                        </div>

                        {/* Two Column Layout replica */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                          {/* Left Side: Tasks replica */}
                          <div className="lg:col-span-7 space-y-3">
                            <div className="bg-white border border-slate-150 rounded-xl p-4 space-y-3 shadow-sm">
                              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Plan Deliverables</span>
                                <span className="text-[10px] font-semibold text-slate-500 font-mono">2 / 4 Completed</span>
                              </div>
                            
                            {/* Task 1 (Completed) */}
                            <div className="flex items-start gap-2.5 p-2 bg-slate-50/50 rounded-lg border border-slate-150/50 font-sans">
                              <div className="w-4 h-4 rounded-full bg-[#6C5CE7] text-white flex items-center justify-center text-[9px] shrink-0 mt-0.5">✓</div>
                              <div>
                                <h5 className="text-xs font-semibold text-slate-500 line-through font-sans">Literature review & thesis outline</h5>
                                <p className="text-[10px] text-slate-400">Completed 1 day ahead of milestones</p>
                              </div>
                            </div>

                            {/* Task 2 (Completed) */}
                            <div className="flex items-start gap-2.5 p-2 bg-slate-50/50 rounded-lg border border-slate-150/50 font-sans">
                              <div className="w-4 h-4 rounded-full bg-[#6C5CE7] text-white flex items-center justify-center text-[9px] shrink-0 mt-0.5">✓</div>
                              <div>
                                <h5 className="text-xs font-semibold text-slate-500 line-through font-sans">Establish bias assessment metrics for dataset</h5>
                                <p className="text-[10px] text-slate-400">Completed on track</p>
                              </div>
                            </div>

                            {/* Task 3 (Active) */}
                            <div className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-[#6C5CE7]/30 shadow-2xs font-sans">
                              <div className="w-4 h-4 rounded-full border border-slate-300 bg-white shrink-0 mt-0.5"></div>
                              <div>
                                <h5 className="text-xs font-semibold text-slate-700 font-sans">Draft Chapter 3: Methodology & testing framework</h5>
                                <p className="text-[10px] text-slate-500">In Progress — 45 mins estimated</p>
                              </div>
                            </div>

                            {/* Task 4 (Upcoming) */}
                            <div className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-slate-150 font-sans">
                              <div className="w-4 h-4 rounded-full border border-slate-300 bg-white shrink-0 mt-0.5"></div>
                              <div>
                                <h5 className="text-xs font-semibold text-slate-600 font-sans">Conduct statistical variance evaluation against control group</h5>
                                <p className="text-[10px] text-slate-400">Pending previous completion — 1.5 hours estimated</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Priority Logic replica */}
                        <div className="lg:col-span-5">
                          <div className="bg-[#0F172A] text-white p-4.5 rounded-xl border border-white/10 h-full flex flex-col justify-between shadow-lg relative overflow-hidden font-sans">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-[#6C5CE7] opacity-20 blur-2xl"></div>
                            
                            <div className="space-y-4">
                              <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
                                <div className="w-5.5 h-5.5 bg-white/10 rounded flex items-center justify-center text-[#A29BFE]">
                                  <Lightbulb className="w-3 h-3" />
                                </div>
                                <h5 className="text-[9px] font-bold text-[#A29BFE] uppercase tracking-widest font-mono">AI Priority Logic</h5>
                              </div>

                              <div className="space-y-1.5">
                                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold font-mono">Strategic Rationale</p>
                                <p className="text-xs text-slate-200 leading-relaxed font-sans">
                                  The sequence establishes theoretical boundaries first to eliminate conceptual drift. Bias metric definitions run parallel to decouple evaluation and coding phases.
                                </p>
                              </div>
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-slate-300 leading-relaxed space-y-1 mt-4">
                              <div className="font-bold flex items-center gap-1.5 text-white">
                                <span className="text-[#A29BFE]">💡</span>
                                <span className="text-xs">Strategy Note:</span>
                              </div>
                              <p className="text-slate-300 text-[11px] leading-normal font-sans">
                                We reserved the last 15% of your available daily budget to accommodate thesis formatting and citation reviews.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* HOW IT WORKS SECTION */}
              <section 
                id="section-how-works" 
                className="w-full min-h-[85vh] flex flex-col justify-center py-28 sm:py-36 md:py-44 px-6 sm:px-8 relative overflow-visible z-10"
              >
                  {/* Wave shape overlay spanning full width of parent (which is max-w-7xl or breakout) */}
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-48 sm:h-56 pointer-events-none overflow-visible">
                    <svg className="w-full h-full opacity-80" viewBox="0 0 1440 240" fill="none" preserveAspectRatio="none">
                      {/* Multiple intersecting flowing strokes/ribbons */}
                      <path
                        d="M 0 110 C 350 30, 650 190, 1000 70 C 1200 30, 1350 130, 1440 90"
                        stroke="url(#wave-grad-1)"
                        strokeWidth="10"
                        strokeLinecap="round"
                        opacity="0.22"
                      />
                      <path
                        d="M 0 130 C 400 170, 750 50, 1100 150 C 1250 190, 1380 90, 1440 110"
                        stroke="url(#wave-grad-2)"
                        strokeWidth="14"
                        strokeLinecap="round"
                        opacity="0.25"
                      />
                      <path
                        d="M 0 90 C 250 150, 550 90, 850 130 C 1100 170, 1280 70, 1440 80"
                        stroke="url(#wave-grad-1)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        opacity="0.12"
                      />
                      <path
                        d="M 0 150 C 300 210, 600 90, 950 170 C 1150 210, 1320 110, 1440 120"
                        stroke="url(#wave-grad-3)"
                        strokeWidth="18"
                        strokeLinecap="round"
                        opacity="0.16"
                      />
                      
                      <defs>
                        <linearGradient id="wave-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#92A8D1" />
                          <stop offset="50%" stopColor="#F7CAC9" />
                          <stop offset="100%" stopColor="#92A8D1" />
                        </linearGradient>
                        <linearGradient id="wave-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#F7CAC9" />
                          <stop offset="40%" stopColor="#92A8D1" />
                          <stop offset="70%" stopColor="#F7CAC9" />
                          <stop offset="100%" stopColor="#92A8D1" />
                        </linearGradient>
                        <linearGradient id="wave-grad-3" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#92A8D1" stopOpacity="0.4" />
                          <stop offset="50%" stopColor="#F7CAC9" />
                          <stop offset="100%" stopColor="#92A8D1" stopOpacity="0.4" />
                        </linearGradient>
                      </defs>
                    </svg>
                    
                    {/* Floating Sparkles and Stars (as in reference image, nice yellow/golden pop accents) */}
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Elegant gold star top-left */}
                      <div className="absolute top-2 left-[5%] text-[#F1C40F] opacity-95 animate-pulse">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                          <path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"/>
                        </svg>
                      </div>
                      {/* Tiny orange dot next to the gold star */}
                      <div className="absolute top-7 left-[8%] w-1.5 h-1.5 rounded-full bg-orange-400 opacity-80 animate-ping" style={{ animationDuration: '3s' }}></div>
                      
                      {/* Elegant gold star top-right */}
                      <div className="absolute top-6 right-[15%] text-[#F1C40F] opacity-95 animate-pulse" style={{ animationDelay: '1s' }}>
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                          <path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"/>
                        </svg>
                      </div>
                      {/* Tiny orange dot next to right gold star */}
                      <div className="absolute top-12 right-[17%] w-1.5 h-1.5 rounded-full bg-orange-400 opacity-80"></div>

                      {/* Small soft Sparkle middle-left */}
                      <div className="absolute bottom-4 left-[20%] text-[#92A8D1] opacity-60">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      {/* Tiny orange dot below middle-left Sparkle */}
                      <div className="absolute bottom-10 left-[18%] w-2 h-2 rounded-full bg-orange-300 opacity-70"></div>
                      
                      {/* Small tick or dot middle-right */}
                      <div className="absolute bottom-6 right-[8%] w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/50 flex items-center justify-center text-[10px] shadow-2xs">✓</div>
                      <div className="absolute bottom-2 right-[11%] w-1.5 h-1.5 rounded-full bg-orange-400 opacity-80"></div>

                      {/* Small orange circle with plus on the left */}
                      <div className="absolute bottom-8 left-[12%] w-5 h-5 rounded-full bg-rose-100 text-rose-500 border border-rose-200/50 flex items-center justify-center text-[10px] shadow-2xs font-bold">+</div>
                    </div>
                  </div>

                  {/* Content wrapper with max-w constraint, beautifully centered on top of the wave */}
                  <div className="max-w-6xl mx-auto px-4 relative z-10">
                    <div className="text-center mb-16">
                      <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-[#0F172A] mt-2 tracking-tight">How Zenith works</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                      {/* Step 1 */}
                      <div className="space-y-4 text-center md:text-left px-4">
                        <div className="text-base font-bold font-mono text-[#6C5CE7] bg-[#F0EEFF] w-10 h-10 rounded-full flex items-center justify-center mx-auto md:mx-0 shadow-xs border border-[#D9D6FF]">
                          1
                        </div>
                        <h3 className="font-display font-semibold text-xl sm:text-2xl text-[#0F172A]">Add a commitment</h3>
                        <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
                          Input your target milestone, deadline, and available hours. Keep it simple and fluid.
                        </p>
                      </div>

                      {/* Step 2 */}
                      <div className="space-y-4 text-center md:text-left px-4">
                        <div className="text-base font-bold font-mono text-[#6C5CE7] bg-[#F0EEFF] w-10 h-10 rounded-full flex items-center justify-center mx-auto md:mx-0 shadow-xs border border-[#D9D6FF]">
                          2
                        </div>
                        <h3 className="font-display font-semibold text-xl sm:text-2xl text-[#0F172A]">AI builds your plan</h3>
                        <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
                          Our AI organizes your tasks by what matters most, and tells you how realistic your timeline is.
                        </p>
                      </div>

                      {/* Step 3 */}
                      <div className="space-y-4 text-center md:text-left px-4">
                        <div className="text-base font-bold font-mono text-[#6C5CE7] bg-[#F0EEFF] w-10 h-10 rounded-full flex items-center justify-center mx-auto md:mx-0 shadow-xs border border-[#D9D6FF]">
                          3
                        </div>
                        <h3 className="font-display font-semibold text-xl sm:text-2xl text-[#0F172A]">AI adapts when life happens</h3>
                        <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
                          If something gets in your way, just tell us. We'll instantly rework your plan to protect your deadline.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* SaaS Feature Sections (replaces features-grid) */}
                <div className="space-y-0 relative z-10" id="features-showcase">
                  
                  {/* SECTION 1 — AI Plan View */}
                  <section 
                    id="section-clarity" 
                    className="w-full min-h-screen flex flex-col justify-center py-36 sm:py-48 md:py-56 px-6 sm:px-8 relative"
                  >
                    <div className="max-w-6xl mx-auto w-full relative z-10">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 items-center">
                    {/* Visual Screen Replica (Left) */}
                    <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.05)] hover:shadow-[0_30px_70px_rgba(108,92,231,0.1)] transition-all duration-500 hover:-translate-y-1.5 p-6 sm:p-8 overflow-hidden">
                      <div className="space-y-6 font-sans">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                          <div className="flex items-center gap-2.5">
                            <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md font-mono">
                              AI Generated Plan
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono font-bold">Freelance Project</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                            <span className="text-[11px] font-bold text-slate-500 font-mono">Optimized</span>
                          </div>
                        </div>

                        {/* Plan Header */}
                        <div className="flex justify-between items-center bg-slate-50 border border-slate-150 p-4.5 rounded-2xl shadow-2xs">
                          <div>
                            <span className="text-[10px] uppercase font-mono text-slate-400 font-bold">Current Goal</span>
                            <h4 className="font-display font-bold text-base text-[#0F172A]">Mobile App Design System</h4>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-mono text-slate-400 font-bold">Confidence</span>
                            <div className="text-sm font-bold text-[#6C5CE7] font-mono">96% (Very High)</div>
                          </div>
                        </div>

                        {/* List of Tasks */}
                        <div className="space-y-3">
                          <div className="flex items-start gap-4 p-3 bg-slate-50/50 rounded-xl border border-slate-150/50">
                            <div className="w-5 h-5 rounded-full bg-[#6C5CE7] text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold">✓</div>
                            <div className="flex-1">
                              <h5 className="text-sm font-semibold text-slate-400 line-through">Review client brief & specifications</h5>
                              <p className="text-[10px] text-slate-400">Completed 1 day ahead</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-4 p-3 bg-white rounded-xl border border-[#6C5CE7]/30 shadow-2xs">
                            <div className="w-5 h-5 rounded-full border border-slate-300 bg-white shrink-0 mt-0.5"></div>
                            <div className="flex-1">
                              <h5 className="text-sm font-semibold text-slate-700">Assemble moodboards & design guidelines</h5>
                              <p className="text-[10px] text-slate-500">Active — 45 mins estimated</p>
                            </div>
                            <span className="text-[10px] font-mono text-[#6C5CE7] bg-[#F0EEFF] px-2 py-0.5 rounded font-bold">Today</span>
                          </div>
                          <div className="flex items-start gap-4 p-3 bg-white rounded-xl border border-slate-150">
                            <div className="w-5 h-5 rounded-full border border-slate-300 bg-white shrink-0 mt-0.5"></div>
                            <div className="flex-1">
                              <h5 className="text-sm font-semibold text-slate-600 font-sans">Draft typography & spacing scales</h5>
                              <p className="text-[10px] text-slate-400">Upcoming — 1.5 hours estimated</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Text block (Right) */}
                    <div className="lg:col-span-5 space-y-6 text-left">
                      <div className="inline-flex items-center gap-1.5 bg-[#F0EEFF] text-[#6C5CE7] text-[10px] font-mono uppercase font-bold px-3 py-1.5 rounded-full tracking-wider border border-[#D9D6FF]">
                        01 / CLARITY
                      </div>
                      <h3 className="font-display font-bold text-3xl sm:text-4xl md:text-5xl text-[#0F172A] tracking-tight leading-tight">
                        Clear, stress-free action plans
                      </h3>
                      <p className="text-slate-600 text-base sm:text-lg md:text-xl leading-relaxed">
                        No more guessing how to start. We turn your biggest goals into small, clear steps so you always know your next move.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

                {/* SECTION 2 — Schedules that fit your actual life */}
                <section 
                  id="section-balance" 
                  className="w-full min-h-screen flex flex-col justify-center py-36 sm:py-48 md:py-56 px-6 sm:px-8 relative"
                >
                  <div className="max-w-6xl mx-auto w-full relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 items-center">
                    {/* Text block (Left) - Left-aligned text on large screens */}
                    <div className="lg:col-span-5 space-y-6 text-left order-2 lg:order-1">
                      <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-[10px] font-mono uppercase font-bold px-3 py-1.5 rounded-full tracking-wider border border-amber-200/50">
                        02 / BALANCE
                      </div>
                      <h3 className="font-display font-bold text-3xl sm:text-4xl md:text-5xl text-[#0F172A] tracking-tight leading-tight">
                        Schedules that fit your actual life
                      </h3>
                      <p className="text-slate-600 text-base sm:text-lg md:text-xl leading-relaxed">
                        Tell us when you are free, and we'll build a realistic plan that fits your exact limits. Achieve more without the overwhelm.
                      </p>
                    </div>

                    {/* Visual Screen Replica (Right) */}
                    <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.05)] hover:shadow-[0_30px_70px_rgba(108,92,231,0.1)] transition-all duration-500 hover:-translate-y-1.5 p-6 sm:p-8 overflow-hidden order-1 lg:order-2">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                          <div className="flex items-center gap-2.5">
                            <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-[#FFF3D6] rounded-md font-mono">
                              Interactive Calendar
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono font-bold">Planned Commitments</span>
                          </div>
                          <span className="text-[11px] font-bold text-slate-500 font-mono">November 2026</span>
                        </div>

                        {/* Calendar replica grid - 7 Column Month/Week Replica */}
                        <div className="grid grid-cols-7 gap-1.5 text-center bg-slate-50/80 rounded-2xl border border-slate-150 p-4 sm:p-5 shadow-2xs font-sans">
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                            <div key={day} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider py-1 font-mono">
                              {day}
                            </div>
                          ))}
                          {[
                            { day: 9, active: false, items: [] },
                            { day: 10, active: false, items: [{ type: 'task', label: 'Outline Thesis', color: 'indigo' }] },
                            { day: 11, active: false, items: [] },
                            { day: 12, active: false, items: [{ type: 'deadline', label: 'Client Contract', color: 'rose' }] },
                            { day: 13, active: false, items: [] },
                            { day: 14, active: false, items: [] },
                            { day: 15, active: false, items: [] },
                            { day: 16, active: false, items: [] },
                            { day: 17, active: true, items: [{ type: 'task', label: 'Draft Intro Sec', color: 'indigo' }] },
                            { day: 18, active: false, items: [] },
                            { day: 19, active: false, items: [{ type: 'task', label: 'Pitch Deck Feedback', color: 'indigo' }] },
                            { day: 20, active: false, items: [{ type: 'deadline', label: 'Thesis Milestone', color: 'rose' }] },
                            { day: 21, active: false, items: [] },
                            { day: 22, active: false, items: [] }
                          ].map((item, idx) => (
                            <div 
                              key={idx}
                              className={`min-h-[60px] sm:min-h-[68px] p-1.5 border rounded-xl flex flex-col justify-between text-left transition-all relative overflow-hidden ${
                                item.active 
                                  ? 'bg-[#F0EEFF]/50 border-[#6C5CE7] ring-1 ring-[#6C5CE7]/30' 
                                  : 'bg-white border-slate-200/80 hover:border-slate-300'
                              }`}
                            >
                              <span className={`text-[10px] font-bold font-mono ${item.active ? 'text-[#6C5CE7]' : 'text-slate-500'}`}>
                                {item.day}
                              </span>
                              <div className="space-y-0.5 mt-1 flex-1 flex flex-col justify-end">
                                {item.items.map((it, iIdx) => (
                                  <div 
                                    key={iIdx} 
                                    className={`text-[8px] leading-tight px-1 py-0.5 rounded truncate font-semibold ${
                                      it.type === 'deadline' 
                                        ? 'bg-rose-50 text-rose-700 border border-rose-100 font-bold' 
                                        : 'bg-[#F0EEFF] text-[#6C5CE7] border border-[#E0DCFF]'
                                    }`}
                                  >
                                    {it.label}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}

                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

                {/* SECTION 3 — Smart adjustments when life happens */}
                <section 
                  id="section-resilience" 
                  className="w-full min-h-screen flex flex-col justify-center py-32 sm:py-40 px-6 sm:px-8 relative"
                >
                  <div className="max-w-6xl mx-auto w-full relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
                      {/* Visual Screen Replica (Left) */}
                      <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.05)] hover:shadow-[0_30px_70px_rgba(108,92,231,0.1)] transition-all duration-500 hover:-translate-y-1.5 p-6 sm:p-8 overflow-hidden order-2 lg:order-1">
                        <div className="space-y-6 font-sans">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div className="flex items-center gap-2.5">
                              <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200/30 rounded-md font-mono">
                                AI Dynamic Replanner
                              </span>
                              <span className="text-[11px] text-rose-500 font-extrabold font-mono uppercase tracking-wider animate-pulse">Conflict Detected!</span>
                            </div>
                            <span className="text-[11px] font-bold text-slate-400 font-mono">Active</span>
                          </div>

                          {/* Strategist Panel */}
                          <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl border border-white/5 shadow-sm relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-[#6C5CE7] opacity-20 blur-2xl"></div>
                            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-3">
                              <Sparkles className="w-4 h-4 text-indigo-300" />
                              <h5 className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest font-mono">AI Strategist Analysis</h5>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
                              "Due to conflict with <strong className="text-white">Dentist Appointment</strong> on Tuesday, I've shifted the moodboard compilation forward to Wednesday while keeping your final design proposal deadline secure."
                            </p>
                          </div>

                          {/* Diff Comparison of task rescheduling */}
                          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 space-y-4 shadow-2xs">
                            <div className="text-[10px] uppercase font-mono text-slate-400 font-bold tracking-wider">Proposed adjustments:</div>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="text-left">
                                <div className="text-xs sm:text-sm font-semibold text-slate-400 line-through">Assemble moodboards & styleguide</div>
                                <div className="text-[10px] sm:text-xs text-slate-400 font-mono mt-0.5">Tuesday, 1:00 PM</div>
                              </div>
                              <div className="text-slate-400 font-mono hidden sm:block">➔</div>
                              <div className="text-left sm:text-right">
                                <div className="text-xs sm:text-sm font-bold text-emerald-800">Assemble moodboards & styleguide</div>
                                <div className="text-[10px] sm:text-xs text-emerald-600 font-semibold flex items-center sm:justify-end gap-1 font-mono mt-0.5">
                                  <Sparkles className="w-3.5 h-3.5 text-[#6C5CE7]" /> Wednesday, 9:00 AM
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Text block (Right) */}
                      <div className="lg:col-span-5 space-y-6 text-left order-1 lg:order-2">
                        <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-mono uppercase font-bold px-3 py-1.5 rounded-full tracking-wider border border-emerald-200/50">
                          03 / RESILIENCE
                        </div>
                        <h3 className="font-display font-medium text-4xl sm:text-5xl md:text-6xl text-slate-900 tracking-tight leading-[1.1]">
                          Smart adjustments when life happens
                        </h3>
                        <p className="text-slate-500 text-base sm:text-lg md:text-xl leading-relaxed max-w-xl">
                          If you fall behind, we don't just send nagging reminders. We rebuild your schedule and adjust your tasks instantly to protect your final deadline. The AI explains its reasoning clearly as it adapts your plan, rather than silently reshuffling tasks behind your back.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* SECTION 4 — Stuck? Don't panic. Just ask. */}
                <section 
                  id="section-guidance" 
                  className="w-full min-h-screen flex flex-col justify-center py-32 sm:py-40 px-6 sm:px-8 relative"
                >
                  <div className="max-w-6xl mx-auto w-full relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
                      
                      {/* Text block (Left) */}
                      <div className="lg:col-span-5 space-y-6 text-left order-2 lg:order-1">
                        <div className="inline-flex items-center gap-1.5 bg-[#F0EEFF] text-[#6C5CE7] text-[10px] font-mono uppercase font-bold px-3 py-1.5 rounded-full tracking-wider border border-[#D9D6FF]/50">
                          04 / GUIDANCE
                        </div>
                        <h3 className="font-display font-medium text-4xl sm:text-5xl md:text-6xl text-slate-900 tracking-tight leading-[1.1]">
                          Stuck? Don't panic. Just ask.
                        </h3>
                        <p className="text-slate-500 text-base sm:text-lg md:text-xl leading-relaxed max-w-xl">
                          When you don't know where to start, Need Help gives you a clear starting point — the right questions to ask, a simple structure to follow, and one next step to take right now. Not a finished answer, just enough to get moving.
                        </p>
                      </div>

                      {/* Visual Screen Replica (Right) */}
                      <div className="lg:col-span-7 flex justify-center order-1 lg:order-2">
                        <div className="rounded-2xl border border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:shadow-[0_30px_70px_rgba(108,92,231,0.12)] transition-all duration-500 hover:-translate-y-1.5 overflow-hidden bg-white max-w-md w-full">
                          {/* Mock Modal Header */}
                          <div className="bg-[#0F172A] text-white p-4 flex justify-between items-center">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-[#A29BFE]" />
                              <span className="font-display font-extrabold text-sm">AI Starting Assistant</span>
                            </div>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div>
                          </div>

                          {/* Mock Modal Body */}
                          <div className="p-4 space-y-4 text-left font-sans">
                            {/* Task details */}
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Task</span>
                              <h4 className="font-display font-extrabold text-xs text-slate-900">Research Competitor Pricing</h4>
                              <p className="text-[10px] text-slate-500">Compare top 3 direct competitors to establish baseline market positioning.</p>
                            </div>

                            {/* Opener */}
                            <div className="bg-[#F0EEFF]/60 border-l-4 border-[#6C5CE7] p-3 rounded-r-xl">
                              <p className="text-[11px] text-slate-700 italic leading-relaxed">
                                "It's totally normal to feel stuck here. Let's strip away the noise and start with what we actually need to answer."
                              </p>
                            </div>

                            {/* Key Questions */}
                            <div className="space-y-1.5">
                              <h5 className="text-[9px] font-bold text-[#6C5CE7] uppercase tracking-wider font-mono flex items-center gap-1">
                                <Target className="w-3.5 h-3.5 text-[#6C5CE7]" />
                                <span>Key Questions to Figure Out</span>
                              </h5>
                              <ul className="space-y-1">
                                {[
                                  "What tier is their most popular package and how much does it cost?",
                                  "What features are locked behind their enterprise tier?",
                                  "Do they offer a free tier, and what are its exact limits?"
                                ].map((q, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5 text-[10px] text-slate-600 leading-normal bg-slate-50 p-1.5 rounded border border-slate-150">
                                    <span className="w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[8px] font-mono font-bold shrink-0">?</span>
                                    <span>{q}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Starting Structure */}
                            <div className="space-y-1.5">
                              <h5 className="text-[9px] font-bold text-[#6C5CE7] uppercase tracking-wider font-mono flex items-center gap-1">
                                <Lightbulb className="w-3.5 h-3.5 text-[#6C5CE7]" />
                                <span>Starting Structure</span>
                              </h5>
                              <div className="space-y-1">
                                {[
                                  "1. Identify top 3 direct competitor sites and locate their pricing pages",
                                  "2. Create a basic spreadsheet with columns for price, tiers, and limits",
                                  "3. Note down the primary focus value proposition of each brand"
                                ].map((step, idx) => (
                                  <div key={idx} className="flex items-start gap-1.5 text-[10px] text-slate-700 bg-slate-50/50 p-2 rounded border border-slate-150">
                                    <div className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0 mt-0.5"></div>
                                    <span className="leading-normal">{step}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Next Action */}
                            <div className="bg-slate-900 text-white p-3 rounded-lg space-y-1">
                              <div className="flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-[#A29BFE]" />
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[#A29BFE] font-mono">Next Action</span>
                              </div>
                              <p className="text-[10px] font-semibold text-slate-200">
                                Open a browser tab and find the pricing page for your first competitor.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </section>
              </div>

                {/* FAQ Section */}
                <section 
                  id="section-faq" 
                  className="w-full py-24 sm:py-32 px-6 sm:px-8 relative"
                >
                  <div className="max-w-4xl mx-auto w-full relative z-10 text-center space-y-12">
                    <div className="space-y-4">
                      <div className="inline-flex items-center gap-1.5 bg-[#F0EEFF] text-[#6C5CE7] text-[10px] font-mono uppercase font-bold px-3 py-1.5 rounded-full tracking-wider border border-[#D9D6FF]/50">
                        Frequently Asked Questions
                      </div>
                      <h2 className="font-display font-medium text-4xl sm:text-5xl text-slate-900 tracking-tight leading-[1.1]">
                        Got questions? We've got answers.
                      </h2>
                      <p className="text-slate-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
                        Learn how Zenith works and why it is built to protect your deadlines better than any standard planner.
                      </p>
                    </div>

                    <div className="space-y-4 max-w-3xl mx-auto text-left">
                      {FAQ_ITEMS.map((faq, index) => {
                        const isOpen = activeFaq === index;
                        return (
                          <div 
                            key={index} 
                            className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-[#6C5CE7]/30 transition-all duration-300 overflow-hidden"
                          >
                            <button
                              onClick={() => setActiveFaq(isOpen ? null : index)}
                              className="w-full py-5 px-6 flex items-center justify-between gap-4 text-left font-sans font-semibold text-[#0F172A] hover:text-[#6C5CE7] transition-colors focus:outline-none cursor-pointer"
                            >
                              <span className="text-base sm:text-lg">{faq.q}</span>
                              <motion.div
                                animate={{ rotate: isOpen ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="text-slate-400 shrink-0"
                              >
                                <ChevronDown className="w-5 h-5 text-[#6C5CE7]" />
                              </motion.div>
                            </button>
                            
                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.25, ease: "easeInOut" }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-6 pb-6 pt-1 text-slate-500 text-sm sm:text-base leading-relaxed border-t border-slate-100">
                                    {faq.a}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* Closing Call-to-Action Section */}
                <section 
                  id="section-cta" 
                  className="w-full min-h-[75vh] flex flex-col justify-center py-28 sm:py-36 px-6 sm:px-8 relative overflow-hidden"
                >
                  <div className="max-w-6xl mx-auto text-center py-20 sm:py-24 px-12 sm:px-20 md:px-24 rounded-3xl bg-gradient-to-br from-[#F0EEFF]/60 to-[#F7CAC9]/20 border border-white/50 shadow-xs relative overflow-hidden z-10" id="closing-cta-section">
                  <div className="absolute -right-16 -bottom-16 w-32 h-32 bg-[#6C5CE7]/10 blur-2xl rounded-full pointer-events-none"></div>
                  <div className="absolute -left-16 -top-16 w-32 h-32 bg-[#F7CAC9]/20 blur-2xl rounded-full pointer-events-none"></div>
                  
                  {/* Abstract Corner Sparkles */}
                  {/* Top-Left Corner Sparkles */}
                  <motion.div
                    animate={{ opacity: [0.15, 0.75, 0.15], scale: [0.8, 1.15, 0.8], rotate: [0, 15, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-5 left-5 text-[#6C5CE7]/40 pointer-events-none"
                  >
                    <Sparkles className="w-5 h-5" />
                  </motion.div>
                  <motion.div
                    animate={{ opacity: [0.1, 0.6, 0.1], scale: [0.7, 1.0, 0.7], rotate: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                    className="absolute top-8 left-10 text-[#F7CAC9]/60 pointer-events-none"
                  >
                    <Sparkle className="w-3.5 h-3.5" />
                  </motion.div>

                  {/* Top-Right Corner Sparkle */}
                  <motion.div
                    animate={{ opacity: [0.2, 0.7, 0.2], scale: [0.9, 1.15, 0.9], rotate: [0, -20, 0] }}
                    transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute top-6 right-6 text-[#F7CAC9] pointer-events-none"
                  >
                    <Sparkle className="w-4 h-4" />
                  </motion.div>
                  <motion.div
                    animate={{ opacity: [0.15, 0.75, 0.15], scale: [0.75, 1.05, 0.75], rotate: [0, 25, 0] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
                    className="absolute top-10 right-10 text-[#6C5CE7]/30 pointer-events-none"
                  >
                    <Sparkles className="w-3 h-3" />
                  </motion.div>

                  {/* Bottom-Left Corner Sparkle */}
                  <motion.div
                    animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.85, 1.1, 0.85], rotate: [0, 30, 0] }}
                    transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
                    className="absolute bottom-6 left-6 text-[#6C5CE7]/50 pointer-events-none"
                  >
                    <Sparkles className="w-4 h-4" />
                  </motion.div>
                  <motion.div
                    animate={{ opacity: [0.1, 0.5, 0.1], scale: [0.7, 1.0, 0.7] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                    className="absolute bottom-10 left-10 text-[#F7CAC9]/50 pointer-events-none"
                  >
                    <Sparkle className="w-3 h-3" />
                  </motion.div>

                  {/* Bottom-Right Corner Sparkles */}
                  <motion.div
                    animate={{ opacity: [0.25, 0.85, 0.25], scale: [0.9, 1.2, 0.9], rotate: [0, -15, 0] }}
                    transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                    className="absolute bottom-5 right-5 text-[#F7CAC9]/90 pointer-events-none"
                  >
                    <Sparkle className="w-4 h-4" />
                  </motion.div>
                  <motion.div
                    animate={{ opacity: [0.15, 0.65, 0.15], scale: [0.8, 1.05, 0.8], rotate: [0, 10, 0] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
                    className="absolute bottom-8 right-9 text-[#6C5CE7]/40 pointer-events-none"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </motion.div>
                  
                  <div className="space-y-4 relative z-10">
                    <span className="inline-flex items-center space-x-1.5 bg-[#F0EEFF] text-[#6C5CE7] text-xs font-semibold px-3 py-1 rounded-full border border-[#D9D6FF]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Take the First Step</span>
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#0F172A] tracking-tight">
                      Start Your Zenith Journey Today.
                    </h2>
                    <p className="text-slate-600 text-sm max-w-lg mx-auto leading-relaxed">
                      Turn your most important goals into realistic, daily action plans. Let AI protect your schedules and keep you moving forward step-by-step.
                    </p>
                    <div className="pt-4 flex justify-center">
                      <button
                        onClick={() => setCurrentView('create')}
                        className="px-8 py-4 bg-[#0F172A] hover:bg-[#1e293b] text-white font-semibold rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 flex items-center justify-center space-x-3 cursor-pointer"
                      >
                        <span>Get Started</span>
                        <ArrowRight className="w-5 h-5 text-[#A29BFE]" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
            </motion.div>
          )}

          {/* ACTIVE DASHBOARD VIEW SCREEN */}
          {currentView === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
              id="dashboard-screen"
            >
              {commitments.length === 0 ? (
                <div className="glass-card border border-white/50 p-8 rounded-2xl shadow-serenity text-center max-w-2xl mx-auto space-y-4">
                  <div className="w-16 h-16 bg-[#F0EEFF] text-[#6C5CE7] rounded-2xl flex items-center justify-center mx-auto">
                    <TrendingUp className="w-8 h-8" />
                  </div>
                  <h3 className="font-display font-bold text-xl text-[#0F172A]">Welcome to your Dashboard</h3>
                  <p className="text-slate-600 text-sm leading-relaxed max-w-md mx-auto">
                    You don't have any active commitments tracked yet. Let's add your first goal to map out a clear, step-by-step action plan!
                  </p>
                  <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
                    <button
                      onClick={() => setCurrentView('create')}
                      className="px-6 py-3 bg-[#0F172A] hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <span>Add Commitment</span>
                    </button>
                    <button
                      disabled={seeding || loadingUser}
                      onClick={async () => {
                        await handleSeedDemoData();
                        setCurrentView('dashboard');
                      }}
                      className="px-6 py-3 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold rounded-xl text-xs transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {seeding ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#6C5CE7]" />
                      ) : (
                        <Database className="w-4 h-4 text-[#6C5CE7]" />
                      )}
                      <span>{seeding ? 'Seeding...' : 'Load Demo Commitments'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8" id="dashboard-screen">
                  
                  {/* Dashboard Header: Greeting & Zenith Score */}
                  <div className="glass-card border border-white/50 p-6 sm:p-8 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-serenity">
                    <div className="space-y-4 flex-1">
                      <div>
                        <h1 className="text-3xl font-display font-extrabold text-slate-900 mt-1">
                          {getGreeting()}, {user?.name || 'Pioneer'}
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                          Here is your at-a-glance commitment runway and tactical focus roadmap.
                        </p>
                      </div>

                      {showResetConfirm ? (
                        <div className="inline-flex flex-col sm:flex-row sm:items-center gap-3 bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-slate-800 text-xs shadow-sm max-w-xl">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                            <p className="font-medium text-slate-700">
                              Permanently delete ALL commitments and tasks? This cannot be undone.
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
                            <button
                              onClick={() => setShowResetConfirm(false)}
                              className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-semibold transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleResetAllData}
                              className="px-2.5 py-1 rounded bg-rose-500 hover:bg-rose-600 text-white font-semibold transition-all cursor-pointer shadow-xs"
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowResetConfirm(true)}
                          className="inline-flex items-center gap-1.5 bg-rose-50/60 hover:bg-rose-100/80 text-rose-600 hover:text-rose-700 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-rose-150 transition-all cursor-pointer"
                          title="Permanently start completely fresh"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Reset All Data</span>
                        </button>
                      )}
                    </div>

                    {/* Zenith Score Display */}
                    <div className="flex items-center gap-4 bg-slate-900 text-white px-6 py-4 rounded-xl border border-[#F7CAC9]/30 shadow-[0_0_25px_rgba(247,202,201,0.25)] w-full md:w-auto min-w-[240px] ring-2 ring-[#F7CAC9]/15">
                      <div className="w-12 h-12 rounded-full border-4 border-[#92A8D1] flex items-center justify-center font-extrabold text-lg text-[#F7CAC9] bg-[#92A8D1]/10 shrink-0 shadow-inner">
                        {momentumScore}%
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                          Zenith Score
                        </div>
                        <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
                          Your execution rate across all tracked deadlines.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Smart Reminder Panel */}
                  <div className="bg-white/35 backdrop-blur-md border border-white/60 p-5 sm:p-6 rounded-2xl shadow-xs relative overflow-hidden" id="smart-reminder-panel">
                    {/* Background glows that merge nicely without looking like a separate harsh block */}
                    <div className="absolute -right-12 -bottom-12 w-40 h-40 bg-gradient-to-tr from-[#92A8D1]/10 to-[#F7CAC9]/10 blur-2xl rounded-full pointer-events-none"></div>
                    
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#6C5CE7] animate-pulse"></span>
                          <span className="text-[10px] font-bold text-[#6C5CE7] uppercase tracking-widest font-mono">
                            Today's Smart Reminder
                          </span>
                        </div>
                        {smartReminder ? (
                          <>
                            <h3 className="font-display font-extrabold text-lg text-slate-900 mt-1 flex items-center gap-2 flex-wrap">
                              {smartReminder.task.title}
                              <span className="text-xs font-mono font-medium text-slate-500 bg-white/65 px-2 py-0.5 rounded-full border border-white/40">
                                {smartReminder.task.estimatedMinutes} min
                              </span>
                            </h3>
                            <p className="text-xs text-slate-600 font-medium leading-relaxed mt-1">
                              {getSmartReminderWhy(smartReminder.task, smartReminder.commitment)}
                            </p>
                          </>
                        ) : (
                          <>
                            <h3 className="font-display font-bold text-base text-slate-800 mt-1">
                              You're all caught up!
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              No urgent incomplete tasks across your active commitments right now.
                            </p>
                          </>
                        )}
                      </div>
                      
                      {smartReminder && (
                        <button
                          onClick={() => handleSelectCommitment(smartReminder.commitment)}
                          className="inline-flex items-center gap-2 bg-[#6C5CE7] hover:bg-[#5b4dbf] text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-[#5b4dbf] transition-all cursor-pointer shadow-xs hover:shadow-sm hover:-translate-y-0.5 shrink-0"
                        >
                          <span>Start Task</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Main Content Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    {/* Left Area: Active Commitments & Recommended/Today's Tasks */}
                    <div className="lg:col-span-8 space-y-8">
                      
                      {/* Active Commitments */}
                      <div className="glass-card border border-white/50 rounded-2xl p-6 sm:p-8 space-y-6 shadow-serenity">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <div>
                            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                              Active Commitments
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">
                              Click any saved card to open its custom AI action plan and milestones.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={refreshCommitments} 
                              className="p-1.5 hover:bg-slate-150 rounded-lg text-slate-500 transition-colors cursor-pointer"
                              title="Sync from Database"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setCurrentView('create')}
                              className="inline-flex items-center gap-1 bg-[#F0EEFF] hover:bg-[#D9D6FF] text-[#6C5CE7] text-xs font-bold px-3 py-1.5 rounded-lg border border-[#D9D6FF] transition-all cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add New</span>
                            </button>
                          </div>
                        </div>

                        {loadingTasks && commitments.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 space-y-3">
                            <Loader2 className="w-8 h-8 animate-spin text-[#6C5CE7]" />
                            <p className="text-xs text-slate-400 font-mono">Syncing workspace...</p>
                          </div>
                        ) : activeCommitments.length === 0 ? (
                          <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-xl space-y-3 bg-slate-50/50">
                            <div className="w-12 h-12 rounded-full bg-[#F0EEFF] flex items-center justify-center mx-auto text-[#6C5CE7]">
                              <CheckCircle className="w-6 h-6" />
                            </div>
                            <h4 className="text-sm font-bold text-slate-800">All current goals are fully completed!</h4>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                              Outstanding momentum! You have completed 100% of your current commitments. Click 'Add New' to schedule your next milestone.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-4">
                            {activeCommitments.map((item) => {
                              const progress = getCommitmentProgress(item.id);
                              
                              if (confirmDeleteId === item.id) {
                                return (
                                  <div
                                    key={item.id}
                                    onClick={(e) => e.stopPropagation()}
                                    className="border p-5 rounded-xl transition-all duration-300 relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-rose-50/60 border-rose-200 shadow-sm"
                                  >
                                    <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <AlertTriangle className="w-4 h-4 text-rose-500 animate-bounce" />
                                          <span className="text-xs font-bold uppercase tracking-wider text-rose-500">
                                            Confirm Deletion
                                          </span>
                                        </div>
                                        <p className="text-sm text-slate-700 font-medium">
                                          Delete "{item.title}" and all its tasks? This can't be undone.
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-all cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handleDeleteCommitment(item.id)}
                                          className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={item.id}
                                  onClick={() => handleSelectCommitment(item)}
                                  className="group bg-slate-50/50 hover:bg-white border border-slate-150 hover:border-[#6C5CE7] p-5 rounded-xl cursor-pointer transition-all duration-300 hover:shadow-rosequartz hover:-translate-y-0.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative"
                                >
                                  {/* Subtle top-right Trash button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteId(item.id);
                                    }}
                                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 lg:opacity-0 lg:group-hover:opacity-100 transition-all cursor-pointer border border-transparent hover:border-rose-200 shadow-sm z-20"
                                    title="Delete Active Commitment"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>

                                  <div className="space-y-2 flex-1 pr-6 sm:pr-8">
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                        item.priority === 'critical' ? 'bg-red-50 text-red-700 border border-red-100' :
                                        item.priority === 'high' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                        item.priority === 'medium' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                        'bg-slate-50 text-slate-600 border border-slate-100'
                                      }`}>
                                        {item.priority}
                                      </span>
                                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Due {new Date(item.deadline).toLocaleDateString()}</span>
                                      </span>
                                    </div>
                                    <h3 className="font-display font-bold text-base text-slate-900 group-hover:text-[#6C5CE7] transition-colors">
                                      {item.title}
                                    </h3>
                                    <p className="text-xs text-slate-500 line-clamp-1 max-w-xl">
                                      {item.description || 'No context description provided.'}
                                    </p>
                                  </div>

                                  {/* Progress bar info */}
                                  <div className="w-full sm:w-48 space-y-1 bg-white sm:bg-transparent p-3 sm:p-0 rounded-lg border border-[#F0EEFF] sm:border-0 shrink-0">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="font-medium text-slate-500">Progress</span>
                                      <span className="font-extrabold text-[#6C5CE7]">{progress}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-[#6C5CE7] transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Completed Commitments Section */}
                      {completedCommitments.length > 0 && (
                        <div className="glass-card border border-white/50 rounded-2xl p-6 sm:p-8 space-y-4 shadow-rosequartz">
                          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div>
                              <h2 className="text-xs font-bold text-[#6C5CE7] uppercase tracking-widest flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#6C5CE7] animate-pulse"></span>
                                Completed Commitments ({completedCommitments.length})
                              </h2>
                              <p className="text-xs text-slate-500 mt-1">
                                Archived goals that have reached 100% progress.
                              </p>
                            </div>
                            <button
                              onClick={() => setShowCompleted(!showCompleted)}
                              className="text-xs font-bold text-[#6C5CE7] hover:text-[#5B49D6] px-3 py-1.5 rounded-lg border border-[#6C5CE7]/20 hover:bg-[#6C5CE7]/5 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              {showCompleted ? 'Hide Completed' : 'Show Completed'}
                            </button>
                          </div>

                          {showCompleted && (
                            <div className="grid grid-cols-1 gap-4">
                              {completedCommitments.map((item) => {
                                const progress = getCommitmentProgress(item.id);
                                return (
                                  <div
                                    key={item.id}
                                    onClick={() => {
                                      if (confirmDeleteId !== item.id) {
                                        handleSelectCommitment(item);
                                      }
                                    }}
                                    className={`group border p-5 rounded-xl transition-all duration-300 relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                                      confirmDeleteId === item.id 
                                        ? 'bg-rose-50/60 border-rose-200 shadow-sm' 
                                        : 'bg-[#F7CAC9]/5 hover:bg-white border-slate-150 hover:border-[#6C5CE7] cursor-pointer hover:shadow-rosequartz hover:-translate-y-0.5'
                                    }`}
                                  >
                                    {confirmDeleteId === item.id ? (
                                      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4" onClick={(e) => e.stopPropagation()}>
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-rose-500 animate-bounce" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-rose-500">
                                              Confirm Deletion
                                            </span>
                                          </div>
                                          <p className="text-sm text-slate-700 font-medium">
                                            Delete "{item.title}" and all its tasks? This can't be undone.
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <button
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-all cursor-pointer"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            onClick={() => handleDeleteCommitment(item.id)}
                                            className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {/* Subtle top-right Trash button */}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmDeleteId(item.id);
                                          }}
                                          className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 lg:opacity-0 lg:group-hover:opacity-100 transition-all cursor-pointer border border-transparent hover:border-rose-200 shadow-sm z-20"
                                          title="Delete Completed Commitment"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>

                                        <div className="space-y-2 flex-1 pr-6 sm:pr-8">
                                          <div className="flex items-center gap-2">
                                            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#F0EEFF] text-[#6C5CE7] border border-[#D9D6FF]">
                                              Completed
                                            </span>
                                            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                                              <span>Deadline was {new Date(item.deadline).toLocaleDateString()}</span>
                                            </span>
                                          </div>
                                          <h3 className="font-display font-bold text-base text-slate-500 line-through group-hover:text-[#6C5CE7] transition-colors">
                                            {item.title}
                                          </h3>
                                          <p className="text-xs text-slate-400 line-clamp-1 max-w-xl">
                                            {item.description || 'No context description provided.'}
                                          </p>
                                        </div>

                                        {/* Progress bar info */}
                                        <div className="w-full sm:w-48 space-y-1 bg-white sm:bg-transparent p-3 sm:p-0 rounded-lg border border-slate-100 sm:border-0 shrink-0">
                                          <div className="flex justify-between items-center text-xs">
                                            <span className="font-medium text-slate-400">Progress</span>
                                            <span className="font-extrabold text-[#6C5CE7]">{progress}%</span>
                                          </div>
                                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                            <div 
                                              className="h-full bg-[#6C5CE7]"
                                              style={{ width: `${progress}%` }}
                                            ></div>
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Today's / Recommended Tasks */}
                      <div className="glass-card border border-white/50 rounded-2xl p-6 sm:p-8 space-y-6 shadow-serenity">
                        <div>
                          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {todayTasks.length > 0 ? "Today's Scheduled Tasks" : "Recommended Focus Tasks"}
                          </h2>
                          <p className="text-xs text-slate-500 mt-1">
                            {todayTasks.length > 0 
                              ? "Tasks assigned with deadlines set for today." 
                              : completedTodayTasksCount > 0
                                ? "🎉 All caught up on today's tasks! High-priority items from other commitments are pulled in below to keep your momentum going."
                                : "No tasks explicitly scheduled for today. We've selected your highest-impact incomplete tasks to sustain momentum."
                            }
                          </p>
                        </div>

                        <div className="space-y-3">
                          {displayTasks.map((task) => {
                            const parentCommitment = commitments.find(c => c.id === task.commitmentId);
                            return (
                              <div 
                                key={task.id} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleTask(task.id, task.commitmentId);
                                }}
                                className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 flex items-start gap-4 ${
                                  task.completed 
                                    ? 'bg-[#F0EEFF]/40 border-[#D9D6FF] hover:bg-[#F0EEFF]/60 shadow-2xs' 
                                    : 'bg-slate-50/50 border-slate-150 hover:bg-white hover:border-[#6C5CE7] hover:shadow-[0_12px_24px_rgba(108,92,231,0.12)] hover:-translate-y-0.5'
                                }`}
                              >
                                {/* Checkbox circle */}
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                                  task.completed 
                                    ? 'bg-[#6C5CE7] border-[#6C5CE7] text-white' 
                                    : 'border-slate-300 bg-white hover:border-[#6C5CE7]'
                                }`}>
                                  {task.completed && (
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>

                                <div className="space-y-1 flex-1">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <h4 className={`font-display font-bold text-sm text-slate-900 transition-all ${
                                      task.completed ? 'line-through text-slate-400' : ''
                                    }`}>
                                      {task.title}
                                    </h4>

                                    {/* Tags */}
                                    <div className="flex flex-wrap gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      {parentCommitment && (
                                        <span 
                                          onClick={() => handleSelectCommitment(parentCommitment)}
                                          className="text-[9px] font-bold bg-[#F0EEFF] text-[#6C5CE7] hover:bg-[#D9D6FF] px-2 py-0.5 rounded border border-[#D9D6FF] cursor-pointer transition-colors"
                                        >
                                          {parentCommitment.title}
                                        </span>
                                      )}
                                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                        task.priority === 'critical' ? 'bg-red-100 text-red-700' :
                                        task.priority === 'high' ? 'bg-amber-100 text-amber-700' :
                                        task.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                                        'bg-slate-100 text-slate-600'
                                      }`}>
                                        {task.priority}
                                      </span>
                                    </div>
                                  </div>
                                  <p className={`text-xs text-slate-500 leading-relaxed ${
                                    task.completed ? 'text-slate-400' : ''
                                  }`}>{task.description}</p>

                                  {!task.completed && (
                                    <div className="pt-2 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        id={`btn-dashboard-help-task-${task.id}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleGetTaskHelp(task);
                                        }}
                                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[11px] font-semibold text-[#6C5CE7] bg-[#F0EEFF] hover:bg-[#D9D6FF] border border-[#D9D6FF] rounded-lg transition-all cursor-pointer"
                                      >
                                        <HelpCircle className="w-3.5 h-3.5" />
                                        <span>Need Help?</span>
                                      </button>

                                      <button
                                        id={`btn-cant-complete-${task.id}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenReplanModal(task);
                                        }}
                                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-150 rounded-lg transition-all cursor-pointer"
                                      >
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>Couldn't Complete</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {displayTasks.length === 0 && (
                            <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              <CheckCircle className="w-8 h-8 text-[#6C5CE7] mx-auto mb-2" />
                              <p className="text-sm font-bold text-slate-700">All Tasks Completed!</p>
                              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                                Outstanding job! You've successfully finished all generated tasks for your active commitments.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Right Area: AI Coach panel, Upcoming Section & New Commitment shortcut */}
                    <div className="lg:col-span-4 flex flex-col gap-6">
                      
                      {/* AI Coach panel (Static logic tips) */}
                      <div className="bg-[#0F172A] text-white p-6 sm:p-8 rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(247,202,201,0.35)] relative overflow-hidden">
                        {/* Glow Blob 1 (Violet) */}
                        <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#6C5CE7] opacity-25 blur-3xl rounded-full"></div>
                        {/* Glow Blob 2 (Indigo) */}
                        <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-indigo-500 opacity-20 blur-3xl rounded-full"></div>
                        
                        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
                          <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center text-[#A29BFE]">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                          <h2 className="text-xs font-bold text-[#A29BFE] uppercase tracking-widest">
                            AI Coach Briefing
                          </h2>
                        </div>

                        <div className="space-y-4">
                          {coachTips.map((tip, idx) => (
                            <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-slate-200 leading-relaxed">
                              <p>{tip}</p>
                            </div>
                          ))}
                        </div>

                      </div>

                      {/* Upcoming Deadlines */}
                      <div className="glass-card border border-white/50 rounded-2xl p-6 sm:p-8 space-y-6 shadow-serenity">
                        <div>
                          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
                            Upcoming Deadlines
                          </h2>
                        </div>

                        <div className="space-y-4">
                          {upcomingCommitments.map((item) => {
                            const daysLeft = Math.ceil((new Date(item.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                            return (
                              <div 
                                key={item.id}
                                onClick={() => handleSelectCommitment(item)}
                                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-150 hover:border-[#6C5CE7] hover:shadow-[0_12px_24px_rgba(108,92,231,0.12)] hover:-translate-y-0.5 cursor-pointer transition-all duration-300"
                              >
                                <div className="space-y-1">
                                  <h4 className="font-display font-bold text-xs text-slate-900 line-clamp-1">
                                    {item.title}
                                  </h4>
                                  <p className="text-[10px] text-slate-400 font-mono uppercase">
                                    Due {new Date(item.deadline).toLocaleDateString()}
                                  </p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  daysLeft <= 3 ? 'bg-red-50 text-red-600 border border-red-100' :
                                  daysLeft <= 7 ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                  'bg-[#F0EEFF] text-[#6C5CE7] border border-[#D9D6FF]'
                                }`}>
                                  {daysLeft > 0 ? `${daysLeft}d left` : 'Due today'}
                                </span>
                              </div>
                            );
                          })}

                          {upcomingCommitments.length === 0 && (
                            <p className="text-xs text-slate-400 italic">No incomplete commitments tracked.</p>
                          )}
                        </div>
                      </div>

                      {/* Focus Timer Widget */}
                      {(() => {
                        const totalDuration = timerMode === 'work' ? 25 * 60 : 5 * 60;
                        const radius = 48;
                        const circumference = 2 * Math.PI * radius;
                        const strokeDashoffset = circumference * (1 - timeLeft / totalDuration);
                        const minutes = Math.floor(timeLeft / 60);
                        const seconds = timeLeft % 60;
                        const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

                        return (
                          <div className="glass-card border border-white/50 rounded-2xl p-6 sm:p-8 space-y-5 shadow-serenity" id="focus-timer-card">
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                              <Clock className="w-4 h-4 text-[#6C5CE7]" />
                              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                Focus Timer
                              </h2>
                            </div>

                            {/* Smart Default Task Alert */}
                            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs leading-relaxed">
                              {smartReminder ? (
                                <p className="text-slate-600">
                                  Focusing on:{' '}
                                  <span className="text-slate-800 font-bold">{smartReminder.task.title}</span>{' '}
                                  <span className="text-slate-400">({smartReminder.commitment.title})</span>
                                </p>
                              ) : (
                                <p className="text-slate-500 italic">Ready to focus on your upcoming commitments.</p>
                              )}
                            </div>

                            {/* Mode Toggle Buttons */}
                            <div className="flex bg-slate-50 border border-slate-150 p-1 rounded-xl">
                              <button
                                onClick={() => { setTimerMode('work'); if (!timerIsActive) setTimeLeft(25 * 60); }}
                                className={`flex-1 text-xs py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                                  timerMode === 'work'
                                    ? 'bg-white text-[#6C5CE7] shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                Work (25m)
                              </button>
                              <button
                                onClick={() => { setTimerMode('rest'); if (!timerIsActive) setTimeLeft(5 * 60); }}
                                className={`flex-1 text-xs py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                                  timerMode === 'rest'
                                    ? 'bg-white text-[#6C5CE7] shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                Rest (5m)
                              </button>
                            </div>

                            {/* Circular Countdown Progress Ring */}
                            <div className="flex flex-col items-center justify-center py-1">
                              <div className="relative flex items-center justify-center w-32 h-32">
                                <svg className="w-full h-full transform -rotate-90">
                                  <circle
                                    cx="64"
                                    cy="64"
                                    r={radius}
                                    className="stroke-slate-100"
                                    strokeWidth="3.5"
                                    fill="transparent"
                                  />
                                  <circle
                                    cx="64"
                                    cy="64"
                                    r={radius}
                                    className="stroke-[#6C5CE7] transition-all duration-300"
                                    strokeWidth="3.5"
                                    fill="transparent"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeDashoffset}
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <div className="absolute flex flex-col items-center justify-center">
                                  <span className="text-2xl font-extrabold font-mono text-slate-800 tracking-tight">
                                    {formattedTime}
                                  </span>
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                                    {timerIsActive ? (timerMode === 'work' ? 'Focusing' : 'Resting') : 'Standby'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Status and Action Buttons */}
                            <div className="space-y-3">
                              <div className="text-center">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                                  timerIsActive 
                                    ? timerMode === 'work' 
                                      ? 'bg-violet-50 text-[#6C5CE7] border border-[#E2DFFF]'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    : 'bg-slate-50 text-slate-500 border border-slate-200'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    timerIsActive
                                      ? timerMode === 'work' ? 'bg-[#6C5CE7] animate-pulse' : 'bg-emerald-500 animate-pulse'
                                      : 'bg-slate-400'
                                  }`}></span>
                                  <span>{timerIsActive ? (timerMode === 'work' ? 'Focusing Session' : 'Rest Break') : 'Timer Standby'}</span>
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setTimerIsActive(!timerIsActive)}
                                  className={`flex-1 py-2.5 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                    timerIsActive 
                                      ? 'bg-slate-700 hover:bg-slate-800 active:bg-slate-950'
                                      : 'bg-[#6C5CE7] hover:bg-[#5b4dbf] active:bg-[#4c3fa6]'
                                  }`}
                                >
                                  {timerIsActive ? (
                                    <>
                                      <Pause className="w-4 h-4" />
                                      <span>Pause Focus</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-4 h-4 fill-white" />
                                      <span>Start Focus</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={handleResetTimer}
                                  className="p-2.5 hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer bg-white"
                                  title="Reset Timer"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}



                    </div>

                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* CREATE COMMITMENT FORM VIEW */}
          {currentView === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="max-w-2xl mx-auto space-y-3 pb-6"
            >
              <div className="space-y-1">
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-500 hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back to Dashboard</span>
                </button>
                <h2 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A]">Add Commitment & Generate Plan</h2>
                <p className="text-xs text-slate-500">Provide details about your goal. Gemini will craft an optimized sequential plan custom-fit to your timeline.</p>
              </div>

              <form onSubmit={handleFormSubmit} className="glass-card border border-white/50 p-4 sm:p-5 rounded-xl shadow-serenity space-y-4" id="create-commitment-form">
                
                {submitError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Commitment Name */}
                <div className="space-y-1">
                  <label htmlFor="title" className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">
                    Commitment Name *
                  </label>
                  <input
                    type="text"
                    id="title"
                    required
                    placeholder="e.g., Amazon Internship Interview, Client Proposal Scope"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6C5CE7] focus:ring-2 focus:ring-[#6C5CE7]/10 transition-all bg-slate-50/50"
                  />
                </div>

                {/* Context Description */}
                <div className="space-y-1">
                  <label htmlFor="description" className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">
                    Description & Context
                  </label>
                  <textarea
                    id="description"
                    rows={2}
                    placeholder="Give the AI strategic context: reference specific parameters, deliverables, format specs, or preparation notes for a custom plan."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6C5CE7] focus:ring-2 focus:ring-[#6C5CE7]/10 transition-all bg-slate-50/50 resize-y"
                  />
                </div>

                {/* Deadline Picker */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="deadline" className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">
                      Deadline Date & Time *
                    </label>
                    <div className="relative">
                      <input
                        type="datetime-local"
                        id="deadline"
                        required
                        value={formData.deadline}
                        onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6C5CE7] focus:ring-2 focus:ring-[#6C5CE7]/10 transition-all bg-slate-50/50"
                      />
                    </div>
                  </div>

                  {/* Available Time Budget (Free text) */}
                  <div className="space-y-1">
                    <label htmlFor="availableTime" className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">
                      Available Time Budget
                    </label>
                    <input
                      type="text"
                      id="availableTime"
                      placeholder="e.g., weekdays 8pm-11pm, weekend 4 hours"
                      value={formData.availableTime}
                      onChange={(e) => setFormData({ ...formData, availableTime: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6C5CE7] focus:ring-2 focus:ring-[#6C5CE7]/10 transition-all bg-slate-50/50"
                    />
                    <p className="text-[9px] mt-0.5 text-slate-400 leading-none">Specifying hours (e.g. "3 hours") helps refine the confidence score budget.</p>
                  </div>
                </div>

                {/* Priority Selection */}
                <div className="space-y-1">
                  <label htmlFor="priority" className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">
                    Commitment Priority Level
                  </label>
                  <select
                    id="priority"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as Priority })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6C5CE7] focus:ring-2 focus:ring-[#6C5CE7]/10 transition-all bg-slate-50/50"
                  >
                    <option value="low">Low - Routine follow-up</option>
                    <option value="medium">Medium - Standard deadline</option>
                    <option value="high">High - Immediate attention</option>
                    <option value="critical">Critical - Career defining / high stakes</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto px-5 py-2 bg-[#0F172A] hover:bg-slate-800 text-white font-semibold rounded-lg transition-all shadow-xs flex items-center justify-center space-x-2 text-sm disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#A29BFE]" />
                        <span>Generating AI Strategy...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-[#A29BFE]" />
                        <span>Analyze & Generate Plan</span>
                      </>
                    )}
                  </button>
                </div>

              </form>
            </motion.div>
          )}

          {/* AI PLAN VIEW SCREEN */}
          {currentView === 'plan' && selectedCommitment && (
            <motion.div
              key="plan"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="max-w-5xl mx-auto space-y-8 pb-12"
            >
              {/* Back & Actions header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-[#6C5CE7] transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back to Main Dashboard</span>
                </button>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setCurrentView('create')}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:text-[#6C5CE7] text-xs font-semibold rounded-lg shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#6C5CE7]" />
                    <span>Add Commitment</span>
                  </button>
                </div>
              </div>

              {/* Header Title Card with Priority Indicator */}
              <div className="glass-card border border-white/50 p-6 sm:p-8 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-serenity" id="plan-header-card">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                      selectedCommitment.priority === 'critical' ? 'bg-red-50 text-red-700 border border-red-100' :
                      selectedCommitment.priority === 'high' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                      selectedCommitment.priority === 'medium' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                      'bg-slate-50 text-slate-600 border border-slate-100'
                    }`}>
                      {selectedCommitment.priority} priority
                    </span>
                    <span className="text-xs text-slate-400 font-mono">Created {new Date(selectedCommitment.createdAt).toLocaleDateString()}</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-[#0F172A]">{selectedCommitment.title}</h2>
                  <p className="text-sm text-slate-600 max-w-2xl">{selectedCommitment.description || "No supplemental details provided."}</p>
                </div>

                {/* Deadlines details */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 w-full md:w-auto min-w-[240px] space-y-2">
                  <div className="flex items-center space-x-2 text-xs text-slate-500 font-mono uppercase">
                    <Calendar className="w-4 h-4 text-[#6C5CE7]" />
                    <span>Deadline Threshold</span>
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    {new Date(selectedCommitment.deadline).toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500">
                    Available: <span className="underline font-medium text-[#6C5CE7]">{selectedCommitment.availableTime || "Not Specified"}</span>
                  </div>
                </div>
              </div>

              {/* Confidence Score Panel */}
              {confidenceStats && (
                <div className="glass-card border border-white/50 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row justify-between items-center gap-8 shadow-rosequartz" id="confidence-panel">
                  <div className="space-y-2 text-center md:text-left flex-1">
                    <div className="inline-flex items-center space-x-1.5 bg-[#F0EEFF] py-1 px-3 rounded-full text-xs font-semibold text-[#6C5CE7]">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Plan Success Predictor</span>
                    </div>
                    <h3 className="font-display font-bold text-xl text-[#0F172A]">How realistic is this plan?</h3>
                    <p className="text-slate-600 text-xs max-w-xl leading-relaxed">
                      We compare estimated total effort duration 
                      (<span className="font-semibold text-[#6C5CE7]">{(totalMinutes / 60).toFixed(1)} hrs</span>) against the available daily hours budget inside your deadline window of 
                      <span className="font-semibold text-[#6C5CE7]"> {confidenceStats.remainingDays} days</span>.
                    </p>
                  </div>

                  {/* Confidence score indicator bar directly from design HTML */}
                  <div className="flex items-center gap-4 bg-slate-50 px-6 py-4 rounded-2xl border border-slate-150 shadow-xs w-full md:w-auto min-w-[220px]">
                    <div className="flex flex-col flex-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Confidence</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              confidenceStats.confidence >= 80 ? 'bg-emerald-500' :
                              confidenceStats.confidence >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${confidenceStats.confidence}%` }}
                          ></div>
                        </div>
                        <span className={`font-extrabold text-sm ${
                          confidenceStats.confidence >= 80 ? 'text-emerald-600' :
                          confidenceStats.confidence >= 50 ? 'text-amber-600' : 'text-rose-600'
                        }`}>
                          {confidenceStats.confidence}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD-BASED LAYOUT: FOUR DISTINCT SECTIONS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="plan-details-grid">
                
                {/* Left Side: Goal Summary, Milestones, Tasks (8 cols) */}
                <div className="lg:col-span-8 space-y-8">
                           {/* SECTION 1: GOAL SUMMARY */}
                  <div className="glass-card border border-white/50 p-6 sm:p-8 rounded-2xl space-y-4 shadow-serenity" id="section-goal-summary">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Strategic Objective Summary</h2>
                    <p className="text-slate-700 leading-relaxed italic text-sm">
                      "{getDynamicSummary()}"
                    </p>
                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Deadline Date</span>
                        <span className="font-semibold text-slate-800 text-xs">
                          {new Date(selectedCommitment.deadline).toLocaleDateString()} at {new Date(selectedCommitment.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Priority Rating</span>
                        <span className={`font-semibold text-xs capitalize ${
                          selectedCommitment.priority === 'critical' ? 'text-red-600 font-bold' :
                          selectedCommitment.priority === 'high' ? 'text-amber-600' :
                          'text-[#6C5CE7]'
                        }`}>
                          {selectedCommitment.priority} Priority
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: THE BIG PICTURE */}
                  <div className="glass-card border border-white/50 p-6 sm:p-8 rounded-2xl space-y-4 shadow-serenity" id="section-milestones">
                    <div>
                      <h2 className="text-xs font-bold text-[#6C5CE7] uppercase tracking-widest">The Big Picture: High-Level Roadmap</h2>
                      <p className="text-xs text-slate-500 mt-1">
                        These are the key big-picture phases of your commitment. Use them to keep track of the overall journey.
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                      {(selectedCommitment.milestones || []).map((milestone: Milestone, idx: number) => (
                        <div 
                          key={idx} 
                          className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 flex items-start gap-3 relative overflow-hidden hover:shadow-[0_8px_16px_rgb(15,23,42,0.04)] hover:-translate-y-0.5 transition-all duration-300"
                        >
                          <div className="w-6 h-6 rounded-full bg-[#F0EEFF] text-[#6C5CE7] flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-display font-extrabold text-xs text-slate-800 leading-snug">
                              {milestone.title}
                            </h4>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                              {milestone.description}
                            </p>
                          </div>
                        </div>
                      ))}
                      {(!selectedCommitment.milestones || selectedCommitment.milestones.length === 0) && (
                        <p className="text-xs text-slate-400">No milestones generated yet.</p>
                      )}
                    </div>
                  </div>

                  {/* SECTION 3: What I Actually Do - Detailed Tasks with real checklist toggles and progress indicators */}
                  <div className="glass-card border border-white/50 rounded-2xl overflow-hidden shadow-serenity" id="section-tasks">
                    <div className="bg-slate-50/50 p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">What I Actually Do: Detailed Task Checklist</h2>
                        <p className="text-xs text-slate-500">Toggle completion status on individual tasks to trace your daily tactical progress.</p>
                      </div>

                      {/* Real-time Checklist tracker */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Progress</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#6C5CE7] transition-all duration-300"
                              style={{ 
                                width: `${selectedTasks.length > 0 
                                  ? (selectedTasks.filter(t => t.completed).length / selectedTasks.length) * 100 
                                  : 0}%` 
                              }}
                            ></div>
                          </div>
                          <span className="text-xs font-bold text-[#6C5CE7]">
                            {selectedTasks.filter(t => t.completed).length}/{selectedTasks.length}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-4">
                      {selectedTasks.map((task, idx) => (
                        <div 
                          key={task.id} 
                          onClick={() => handleToggleTask(task.id, task.commitmentId)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 flex items-start gap-4 ${
                            task.completed 
                              ? 'bg-[#F0EEFF]/40 border-[#D9D6FF] hover:bg-[#F0EEFF]/60 shadow-2xs' 
                              : 'bg-slate-50/50 border-slate-150 hover:bg-white hover:border-[#6C5CE7] hover:shadow-[0_12px_24px_rgba(108,92,231,0.12)] hover:-translate-y-0.5'
                          }`}
                        >
                          {/* Checkbox circle element */}
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                            task.completed 
                              ? 'bg-[#6C5CE7] border-[#6C5CE7] text-white' 
                              : 'border-slate-300 bg-white hover:border-[#6C5CE7]'
                          }`}>
                            {task.completed && (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>

                          <div className="space-y-1 flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <h4 className={`font-display font-bold text-sm text-slate-900 transition-all ${
                                task.completed ? 'line-through text-slate-400' : ''
                              }`}>
                                {task.title}
                              </h4>

                              {/* Tags */}
                              <div className="flex flex-wrap gap-1.5 shrink-0">
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                  task.priority === 'critical' ? 'bg-red-100 text-red-700' :
                                  task.priority === 'high' ? 'bg-amber-100 text-amber-700' :
                                  task.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {task.priority} Priority
                                </span>
                                
                                <span className="text-[9px] font-mono bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                  {task.estimatedMinutes} mins
                                </span>
                              </div>
                            </div>
                            
                            <p className={`text-xs text-slate-500 leading-relaxed ${
                              task.completed ? 'text-slate-400' : ''
                            }`}>{task.description}</p>

                            {!task.completed && (
                              <div className="pt-2 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  id={`btn-help-task-${task.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGetTaskHelp(task);
                                  }}
                                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[11px] font-semibold text-[#6C5CE7] bg-[#F0EEFF] hover:bg-[#D9D6FF] border border-[#D9D6FF] rounded-lg transition-all cursor-pointer"
                                >
                                  <HelpCircle className="w-3.5 h-3.5" />
                                  <span>Need Help?</span>
                                </button>

                                <button
                                  id={`btn-plan-cant-complete-${task.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenReplanModal(task);
                                  }}
                                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-150 rounded-lg transition-all cursor-pointer"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>Couldn't Complete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {selectedTasks.length === 0 && (
                        <p className="text-xs text-slate-400">No tasks generated for this commitment.</p>
                      )}
                    </div>
                  </div>

                </div>

                {/* Right Side: Highlighted Section 4 - Priority Logic (4 cols) */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  
                  {/* SECTION 4: PRIORITY LOGIC (HIGHLY EMPHASIZED - DARK THEME CONTAINER MATCHING SPEC) */}
                  <div 
                    id="section-priority-logic"
                    className="bg-[#0F172A] text-white p-6 rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(108,92,231,0.3)] flex flex-col relative overflow-hidden sticky top-24"
                  >
                    {/* Glow Blob 1 (Violet) */}
                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#6C5CE7] opacity-25 blur-3xl rounded-full"></div>
                    {/* Glow Blob 2 (Indigo) */}
                    <div className="absolute -left-12 -bottom-12 w-40 h-40 bg-indigo-500 opacity-20 blur-3xl rounded-full"></div>
                    
                    <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
                      <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center text-[#A29BFE]">
                        <Lightbulb className="w-4 h-4" />
                      </div>
                      <h2 className="text-xs font-bold text-[#A29BFE] uppercase tracking-widest">AI Priority Logic</h2>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Strategic Rationale</p>
                        <p className="text-xs text-slate-200 leading-relaxed font-sans font-medium">
                          {getDynamicPriorityLogic()}
                        </p>
                      </div>

                      <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-white">
                          <span className="text-[#A29BFE]">💡</span>
                          <span>Strategic Advisor Note:</span>
                        </div>
                        <p className="text-slate-300 text-[11px]">
                          Complete high-impact elements first. Getting the foundation in place builds significant psychological buffer and momentum.
                        </p>
                      </div>

                      {confidenceStats && confidenceStats.confidence < 40 && (
                        <div className="bg-red-950/40 border border-red-900/50 rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed space-y-1.5">
                          <div className="font-bold flex items-center gap-1.5 text-red-300">
                            <span>⚠️</span>
                            <span>Non-Compressible Blockers Flag:</span>
                          </div>
                          {flaggedTasks.length > 0 ? (
                            <div className="space-y-1 text-slate-300 text-[11px]">
                              <p>
                                We flagged tasks with external or rigid dependencies that cannot be compressed or rushed:
                              </p>
                              <ul className="list-disc pl-4 space-y-0.5 text-red-200">
                                {flaggedTasks.map((t, idx) => (
                                  <li key={idx} className="italic">
                                    {t.title}
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-1">
                                These external timelines (e.g., reviews/approvals) will block completion regardless of how many hours you work. Start them immediately.
                              </p>
                            </div>
                          ) : (
                            <p className="text-slate-300 text-[11px]">
                              Be aware that any task involving external reviews, third-party approvals, or platform verifications (e.g., app store review, API credentials) cannot be compressed regardless of extra effort. Verify your task list and start these non-compressible items first.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* INTERACTIVE CALENDAR SCREEN */}
          {currentView === 'calendar' && (() => {
            const getMonthDays = (baseDate: Date) => {
              const year = baseDate.getFullYear();
              const month = baseDate.getMonth();
              const firstDay = new Date(year, month, 1);
              const startDayIndex = (firstDay.getDay() + 6) % 7;
              const gridStartDate = new Date(firstDay);
              gridStartDate.setDate(firstDay.getDate() - startDayIndex);

              return Array.from({ length: 42 }, (_, i) => {
                const d = new Date(gridStartDate);
                d.setDate(gridStartDate.getDate() + i);
                return d;
              });
            };

            const monthDays = getMonthDays(calendarDate);
            const selectedDateTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === selectedCalendarDate.toDateString());
            const selectedDateDeadlines = commitments.filter(c => c.deadline && new Date(c.deadline).toDateString() === selectedCalendarDate.toDateString());

            return (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="max-w-7xl mx-auto space-y-6 pb-12 w-full"
                id="calendar-view-container"
              >
                {/* Header Section */}
                <div className="glass-card border border-white/50 p-6 sm:p-8 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-serenity">
                  <div>
                    <h1 className="text-3xl font-display font-extrabold text-slate-900 tracking-tight">Interactive Calendar</h1>
                    <p className="text-sm text-slate-500 mt-1">
                      Track tasks, milestones, and final deadlines across all commitments.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCalendarDate(new Date());
                        setSelectedCalendarDate(new Date());
                      }}
                      className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-all cursor-pointer"
                    >
                      Today
                    </button>
                    <div className="flex items-center border border-slate-200 rounded-xl bg-white p-1">
                      <button
                        onClick={() => {
                          setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
                        }}
                        className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-600 transition-all cursor-pointer"
                        title="Previous Month"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className="px-4 text-sm font-bold text-slate-800 min-w-[120px] text-center">
                        {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </span>
                      <button
                        onClick={() => {
                          setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
                        }}
                        className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-600 transition-all cursor-pointer"
                        title="Next Month"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main Content Grid: Month Grid + Selected Day Detail */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Calendar Month Grid */}
                  <div className="lg:col-span-8 bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-serenity overflow-hidden p-4 sm:p-6">
                    {/* Days of Week Header */}
                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                        <div key={day} className="text-[11px] font-bold text-slate-400 uppercase tracking-widest py-2 font-mono">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* 42 Cells Grid */}
                    <div className="grid grid-cols-7 gap-1.5">
                      {monthDays.map((day, idx) => {
                        const isCurrentMonth = day.getMonth() === calendarDate.getMonth();
                        const isToday = day.toDateString() === new Date().toDateString();
                        const isSelected = day.toDateString() === selectedCalendarDate.toDateString();
                        
                        const dayTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === day.toDateString());
                        const dayDeadlines = commitments.filter(c => c.deadline && new Date(c.deadline).toDateString() === day.toDateString());
                        const hasDeadline = dayDeadlines.length > 0;

                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedCalendarDate(day)}
                            className={`min-h-[100px] p-1.5 border rounded-xl flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden select-none group ${
                              isSelected
                                ? 'bg-indigo-50/20 border-[#6C5CE7] ring-2 ring-[#6C5CE7]/15 z-10'
                                : isToday
                                  ? 'bg-[#F0EEFF]/10 border-[#6C5CE7]/60 shadow-xs'
                                  : hasDeadline
                                    ? 'bg-rose-50/5 border-rose-250 hover:bg-rose-50/15'
                                    : 'bg-white hover:bg-slate-50 border-slate-200/80'
                            } ${!isCurrentMonth ? 'opacity-40 bg-slate-50/50' : ''}`}
                          >
                            {/* Accent Glow for Deadline days */}
                            {hasDeadline && (
                              <div className="absolute top-0 right-0 w-8 h-8 bg-rose-500/10 blur-md rounded-full pointer-events-none"></div>
                            )}

                            {/* Top row inside cell: Day number + indicators */}
                            <div className="flex justify-between items-center w-full">
                              <span className={`text-xs font-bold font-mono ${
                                isToday
                                  ? 'bg-[#6C5CE7] text-white w-5 h-5 rounded-full flex items-center justify-center shadow-2xs'
                                  : isSelected
                                    ? 'text-[#6C5CE7]'
                                    : 'text-slate-700'
                              }`}>
                                {day.getDate()}
                              </span>

                              <div className="flex items-center gap-1">
                                {hasDeadline && (
                                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Final Commitment Deadline!" />
                                )}
                                {dayTasks.length > 0 && (
                                  <span className="text-[10px] text-slate-400 font-mono font-bold">
                                    {dayTasks.filter(t => t.completed).length}/{dayTasks.length}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Center/Bottom Area: Items in the day */}
                            <div className="mt-1 flex-1 flex flex-col justify-end gap-1 overflow-hidden min-h-[50px]">
                              {/* Render Deadline marker if exists */}
                              {dayDeadlines.slice(0, 1).map(c => (
                                <div
                                  key={c.id}
                                  className="bg-rose-50 border border-rose-150 text-rose-700 px-1 py-0.5 rounded text-[9px] font-bold truncate flex items-center gap-0.5 shadow-3xs"
                                  title={`DEADLINE: ${c.title}`}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0 text-rose-500" />
                                  <span className="truncate">Deadline: {c.title}</span>
                                </div>
                              ))}

                              {/* Render up to 2 tasks */}
                              {dayTasks.slice(0, 2).map(t => (
                                <div
                                  key={t.id}
                                  className={`px-1 py-0.5 rounded text-[9px] truncate flex items-center gap-0.5 border transition-all ${
                                    t.completed
                                      ? 'bg-slate-50 border-slate-150 text-slate-400 line-through'
                                      : t.priority === 'critical'
                                        ? 'bg-rose-50 border-rose-100 text-rose-700 font-semibold'
                                        : t.priority === 'high'
                                          ? 'bg-amber-50 border-amber-100 text-amber-700 font-semibold'
                                          : 'bg-[#F0EEFF] border-[#E2DFFF] text-[#6C5CE7] font-medium'
                                  }`}
                                  title={t.title}
                                >
                                  {t.completed ? (
                                    <span className="text-emerald-500 font-bold text-[8px] flex-shrink-0">✓</span>
                                  ) : (
                                    <div className={`w-1 h-1 rounded-full flex-shrink-0 ${
                                      t.priority === 'critical' || t.priority === 'high' ? 'bg-red-500' : 'bg-[#6C5CE7]'
                                    }`} />
                                  )}
                                  <span className="truncate">{t.title}</span>
                                </div>
                              ))}

                              {/* More Indicator if 3+ items total */}
                              {(dayTasks.length + dayDeadlines.length) > 3 && (
                                <span className="text-[8px] text-slate-400 text-center font-bold block bg-slate-50 py-0.5 rounded border border-slate-100">
                                  +{ (dayTasks.length + dayDeadlines.length) - 3 } more
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Day Details Column */}
                  <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-serenity p-6" id="selected-day-panel">
                      <div className="border-b border-slate-100 pb-4 mb-4 flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-[#F0EEFF] text-[#6C5CE7] flex items-center justify-center">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Selected Day</h2>
                          <h3 className="font-display font-bold text-lg text-slate-900 mt-0.5">
                            {selectedCalendarDate.toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })}
                          </h3>
                        </div>
                      </div>

                      {/* No entries case */}
                      {selectedDateTasks.length === 0 && selectedDateDeadlines.length === 0 ? (
                        <div className="text-center py-10 px-4 space-y-2">
                          <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                            <Sparkle className="w-4 h-4 text-slate-300" />
                          </div>
                          <h4 className="font-semibold text-slate-700 text-sm">Nothing Scheduled</h4>
                          <p className="text-slate-400 text-xs leading-relaxed">
                            No tasks or final deadlines are scheduled on this date.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Deadlines Section */}
                          {selectedDateDeadlines.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-bold text-rose-500 uppercase tracking-widest font-mono flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                                <span>Deadlines ({selectedDateDeadlines.length})</span>
                              </h4>
                              <div className="space-y-2">
                                {selectedDateDeadlines.map(c => (
                                  <div
                                    key={c.id}
                                    className="p-3 bg-rose-50/50 border border-rose-150 rounded-xl flex flex-col justify-between gap-2 shadow-3xs"
                                  >
                                    <div className="min-w-0">
                                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded font-bold bg-rose-100 text-rose-700">
                                        Roadmap Deadline
                                      </span>
                                      <h5 className="font-bold text-slate-900 text-sm truncate mt-1.5">{c.title}</h5>
                                      <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                                        {c.description || 'Final deadline for this roadmap.'}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => handleSelectCommitment(c)}
                                      className="w-full mt-1 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                      <span>View AI Roadmap</span>
                                      <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Tasks Section */}
                          {selectedDateTasks.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-bold text-[#6C5CE7] uppercase tracking-widest font-mono flex items-center gap-1.5">
                                <Target className="w-4 h-4 text-[#6C5CE7] flex-shrink-0" />
                                <span>Tasks ({selectedDateTasks.length})</span>
                              </h4>
                              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
                                {selectedDateTasks.map(t => {
                                  const parentCommitment = commitments.find(c => c.id === t.commitmentId);
                                  return (
                                    <div
                                      key={t.id}
                                      className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2.5 ${
                                        t.completed
                                          ? 'bg-slate-50/80 border-slate-200/60 opacity-80'
                                          : 'bg-white border-slate-100 shadow-3xs hover:shadow-2xs'
                                      }`}
                                    >
                                      <div className="flex items-start gap-2.5">
                                        <button
                                          onClick={() => handleToggleTask(t.id, t.commitmentId)}
                                          className="mt-0.5 text-slate-400 hover:text-[#6C5CE7] transition-colors cursor-pointer"
                                        >
                                          <CheckCircle className={`w-4.5 h-4.5 ${t.completed ? 'text-emerald-500 fill-emerald-50' : 'text-slate-300'}`} />
                                        </button>
                                        <div className="min-w-0">
                                          <h5 className={`font-semibold text-slate-800 text-xs sm:text-sm leading-snug break-words ${t.completed ? 'line-through text-slate-400 font-normal' : ''}`}>
                                            {t.title}
                                          </h5>
                                          {t.description && (
                                            <p className="text-slate-500 text-[11px] leading-relaxed mt-1 break-words">
                                              {t.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-50 pt-2">
                                        {parentCommitment && (
                                          <span className="text-[9px] font-bold text-[#6C5CE7] bg-[#F0EEFF] px-2 py-0.5 rounded-full truncate max-w-[140px]" title={parentCommitment.title}>
                                            {parentCommitment.title}
                                          </span>
                                        )}
                                        <span className="text-[9px] text-slate-400 font-medium flex items-center gap-0.5">
                                          <Clock className="w-3 h-3 text-slate-400" />
                                          {t.estimatedMinutes}m
                                        </span>
                                        <span className={`text-[8px] uppercase font-mono px-1.5 py-0.2 rounded font-bold ${
                                          t.priority === 'critical'
                                            ? 'bg-rose-100 text-rose-700'
                                            : t.priority === 'high'
                                              ? 'bg-amber-100 text-amber-700'
                                              : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {t.priority}
                                        </span>
                                      </div>

                                      {!t.completed && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleGetTaskHelp(t);
                                          }}
                                          className="w-full mt-1.5 py-1.5 bg-[#F0EEFF] hover:bg-[#D9D6FF] text-[#6C5CE7] text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer border border-[#D9D6FF]"
                                        >
                                          <HelpCircle className="w-3.5 h-3.5" />
                                          <span>Need Help?</span>
                                        </button>
                                      )}

                                      {parentCommitment && (
                                        <button
                                          onClick={() => handleSelectCommitment(parentCommitment)}
                                          className="w-full mt-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                                        >
                                          <span>Go to Commitment</span>
                                          <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </motion.div>
            );
          })()}

          {/* AI PRODUCTIVITY COACH CHAT SCREEN */}
          {currentView === 'coach' && (
            <motion.div
              key="coach"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="max-w-6xl mx-auto space-y-6 pb-12 w-full"
            >


              {/* Grid Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Fixed Side Panel: Coach Briefing & Context */}
                <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24" id="coach-side-panel">
                  <div className="bg-[#0F172A] text-white p-6 rounded-2xl relative overflow-hidden shadow-[0_15px_40px_rgba(247,202,201,0.25)] border border-slate-800">
                    {/* Glow Blob 1 (Violet) */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#6C5CE7] opacity-25 blur-2xl -z-10 pointer-events-none"></div>
                    {/* Glow Blob 2 (Indigo) */}
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500 opacity-20 blur-2xl -z-10 pointer-events-none"></div>
                    
                    <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
                      <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center text-[#A29BFE]">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <h2 className="text-xs font-bold text-[#A29BFE] uppercase tracking-widest">
                        Coach Briefing
                      </h2>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mb-1">Coach Context</div>
                        <div className="text-base font-bold text-[#A29BFE] flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-[#A29BFE] rounded-full animate-pulse"></span>
                          <span>{commitments.length} Active {commitments.length === 1 ? 'Goal' : 'Goals'}</span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-1 leading-snug">
                          {allTasks.filter(t => !t.completed).length} incomplete tasks on radar
                        </div>
                      </div>

                      {/* Active commitments quick list */}
                      {activeCommitments.length > 0 && (
                        <div className="border-t border-white/10 pt-4 space-y-2">
                          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Active Commitments</div>
                          <div className="space-y-1.5 max-h-[160px] overflow-y-auto scrollbar-thin pr-1">
                            {activeCommitments.map(c => {
                              const progress = getCommitmentProgress(c.id);
                              return (
                                <div key={c.id} className="text-xs flex justify-between items-center bg-white/5 border border-white/5 rounded-lg p-2 gap-2">
                                  <span className="font-semibold text-slate-200 truncate flex-1" title={c.title}>{c.title}</span>
                                  <span className="text-[10px] font-bold text-[#A29BFE] shrink-0">{progress}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Coach tips strategy */}
                      <div className="border-t border-white/10 pt-4 space-y-2">
                        <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Strategy Tip</div>
                        <div className="bg-white/5 border border-white/5 rounded-lg p-3 text-[11px] text-slate-300 leading-relaxed space-y-2">
                          <p>{coachTips[0] || "Focus on checking off 1-2 small tasks today to maintain maximum momentum."}</p>
                          {coachTips[1] && <p className="opacity-85 border-t border-white/5 pt-2">{coachTips[1]}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Column: Chat Window */}
                <div className="lg:col-span-8">
                  <div className="glass-card border border-white/50 rounded-2xl shadow-serenity overflow-hidden flex flex-col h-[600px] relative" id="coach-chat-window">
                    {/* Messages Panel */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-0 scrollbar-thin" id="chat-messages-container">
                      {chatMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
                          <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin text-[#6C5CE7]" />
                          </div>
                          <p className="text-sm font-semibold text-slate-600">Syncing with Zenith Intelligence...</p>
                        </div>
                      ) : (
                        chatMessages.map((msg) => {
                          const isUser = msg.sender === 'user';
                          return (
                            <div
                              key={msg.id}
                              className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}
                            >
                              <div
                                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs ${
                                  isUser
                                    ? 'bg-[#6C5CE7] text-white rounded-tr-none font-medium'
                                    : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-150'
                                }`}
                              >
                                {!isUser && (
                                  <div className="flex items-center space-x-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6C5CE7] font-sans">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Zenith Coach</span>
                                  </div>
                                )}
                                <div className="whitespace-pre-wrap">{msg.text}</div>
                                <div
                                  className={`text-[9px] font-mono mt-1.5 text-right ${
                                    isUser ? 'text-slate-200' : 'text-slate-400'
                                  }`}
                                >
                                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      {chatLoading && (
                        <div className="flex justify-start w-full">
                          <div className="bg-slate-100 border border-slate-150 text-slate-800 rounded-2xl rounded-tl-none px-4 py-3 shadow-2xs max-w-[75%]">
                            <div className="flex items-center space-x-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-[#6C5CE7]">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Zenith Coach</span>
                            </div>
                            <div className="flex items-center space-x-2 py-1 text-slate-500">
                              <Loader2 className="w-4 h-4 animate-spin text-[#6C5CE7]" />
                              <span className="text-xs italic">Analyzing roadmap & drafting response...</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Suggested Quick Replies */}
                    <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-t border-slate-150 flex flex-wrap gap-2 shrink-0">
                      <button
                        disabled={chatLoading}
                        onClick={() => handleSendChatMessage("What should I focus on today?")}
                        className="bg-white hover:bg-slate-100 hover:border-slate-300 text-[11px] font-semibold text-slate-700 py-1.5 px-3 rounded-full border border-slate-200 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                      >
                        💡 What should I focus on today?
                      </button>
                      <button
                        disabled={chatLoading}
                        onClick={() => handleSendChatMessage("I'm falling behind. Help me replan.")}
                        className="bg-white hover:bg-slate-100 hover:border-slate-300 text-[11px] font-semibold text-slate-700 py-1.5 px-3 rounded-full border border-slate-200 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                      >
                        ⚠️ I'm falling behind
                      </button>
                      <button
                        disabled={chatLoading}
                        onClick={() => handleSendChatMessage("I finished everything for today!")}
                        className="bg-white hover:bg-slate-100 hover:border-slate-300 text-[11px] font-semibold text-slate-700 py-1.5 px-3 rounded-full border border-slate-200 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                      >
                        🎉 I finished today's work!
                      </button>
                    </div>

                    {/* Input Panel */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendChatMessage(chatInput);
                      }}
                      className="p-4 bg-white border-t border-slate-200 flex items-center gap-3 shrink-0"
                    >
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={chatLoading}
                        placeholder={chatLoading ? "Drafting reply..." : "Type a message to your coach..."}
                        className="flex-1 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#6C5CE7] focus:ring-2 focus:ring-[#6C5CE7]/10 rounded-xl px-4 py-3 text-sm outline-none transition-all disabled:opacity-70"
                        id="chat-input-field"
                      />
                      <button
                        type="submit"
                        disabled={!chatInput.trim() || chatLoading}
                        className="bg-[#0F172A] hover:bg-slate-800 disabled:opacity-50 text-white p-3 rounded-xl shadow-md transition-all flex items-center justify-center shrink-0 cursor-pointer"
                        id="chat-send-btn"
                      >
                        <ArrowRight className="w-5 h-5 text-[#A29BFE]" />
                      </button>
                    </form>
                  </div>
                </div>

              </div>
            </motion.div>
          )}

        </AnimatePresence>

      </main>

      {/* Modern, Aesthetic Footer */}
      {currentView !== 'create' && (
        <footer className="bg-white border-t border-slate-200 py-8 px-6 mt-16 text-center text-xs text-slate-400 font-mono space-y-3" id="app-footer">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-2 text-[#0F172A] font-sans font-semibold text-sm">
              <div className="w-6 h-6 bg-[#6C5CE7]/10 rounded flex items-center justify-center border border-[#6C5CE7]/20">
                <MountainSnow className="w-3.5 h-3.5 text-[#6C5CE7]" />
              </div>
              <span>Zenith</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>Built with focus for productivity pioneers</span>
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
            </div>
            <div>
              <span>© 2026. Guest Session Active</span>
            </div>
          </div>
        </footer>
      )}

      {/* Dynamic Replanning Modal */}
      <AnimatePresence>
        {showReplanModal && replanTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 sm:p-6"
            id="replan-modal-backdrop"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
              id="replan-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-[#0F172A] text-white p-6 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-[#A29BFE]" />
                  <h3 className="font-display font-extrabold text-lg">Couldn't Complete Task</h3>
                </div>
                <button
                  onClick={() => setShowReplanModal(false)}
                  className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                    Context / Task Name
                  </span>
                  <h4 className="font-display font-extrabold text-base text-slate-900 mt-1">
                    {replanTask.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {replanTask.description || 'No description provided.'}
                  </p>
                </div>

                {!replanResult && !replanningLoading && (
                  <div className="space-y-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                      Why couldn't you complete this?
                    </span>
                    <div className="grid grid-cols-1 gap-3">
                      {/* Option 1 */}
                      <div
                        id="replan-reason-no-time"
                        onClick={() => setReplanReason('No Time')}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col ${
                          replanReason === 'No Time'
                            ? 'bg-[#F0EEFF] border-[#6C5CE7] shadow-xs'
                            : 'bg-slate-50 border-slate-150 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <span className="font-bold text-sm text-slate-900">No Time</span>
                        <span className="text-xs text-slate-500 mt-0.5">My day was too packed.</span>
                      </div>

                      {/* Option 2 */}
                      <div
                        id="replan-reason-too-difficult"
                        onClick={() => setReplanReason('Too Difficult')}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col ${
                          replanReason === 'Too Difficult'
                            ? 'bg-[#F0EEFF] border-[#6C5CE7] shadow-xs'
                            : 'bg-slate-50 border-slate-150 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <span className="font-bold text-sm text-slate-900">Too Difficult</span>
                        <span className="text-xs text-slate-500 mt-0.5">I got stuck and need a smaller next step.</span>
                      </div>

                      {/* Option 3 */}
                      <div
                        id="replan-reason-unexpected"
                        onClick={() => setReplanReason('Unexpected Event')}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col ${
                          replanReason === 'Unexpected Event'
                            ? 'bg-[#F0EEFF] border-[#6C5CE7] shadow-xs'
                            : 'bg-slate-50 border-slate-150 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <span className="font-bold text-sm text-slate-900">Unexpected Event</span>
                        <span className="text-xs text-slate-500 mt-0.5">Something urgent disrupted the schedule.</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading state */}
                {replanningLoading && (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-[#6C5CE7]" />
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-800">Gemini is restructuring your plan...</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs leading-snug">
                        Evaluating remaining timeline, workloads, and buffers to protect your deadline.
                      </p>
                    </div>
                  </div>
                )}

                {/* Result view */}
                {replanResult && !replanningLoading && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 bg-[#F0EEFF] text-[#6C5CE7] text-[10px] font-bold font-mono uppercase px-2.5 py-1 rounded-full border border-[#D9D6FF]">
                        <Sparkles className="w-3 h-3 text-[#6C5CE7]" />
                        <span>Replanned in {replanResult.durationSeconds || 1.2}s</span>
                      </span>

                      {/* Deadline risk indicator */}
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        replanResult.deadlineRisk === 'low' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                        replanResult.deadlineRisk === 'medium' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                        'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          replanResult.deadlineRisk === 'low' ? 'bg-emerald-500' :
                          replanResult.deadlineRisk === 'medium' ? 'bg-amber-500' : 'bg-rose-500'
                        }`}></div>
                        <span>{replanResult.deadlineRisk} Deadline Risk</span>
                      </span>
                    </div>

                    {replanResult.isFallback && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2.5 rounded-xl font-medium">
                        Simplified replan applied
                      </div>
                    )}

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                        AI Strategist Analysis
                      </span>
                      <p className="text-xs text-slate-700 bg-slate-50 border border-slate-150 p-4 rounded-xl leading-relaxed">
                        {replanResult.explanation}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                        Updated Tasks (Incomplete Items)
                      </span>
                      <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                        {replanResult.updatedTasks.map((t: any, index: number) => {
                          // Check if task is different/updated compared to before
                          const originalTask = allTasks.find(oldTask => oldTask.id === t.id);
                          const isNew = !originalTask;
                          const isDateShifted = originalTask && originalTask.dueDate !== t.dueDate;
                          
                          return (
                            <div key={index} className="p-3.5 bg-slate-50/50 border border-slate-150 rounded-xl space-y-1.5 relative overflow-hidden">
                              {isNew && (
                                <div className="absolute right-0 top-0 bg-[#6C5CE7] text-white text-[8px] uppercase font-bold font-mono px-2 py-0.5 rounded-bl">
                                  New / Split
                                </div>
                              )}
                              {isDateShifted && !isNew && (
                                <div className="absolute right-0 top-0 bg-amber-500 text-white text-[8px] uppercase font-bold font-mono px-2 py-0.5 rounded-bl">
                                  Rescheduled
                                </div>
                              )}
                              <h5 className="font-bold text-xs text-slate-900 pr-14 leading-tight">{t.title}</h5>
                              <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{t.description}</p>
                              <div className="flex justify-between items-center pt-1 text-[10px] font-mono text-slate-400">
                                <span className="uppercase font-bold text-slate-500">{t.priority} priority</span>
                                <span className="flex items-center gap-1 font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Due {new Date(t.dueDate).toLocaleDateString()}</span>
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 p-6 border-t border-slate-150 flex justify-end gap-3 shrink-0">
                {!replanResult && !replanningLoading && (
                  <>
                    <button
                      onClick={() => setShowReplanModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      id="submit-replan-btn"
                      onClick={handleSubmitReplan}
                      disabled={!replanReason}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-[#A29BFE]" />
                      <span>Submit & Replan</span>
                    </button>
                  </>
                )}

                {replanResult && !replanningLoading && (
                  <button
                    id="confirm-replan-btn"
                    onClick={handleConfirmReplan}
                    className="w-full px-5 py-2.5 bg-[#0F172A] hover:bg-[#1e293b] text-white font-semibold text-xs rounded-xl shadow-md transition-all text-center"
                  >
                    Confirm & Apply New Plan
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Starting Scaffold / Need Help? Modal */}
      <AnimatePresence>
        {showTaskHelpModal && helpTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 sm:p-6"
            id="task-help-modal-backdrop"
            onClick={() => setShowTaskHelpModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
              id="task-help-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-[#0F172A] text-white p-6 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#A29BFE]" />
                  <h3 className="font-display font-extrabold text-lg">AI Starting Assistant</h3>
                </div>
                <button
                  onClick={() => setShowTaskHelpModal(false)}
                  className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                    Task you want to start
                  </span>
                  <h4 className="font-display font-extrabold text-base text-slate-900 mt-1">
                    {helpTask.title}
                  </h4>
                  {helpTask.description && (
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {helpTask.description}
                    </p>
                  )}
                </div>

                {taskHelpLoading && (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[#6C5CE7]" />
                    <div className="text-center space-y-1">
                      <p className="text-sm font-bold text-slate-700 animate-pulse">Building starting scaffolding...</p>
                      <p className="text-xs text-slate-400 font-medium">Clearing the clutter and laying down a simple path.</p>
                    </div>
                  </div>
                )}

                {taskHelpError && (
                  <div className="bg-rose-50 border border-rose-200 p-5 rounded-xl space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h5 className="font-bold text-rose-800 text-xs">Failed to Load Scaffold</h5>
                        <p className="text-[11px] text-rose-600 leading-relaxed">{taskHelpError}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleGetTaskHelp(helpTask)}
                      className="w-full py-2 bg-[#6C5CE7] hover:bg-[#5b4ec2] text-white font-bold text-xs rounded-lg transition-all"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {taskHelpData && !taskHelpLoading && (
                  <div className="space-y-6">
                    {/* Encouraging Opener */}
                    <div className="bg-[#F0EEFF]/60 border-l-4 border-[#6C5CE7] p-4 rounded-r-xl">
                      <p className="text-xs sm:text-sm text-slate-700 italic leading-relaxed">
                        "{taskHelpData.opener}"
                      </p>
                    </div>

                    {/* Key Things to Figure Out */}
                    <div className="space-y-2.5">
                      <h5 className="text-[11px] font-bold text-[#6C5CE7] uppercase tracking-widest font-mono flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-[#6C5CE7]" />
                        <span>Key Things to Figure Out</span>
                      </h5>
                      <ul className="space-y-2">
                        {taskHelpData.keyQuestions.map((q, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                            <span className="w-4.5 h-4.5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                              ?
                            </span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Simple Starting Structure */}
                    <div className="space-y-2.5">
                      <h5 className="text-[11px] font-bold text-[#6C5CE7] uppercase tracking-widest font-mono flex items-center gap-1.5">
                        <Lightbulb className="w-4 h-4 text-[#6C5CE7]" />
                        <span>Starting Structure / Scaffolding</span>
                      </h5>
                      <div className="space-y-2">
                        {taskHelpData.startingStructure.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 bg-slate-50/50 p-3 rounded-xl border border-slate-150">
                            <div className="w-4 h-4 rounded-full border-2 border-slate-300 mt-0.5 shrink-0"></div>
                            <span className="leading-relaxed">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Very Next Concrete Action */}
                    <div className="bg-slate-900 text-white p-4.5 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#A29BFE]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#A29BFE] font-mono">
                          Do This First Right Now
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-100 leading-relaxed">
                        {taskHelpData.nextAction}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 p-6 border-t border-slate-150 flex justify-end shrink-0">
                <button
                  onClick={() => setShowTaskHelpModal(false)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm w-full sm:w-auto"
                >
                  Close & Get Started
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
