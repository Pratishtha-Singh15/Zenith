/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, setDoc, getDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db, auth } from './firebase';
import { signInAnonymously } from 'firebase/auth';
import { User, Commitment, Task, Priority, ChatMessage } from '../types';

// Storage key for user session
const USER_STORAGE_KEY = 'momentum_ai_user';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser ? currentUser.uid : null,
      email: currentUser ? currentUser.email : null,
      emailVerified: currentUser ? currentUser.emailVerified : null,
      isAnonymous: currentUser ? currentUser.isAnonymous : null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Gets the current guest user from localStorage, or creates a new guest user
 * in both Firestore and localStorage if none exists.
 */
export async function getOrCreateGuestUser(): Promise<User> {
  // Ensure we sign in anonymously to Firebase Auth for security rules and correct auth context
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (authErr) {
      console.warn('Firebase Anonymous Auth is not enabled in Firebase Console (expected behavior if provider is disabled). Operations will fall back to guest ID-based validation.', authErr);
    }
  }

  const cached = localStorage.getItem(USER_STORAGE_KEY);
  if (cached) {
    try {
      const user = JSON.parse(cached) as User;
      // Double check Firestore existence
      const userDocRef = doc(db, 'users', user.id);
      try {
        const snap = await getDoc(userDocRef);
        if (!snap.exists()) {
          await setDoc(userDocRef, user);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.id}`);
      }
      return user;
    } catch (e) {
      console.error('Error parsing cached user, creating new one:', e);
    }
  }

  // Generate a random ID
  const userId = 'guest_' + Math.random().toString(36).substring(2, 15);
  const newUser: User = {
    id: userId,
    name: 'Guest Pioneer',
    isGuest: true,
  };

  // Save to localStorage
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));

  // Save to Firestore
  const userDocRef = doc(db, 'users', userId);
  try {
    await setDoc(userDocRef, newUser);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
  }

  return newUser;
}

/**
 * Saves a new commitment and its generated tasks to Firestore.
 */
export async function saveCommitmentAndTasks(
  userId: string,
  commitmentData: {
    title: string;
    description: string;
    deadline: string;
    availableTime: string;
    priority: Priority;
    summary?: string;
    milestones?: any[];
    priorityLogic?: string;
  },
  tasksData: {
    title: string;
    description: string;
    priority: Priority;
    impactLevel: 'low' | 'medium' | 'high';
    estimatedMinutes: number;
  }[]
): Promise<{ commitmentId: string }> {
  const commitmentId = 'commit_' + Math.random().toString(36).substring(2, 15);

  const newCommitment: Commitment = {
    id: commitmentId,
    userId,
    title: commitmentData.title,
    description: commitmentData.description,
    deadline: commitmentData.deadline,
    availableTime: commitmentData.availableTime,
    priority: commitmentData.priority,
    progress: 0,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  if (commitmentData.summary !== undefined) {
    newCommitment.summary = commitmentData.summary;
  }
  if (commitmentData.milestones !== undefined) {
    newCommitment.milestones = commitmentData.milestones;
  }
  if (commitmentData.priorityLogic !== undefined) {
    newCommitment.priorityLogic = commitmentData.priorityLogic;
  }

  // Save Commitment
  try {
    await setDoc(doc(db, 'commitments', commitmentId), newCommitment);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `commitments/${commitmentId}`);
  }

  // Use a batch to save Tasks
  const batch = writeBatch(db);
  
  const commitmentDeadline = new Date(commitmentData.deadline);
  const now = new Date();
  const diffMs = commitmentDeadline.getTime() - now.getTime();
  const N = tasksData.length || 1;

  // Tasks will be saved in the root 'tasks' collection, each linking back via commitmentId
  tasksData.forEach((taskData, index) => {
    const taskId = 'task_' + Math.random().toString(36).substring(2, 15);
    
    // Spread tasks sequentially from tomorrow up to 85% of the remaining time to the deadline
    // This ensures they are spaced out chronologically in order of their dependencies
    const fraction = (index + 1) / N;
    const taskTime = now.getTime() + (diffMs * 0.85) * fraction;
    const dueDate = new Date(taskTime).toISOString();

    const task: Task = {
      id: taskId,
      commitmentId,
      title: taskData.title,
      description: taskData.description,
      dueDate,
      completed: false,
      priority: taskData.priority,
      impactLevel: taskData.impactLevel,
      estimatedMinutes: taskData.estimatedMinutes,
    };

    const taskRef = doc(db, 'tasks', taskId);
    batch.set(taskRef, task);
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `tasks`);
  }

  return { commitmentId };
}

/**
 * Seeds the 3 demo commitments for standard dashboard evaluation.
 */
export async function seedDemoCommitments(userId: string): Promise<void> {
  const demos = [
    {
      commitment: {
        title: "Amazon Internship Interview",
        description: "Technical review and behavioural round prep. Key topics: Data structures, Algorithms, and Leadership Principles.",
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        availableTime: "weekdays 8pm-10pm, weekend 4 hours",
        priority: "critical" as Priority,
        summary: "A structured preparation roadmap to conquer the upcoming Amazon Internship Interview. Focus is split between core data structure practice and behavioral scenarios aligned with Amazon's Leadership Principles.",
        milestones: [
          { title: "DSA Foundations & Top Questions", description: "Implement and solve top LeetCode questions for Arrays, HashMaps, and LinkedLists." },
          { title: "STAR Method Behavioral Stories", description: "Format solid STAR stories focusing on bias for action, customer obsession, and ownership." },
          { title: "Live Mock Simulation", description: "Simulate a live technical and behavioral interview under timed pressure." }
        ],
        priorityLogic: "We have prioritized core algorithm practice first to establish technical confidence, followed by behavioral frameworks, culminating in a mock interview to refine timing and pacing."
      },
      tasks: [
        { title: "Review Arrays, HashMaps, and LinkedLists", description: "Solve 5 top LeetCode questions for each data structure.", priority: "critical" as Priority, impactLevel: "high" as const, estimatedMinutes: 120 },
        { title: "Behavioral Prep: Leadership Principles", description: "Format 3 solid STAR stories focusing on bias for action and ownership.", priority: "high" as Priority, impactLevel: "high" as const, estimatedMinutes: 90 },
        { title: "Mock Technical Interview Session", description: "Simulate a live interview with a peer or a coding platform tracker.", priority: "high" as Priority, impactLevel: "medium" as const, estimatedMinutes: 60 }
      ]
    },
    {
      commitment: {
        title: "Client Proposal Submission",
        description: "Redesign proposal and pricing scope document for Acme Corp web development overhaul.",
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
        availableTime: "2 hours daily during working hours",
        priority: "high" as Priority,
        summary: "Comprehensive proposal and pricing package for Acme Corp's web development overhaul. Focuses on aligning technical architecture, delivery milestones, and pricing models into a professional deck.",
        milestones: [
          { title: "Scope & System Architecture Design", description: "Outline system design specifications, tech stack choices, and deployment pipelines." },
          { title: "Pricing and Cost Deliverables Matrix", description: "Review effort estimates and assign clear milestone-based pricing blocks." },
          { title: "Polishing Presentation", description: "Design an elegant layout and verify presentation meets brand standards." }
        ],
        priorityLogic: "Drafting the technical scope is prioritized to solidify the work boundary, enabling precise estimation for the cost matrix, and finishing with layout polishing."
      },
      tasks: [
        { title: "Draft Technical Architecture Scope", description: "Outline system design specifications, tech stack choices, and deployment pipelines.", priority: "high" as Priority, impactLevel: "high" as const, estimatedMinutes: 90 },
        { title: "Finalize Deliverables Cost Matrix", description: "Review effort estimates and assign clear milestone-based pricing blocks.", priority: "high" as Priority, impactLevel: "high" as const, estimatedMinutes: 60 },
        { title: "Format PDF Document", description: "Design an elegant cover and verify layout looks perfect with correct brand colors.", priority: "medium" as Priority, impactLevel: "medium" as const, estimatedMinutes: 45 }
      ]
    },
    {
      commitment: {
        title: "Investor Pitch Deck",
        description: "Create a 10-slide seed round presentation covering Problem, Solution, Market Size, and Financial Traction.",
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days from now
        availableTime: "weekends 6 hours, weekdays 1 hour",
        priority: "high" as Priority,
        summary: "A high-impact 10-slide seed-round presentation designed to secure initial funding. Key areas include bottom-up market sizing (TAM/SAM/SOM), clear financial projections, and a polished elevator pitch.",
        milestones: [
          { title: "Bottom-Up Market Validation Sizing", description: "Calculate bottom-up TAM, SAM, and SOM sizing metrics backed by industry research." },
          { title: "Three-Year Financial Projections", description: "Create a simple, realistic 3-year revenue and expense model graph." },
          { title: "Elevator Pitch and Flow Optimization", description: "Practice a concise, high-impact 1-minute intro to capture focus immediately." }
        ],
        priorityLogic: "Validation data must be calculated first to support the financial model, followed by model layout and verbal pitch rehearsal."
      },
      tasks: [
        { title: "Draft Market Validation Analysis", description: "Calculate bottom-up TAM, SAM, and SOM sizing metrics backed by primary industry research.", priority: "high" as Priority, impactLevel: "high" as const, estimatedMinutes: 120 },
        { title: "Design Financial Projections Slide", description: "Create a simple, realistic 3-year revenue and expense model graph.", priority: "high" as Priority, impactLevel: "high" as const, estimatedMinutes: 90 },
        { title: "Refine Elevator Pitch Strategy", description: "Practice a concise, high-impact 1-minute intro to capture focus immediately.", priority: "medium" as Priority, impactLevel: "medium" as const, estimatedMinutes: 45 }
      ]
    }
  ];

  for (const demo of demos) {
    await saveCommitmentAndTasks(userId, demo.commitment, demo.tasks);
  }
}

/**
 * Retrieves all commitments saved for a specific user ID.
 */
export async function getCommitments(userId: string): Promise<Commitment[]> {
  try {
    const q = query(collection(db, 'commitments'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const commitments: Commitment[] = [];
    querySnapshot.forEach((doc) => {
      commitments.push({ id: doc.id, ...doc.data() } as Commitment);
    });
    // Sort by createdAt descending
    return commitments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `commitments`);
  }
}

/**
 * Retrieves all tasks saved for a specific commitment ID.
 */
export async function getTasksForCommitment(commitmentId: string): Promise<Task[]> {
  try {
    const q = query(collection(db, 'tasks'), where('commitmentId', '==', commitmentId));
    const querySnapshot = await getDocs(q);
    const tasks: Task[] = [];
    querySnapshot.forEach((doc) => {
      tasks.push({ id: doc.id, ...doc.data() } as Task);
    });
    return tasks;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `tasks`);
  }
}

/**
 * Updates a task's completion status in Firestore and recalculates the parent commitment's progress.
 */
export async function updateTaskCompletion(
  taskId: string,
  commitmentId: string,
  completed: boolean
): Promise<void> {
  try {
    // 1. Update the task
    const taskRef = doc(db, 'tasks', taskId);
    await setDoc(taskRef, { completed }, { merge: true });

    // 2. Fetch all tasks for this commitment to recalculate progress
    const allTasks = await getTasksForCommitment(commitmentId);
    const total = allTasks.length;
    const completedCount = allTasks.filter(t => t.completed).length;
    const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    const status = progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending';

    // 3. Update the commitment
    const commitmentRef = doc(db, 'commitments', commitmentId);
    await setDoc(commitmentRef, { progress, status }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `tasks/${taskId}`);
  }
}

/**
 * Retrieves all tasks for a list of commitment IDs.
 */
export async function getAllTasksForCommitments(commitmentIds: string[]): Promise<Task[]> {
  if (commitmentIds.length === 0) return [];
  try {
    const promises = commitmentIds.map(id => getTasksForCommitment(id));
    const results = await Promise.all(promises);
    return results.flat();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `allTasks`);
  }
}

/**
 * Saves replanned tasks for a commitment. It deletes existing incomplete tasks,
 * then saves the new set of replanned tasks.
 */
export async function saveReplannedTasks(
  commitmentId: string,
  updatedTasks: any[]
): Promise<void> {
  try {
    // 1. Get all current tasks for this commitment
    const existingTasks = await getTasksForCommitment(commitmentId);
    
    // 2. Identify and delete all incomplete tasks using a batch
    const batch = writeBatch(db);
    const incompleteTasks = existingTasks.filter(t => !t.completed);
    incompleteTasks.forEach((task) => {
      batch.delete(doc(db, 'tasks', task.id));
    });

    // 3. Add all new replanned tasks (which are incomplete by definition or newly split)
    updatedTasks.forEach((taskData) => {
      // Use existing task ID if present and not already completed, otherwise generate a new one
      const taskId = taskData.id && !existingTasks.some(t => t.id === taskData.id && t.completed)
        ? taskData.id 
        : 'task_' + Math.random().toString(36).substring(2, 15);

      const task: Task = {
        id: taskId,
        commitmentId,
        title: taskData.title,
        description: taskData.description,
        dueDate: taskData.dueDate,
        completed: false, // Incomplete
        priority: taskData.priority,
        impactLevel: taskData.impactLevel,
        estimatedMinutes: taskData.estimatedMinutes,
      };

      const taskRef = doc(db, 'tasks', taskId);
      batch.set(taskRef, task);
    });

    await batch.commit();

    // 4. Recalculate progress for the parent commitment
    const allTasks = await getTasksForCommitment(commitmentId);
    const total = allTasks.length;
    const completedCount = allTasks.filter(t => t.completed).length;
    const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    const status = progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending';

    const commitmentRef = doc(db, 'commitments', commitmentId);
    await setDoc(commitmentRef, { progress, status }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `replanTasks/${commitmentId}`);
  }
}

/**
 * Saves a new chat message to Firestore under a 'messages' collection.
 */
export async function saveChatMessage(
  userId: string,
  sender: 'user' | 'assistant',
  text: string,
  customId?: string
): Promise<ChatMessage> {
  try {
    const messageId = customId || ('msg_' + Math.random().toString(36).substring(2, 15));
    const message: ChatMessage = {
      id: messageId,
      userId,
      sender,
      text,
      createdAt: new Date().toISOString(),
    };

    const messageRef = doc(db, 'messages', messageId);
    await setDoc(messageRef, message);
    return message;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `messages`);
  }
}

/**
 * Retrieves chat messages for a specific user, sorted chronologically.
 */
export async function getChatMessages(userId: string): Promise<ChatMessage[]> {
  try {
    const q = query(collection(db, 'messages'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const messages: ChatMessage[] = [];
    querySnapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() } as ChatMessage);
    });
    // Sort by createdAt ascending
    return messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `messages`);
  }
}

/**
 * Permanently deletes a commitment and all its associated tasks from Firestore.
 */
export async function deleteCommitmentAndTasks(commitmentId: string): Promise<void> {
  try {
    // 1. Get all tasks for this commitment
    const tasks = await getTasksForCommitment(commitmentId);
    
    // 2. Delete tasks and commitment using a write batch
    const batch = writeBatch(db);
    tasks.forEach((task) => {
      batch.delete(doc(db, 'tasks', task.id));
    });
    batch.delete(doc(db, 'commitments', commitmentId));
    
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `commitments/${commitmentId}`);
  }
}

/**
 * Permanently deletes all commitments and associated tasks for a user to start fresh.
 */
export async function resetUserSessionData(userId: string): Promise<void> {
  try {
    const commitments = await getCommitments(userId);
    const batch = writeBatch(db);
    
    for (const commitment of commitments) {
      const tasks = await getTasksForCommitment(commitment.id);
      tasks.forEach((task) => {
        batch.delete(doc(db, 'tasks', task.id));
      });
      batch.delete(doc(db, 'commitments', commitment.id));
    }
    
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${userId}/reset`);
  }
}


