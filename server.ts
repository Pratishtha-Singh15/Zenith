/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Gemini SDK with telemetry header as requested
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

app.use(express.json());

// Helper function to robustly clean markdown fences and parse JSON
function cleanJsonString(str: string): string {
  let cleaned = str.trim();
  // Remove markdown code block wrappers if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

function parseGeminiJson(str: string): any {
  const cleaned = cleanJsonString(str);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Try to extract JSON if there's other text surrounding it
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (nestedErr) {
        throw new Error(`Failed to parse extracted JSON block: ${(nestedErr as Error).message}`);
      }
    }
    throw err;
  }
}

// Logger utility to write inputs/outputs/errors to gemini_debug_log.json
function logGeminiDebug(payload: any, rawResponse: string | null, error: any) {
  try {
    const logPath = path.join(process.cwd(), 'gemini_debug_log.json');
    let currentLog: any = { apiKeyConfigured: false, apiKeyPrefix: '', lastUpdated: '', history: [] };
    if (fs.existsSync(logPath)) {
      try {
        currentLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      } catch (e) {
        // Ignore error, start fresh
      }
    }
    
    const key = process.env.GEMINI_API_KEY || '';
    currentLog.apiKeyConfigured = !!key;
    currentLog.apiKeyPrefix = key ? `${key.substring(0, 6)}... (length: ${key.length})` : 'NOT_SET';
    currentLog.lastUpdated = new Date().toISOString();
    
    if (!currentLog.history) {
      currentLog.history = [];
    }
    
    currentLog.history.unshift({
      timestamp: new Date().toISOString(),
      payload,
      rawResponse,
      error: error ? (error instanceof Error ? error.message : String(error)) : null,
    });
    
    // Keep last 10 entries
    if (currentLog.history.length > 10) {
      currentLog.history = currentLog.history.slice(0, 10);
    }
    
    fs.writeFileSync(logPath, JSON.stringify(currentLog, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing gemini_debug_log.json:', e);
  }
}

// API route for AI Plan Generation
app.post('/api/generate-plan', async (req, res) => {
  const { title, description, deadline, availableTime, priority } = req.body;

  if (!title || !deadline) {
    return res.status(400).json({ error: 'Title and deadline are required.' });
  }

  const prompt = `You are an expert productivity strategist. Goal: ${title} — ${description || ''}. Deadline: ${deadline}. Available time: ${availableTime || ''}. Priority: ${priority}. Generate a JSON object with: summary (string), milestones (array of {title, description}), tasks (array of {title, description, priority, impactLevel, estimatedMinutes}), and priorityLogic (a short string explaining why tasks were sequenced this way).

PLAIN LANGUAGE DIRECTIVE:
Write all text (including summary, milestone descriptions, task descriptions, and priority logic) in plain, everyday language a busy, possibly stressed user would understand immediately — avoid jargon, business-speak, or overly formal phrasing. Write like a helpful, clear-speaking friend, not a corporate strategist.

CRITICAL DIRECTIVE ON SEQUENCING AND LOGICAL DEPENDENCIES:
You MUST sequence the tasks in a strict, logical chronological order of implementation. For development-style commitments, adhere to this precise linear progression:
1. SCOPING & DEFINITION FIRST: Scoping, requirements gathering, or specification tasks (e.g., 'Define MVP Scope', 'Draft Specs') MUST appear at the absolute beginning of the task list.
2. ENVIRONMENT & SETUP SECOND: General environment configuration, repository initialization, or basic infrastructure tasks (e.g., 'Environment Setup') MUST appear next.
3. CORE IMPLEMENTATION THIRD: Active development, building, and coding of components (e.g., 'Backend API Development', 'Frontend UI Implementation') MUST follow.
4. VERIFICATION & TESTING FOURTH: Testing, verification, or integration checks (e.g., 'Integration Testing') MUST come AFTER both the backend and frontend are built.
5. POLISH, PITCH, & DEMO LAST: Refinement, preparing materials for presentation, or final deployment (e.g., 'Pitch & Demo Preparation') MUST be scheduled at the very end.

Verify your final generated array of tasks to ensure NO task violates this chronological dependency chain (e.g., never put Integration Testing before MVP Scope definition or Setup, never put Demo Prep before active development). Priority labels indicate urgency but MUST NOT disrupt this logical linear workflow.

Return ONLY valid JSON, no markdown formatting.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: 'A brief encouraging summary of the plan.',
      },
      milestones: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ['title', 'description'],
        },
      },
      tasks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            priority: {
              type: Type.STRING,
              description: "Must be one of 'low', 'medium', 'high', 'critical'",
            },
            impactLevel: {
              type: Type.STRING,
              description: "Must be one of 'low', 'medium', 'high'",
            },
            estimatedMinutes: {
              type: Type.INTEGER,
              description: 'Estimated minutes to complete this task.',
            },
          },
          required: ['title', 'description', 'priority', 'impactLevel', 'estimatedMinutes'],
        },
      },
      priorityLogic: {
        type: Type.STRING,
        description: 'Explanation of the sequencing rationale.',
      },
    },
    required: ['summary', 'milestones', 'tasks', 'priorityLogic'],
  };

  const getFallbackPlan = () => ({
    summary: "A direct fallback action plan designed to keep you moving forward and building momentum.",
    milestones: [
      { title: "Project Inception", description: "Establish the foundation and define the core deliverables." },
      { title: "Core Implementation", description: "Execute the critical pathways and build the main features." },
      { title: "Polishing & Review", description: "Final test, adjustment of details, and completion of the goal." }
    ],
    tasks: [
      {
        title: "Define Key Deliverables",
        description: "Draft a specific list of what needs to be delivered to achieve the goal.",
        priority: priority || "high",
        impactLevel: "high",
        estimatedMinutes: 60
      },
      {
        title: "Initial Development Block",
        description: "Dedicate a focused block of time to build out the major components.",
        priority: priority || "high",
        impactLevel: "high",
        estimatedMinutes: 120
      },
      {
        title: "Review & Refine Deliverable",
        description: "Polish all elements, verify against the deadline requirements, and complete.",
        priority: priority || "medium",
        impactLevel: "medium",
        estimatedMinutes: 60
      }
    ],
    priorityLogic: "Sequenced linearly to guarantee incremental progress. Starting with definition allows clear action, while reserving polishing for the end ensures standard quality control."
  });

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const generateWithRetry = async (attempt = 1): Promise<any> => {
    let responseText = null;
    const modelToUse = attempt === 1 
      ? 'gemini-3.1-flash-lite' 
      : (attempt === 2 ? 'gemini-3.5-flash' : 'gemini-flash-latest');
    try {
      console.log(`Generating plan using model: ${modelToUse} (attempt ${attempt})...`);
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.7,
        },
      });

      responseText = response.text;
      if (!responseText) {
        throw new Error('Empty response from Gemini API');
      }

      const parsed = parseGeminiJson(responseText);
      // Validate structure roughly to ensure it matches
      if (!parsed.summary || !Array.isArray(parsed.milestones) || !Array.isArray(parsed.tasks) || !parsed.priorityLogic) {
        throw new Error('Response JSON is missing required fields');
      }
      
      // Log successful generation
      logGeminiDebug({ title, description, deadline, availableTime, priority, attempt, modelUsed: modelToUse }, responseText, null);
      return parsed;
    } catch (err) {
      console.error(`Gemini generation attempt ${attempt} with ${modelToUse} failed:`, err);
      logGeminiDebug({ title, description, deadline, availableTime, priority, attempt, modelUsed: modelToUse }, responseText, err);
      if (attempt < 3) {
        const nextDelay = attempt * 1000;
        console.log(`Waiting ${nextDelay}ms before retry attempt ${attempt + 1}...`);
        await delay(nextDelay);
        return generateWithRetry(attempt + 1);
      }
      throw err;
    }
  };

  try {
    const plan = await generateWithRetry(1);
    res.json(plan);
  } catch (err) {
    console.error('All attempts to generate plan via Gemini failed. Serving fallback plan.');
    res.json(getFallbackPlan());
  }
});

// API route for Dynamic Replanning
app.post('/api/replan', async (req, res) => {
  const { task, reason, commitment, allTasks } = req.body;

  if (!task || !reason || !commitment || !allTasks) {
    return res.status(400).json({ error: 'Task, reason, commitment, and allTasks are required.' });
  }

  const prompt = `The user could not complete this task: ${task.title} — ${task.description || ''}. Reason given: ${reason}. This task belongs to the commitment '${commitment.title}' with deadline ${commitment.deadline}. Current full task list: ${JSON.stringify(allTasks)}. Reorganize the remaining incomplete tasks to protect the original deadline — do not simply push everything later. Restructure intelligently: this may mean splitting a task into smaller pieces, reordering by impact, adding a buffer/recovery block, or adjusting time estimates.

PLAIN LANGUAGE DIRECTIVE:
Write all text (including explanation) in plain, everyday language a busy, possibly stressed user would understand immediately — avoid jargon, business-speak, or overly formal phrasing. Write like a helpful, clear-speaking friend, not a corporate strategist.

CRITICAL DIRECTIVE ON SEQUENCING, LOGICAL DEPENDENCIES, AND DUE DATES:
1. You MUST sequence the tasks in a strict, logical chronological order of implementation. For development-style projects, adhere to this precise linear progression:
   - SCOPING & DEFINITION FIRST: Scoping/requirements tasks (e.g., 'Define MVP Scope') MUST be placed first.
   - SETUP & ENVIRONMENT SECOND: Infrastructure tasks (e.g., 'Environment Setup') MUST follow.
   - CORE BUILDING THIRD: Backend and frontend development tasks (e.g., 'Backend API Development', 'Frontend UI Implementation') MUST come after setup.
   - TESTING FOURTH: Integration and testing tasks (e.g., 'Integration Testing') MUST be placed only after the development tasks.
   - POLISH & DEMO LAST: Demo prep, presentation slides, or deployment (e.g., 'Pitch & Demo Preparation') MUST be scheduled at the absolute end.
2. Ensure that tasks that other tasks depend on are placed earlier and assigned earlier due dates. Double check your generated sequence to make sure there are no backwards steps (e.g., no 'Integration Testing' scheduled before frontend/backend development, no 'Pitch & Demo Preparation' scheduled before active code building).
3. Assign sensible, sequenced, and distributed due dates (in YYYY-MM-DD format) to different tasks so they do not collapse onto the same day unless absolutely unavoidable due to extreme proximity to the deadline. Space their due dates out chronologically over the remaining timeline leading up to the deadline.

Return ONLY valid JSON with this shape: { updatedTasks: [{ id: string, title: string, description: string, priority: string, impactLevel: string, estimatedMinutes: number, dueDate: string }], explanation: string, deadlineRisk: string }`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      updatedTasks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "The original task id if updating/rescheduling an existing task, otherwise a new unique id or empty." },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            priority: { type: Type.STRING, description: "Must be 'low', 'medium', 'high', or 'critical'." },
            impactLevel: { type: Type.STRING, description: "Must be 'low', 'medium', or 'high'." },
            estimatedMinutes: { type: Type.INTEGER },
            dueDate: { type: Type.STRING, description: "Due date in YYYY-MM-DD format on or before commitment deadline." },
          },
          required: ['title', 'description', 'priority', 'impactLevel', 'estimatedMinutes', 'dueDate'],
        },
      },
      explanation: { type: Type.STRING },
      deadlineRisk: { type: Type.STRING, description: "Must be 'low', 'medium', or 'high'." },
    },
    required: ['updatedTasks', 'explanation', 'deadlineRisk'],
  };

  const getFallbackReplan = () => {
    // Sort incomplete tasks so that the failed task is scheduled for tomorrow, and others follow chronologically
    const incomplete = [...allTasks.filter((t: any) => !t.completed)];
    incomplete.sort((a, b) => {
      if (a.id === task.id) return -1;
      if (b.id === task.id) return 1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    const today = new Date();
    const deadlineDate = new Date(commitment.deadline);
    
    const updatedTasks = incomplete.map((t, idx) => {
      // Assign consecutive days starting from tomorrow (index 0 is tomorrow, index 1 is tomorrow + 1 day, etc.)
      const targetDate = new Date(today.getTime() + (idx + 1) * 24 * 60 * 60 * 1000);
      const finalDate = targetDate > deadlineDate ? deadlineDate : targetDate;
      const formattedDate = finalDate.toISOString().split('T')[0];
      
      return {
        ...t,
        dueDate: formattedDate,
      };
    });

    return {
      updatedTasks,
      explanation: "Simplified replan applied: The missed task and subsequent incomplete tasks have been sequentially shifted forward to maintain chronological spacing without overlapping.",
      deadlineRisk: "medium",
      isFallback: true
    };
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const generateWithRetry = async (attempt = 1): Promise<any> => {
    let responseText = null;
    const modelToUse = attempt === 1 
      ? 'gemini-3.1-flash-lite' 
      : (attempt === 2 ? 'gemini-3.5-flash' : 'gemini-flash-latest');
    try {
      console.log(`Running dynamic replanning using model: ${modelToUse} (attempt ${attempt})...`);
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.7,
        },
      });

      responseText = response.text;
      if (!responseText) {
        throw new Error('Empty response from Gemini API for replanning');
      }

      const parsed = parseGeminiJson(responseText);
      if (!Array.isArray(parsed.updatedTasks) || !parsed.explanation || !parsed.deadlineRisk) {
        throw new Error('Response JSON is missing required fields for replanning');
      }

      logGeminiDebug({ task, reason, commitment, attempt, modelUsed: modelToUse }, responseText, null);
      return parsed;
    } catch (err) {
      console.error(`Gemini replanning attempt ${attempt} with ${modelToUse} failed:`, err);
      logGeminiDebug({ task, reason, commitment, attempt, modelUsed: modelToUse }, responseText, err);
      if (attempt < 3) { // Try three times
        const nextDelay = attempt * 1000;
        console.log(`Waiting ${nextDelay}ms before retry attempt ${attempt + 1}...`);
        await delay(nextDelay);
        return generateWithRetry(attempt + 1);
      }
      throw err;
    }
  };

  try {
    const plan = await generateWithRetry(1);
    res.json(plan);
  } catch (err) {
    console.error('All attempts to replan via Gemini failed. Serving fallback simplified replan.');
    res.json(getFallbackReplan());
  }
});

// API route for AI Productivity Coach Chat
app.post('/api/coach-chat', async (req, res) => {
  const { message, commitments, incompleteTasks } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const prompt = `You are Zenith Coach, an AI productivity coach. Here is the user's current state — Active commitments: ${JSON.stringify(commitments || [])}. Incomplete high-priority tasks: ${JSON.stringify(incompleteTasks || [])}. The user just said: '${message}'. Respond with focused, specific guidance that references their actual commitments and tasks by name — never give generic productivity advice that could apply to anyone. Write all text in plain, everyday language a busy, possibly stressed user would understand immediately — avoid jargon, business-speak, or overly formal phrasing. Write like a helpful, clear-speaking friend, not a corporate strategist. Keep responses to 2-4 sentences, conversational but direct.`;

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const generateWithRetry = async (attempt = 1): Promise<string> => {
    const modelToUse = attempt === 1 
      ? 'gemini-3.1-flash-lite' 
      : (attempt === 2 ? 'gemini-3.5-flash' : 'gemini-flash-latest');
    try {
      console.log(`Running coach chat generation using model: ${modelToUse} (attempt ${attempt})...`);
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: {
          temperature: 0.7,
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Empty response from Gemini API for coach chat');
      }

      logGeminiDebug(
        { message, commitmentsCount: (commitments || []).length, tasksCount: (incompleteTasks || []).length, attempt, modelUsed: modelToUse },
        responseText,
        null
      );
      return responseText;
    } catch (err) {
      console.error(`Gemini coach chat attempt ${attempt} with ${modelToUse} failed:`, err);
      logGeminiDebug({ message, attempt, modelUsed: modelToUse }, null, err);
      if (attempt < 3) {
        const nextDelay = attempt * 1000;
        console.log(`Waiting ${nextDelay}ms before retry attempt ${attempt + 1}...`);
        await delay(nextDelay);
        return generateWithRetry(attempt + 1);
      }
      throw err;
    }
  };

  try {
    const replyText = await generateWithRetry(1);
    res.json({ reply: replyText });
  } catch (err) {
    console.error('All attempts to call Gemini for coach chat failed.');
    
    // Fallback: search for the highest priority incomplete task with nearest deadline
    let fallbackText = "I'm having trouble connecting right now — in the meantime, make sure you keep the momentum going on your goals!";
    if (incompleteTasks && incompleteTasks.length > 0) {
      const highestPriorityTask = incompleteTasks[0];
      fallbackText = `I'm having trouble connecting right now — in the meantime, focus on "${highestPriorityTask.title}", since it is a high-priority task on your roadmap. You've got this!`;
    }
    res.json({ reply: fallbackText, isFallback: true });
  }
});

// API route for "Need Help?" starting scaffolding
app.post('/api/task-help', async (req, res) => {
  const { title, description, priority, commitmentTitle, commitmentDescription } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Task title is required.' });
  }

  const prompt = `The user is feeling overwhelmed and needs help starting this task right now. Task: ${title} — ${description || 'No description provided'}. This is part of the commitment: ${commitmentTitle || 'No commitment title'} — ${commitmentDescription || 'No commitment description'}. Give them a structured starting point (key questions to figure out, a simple outline or checklist, and one clear next action) to help them begin immediately. Do NOT write the finished work for them — give them the scaffolding to do it themselves, faster and with less panic. Keep the tone warm and calm, plain language, no jargon. Return ONLY valid JSON with: opener (string), keyQuestions (array of strings), startingStructure (array of strings), nextAction (string).`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      opener: {
        type: Type.STRING,
        description: "A short, encouraging opening line acknowledging this can feel overwhelming, then getting straight to practical help."
      },
      keyQuestions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-4 specific questions or subtopics this task actually requires to figure out."
      },
      startingStructure: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "A simple starting structure - a short outline, checklist, or first-step breakdown."
      },
      nextAction: {
        type: Type.STRING,
        description: "One sentence suggesting the very next concrete action to take right now."
      }
    },
    required: ['opener', 'keyQuestions', 'startingStructure', 'nextAction']
  };

  const getFallbackHelp = () => ({
    opener: `It is completely normal to feel overwhelmed when tackling "${title}". Let's clear the noise and take a simple first step together.`,
    keyQuestions: [
      "What is the single most important question you need to answer to make progress?",
      "What information or resources do you already have, and what is missing?",
      "What does a 'good enough' first draft look like?",
      "Identify the one thing blocking you most right now."
    ],
    startingStructure: [
      "1. Clarify the core requirement (Write down a 1-sentence definition of done)",
      "2. Brainstorm raw ideas (Write for 5 minutes without editing yourself)",
      "3. Group and organize (Put those ideas into a basic order)",
      "4. Polish (Refine and format the final output)"
    ],
    nextAction: "Grab a piece of paper or open a blank document, and write down the name of this task to begin."
  });

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const generateWithRetry = async (attempt = 1): Promise<any> => {
    let responseText = null;
    const modelToUse = attempt === 1 
      ? 'gemini-3.1-flash-lite' 
      : (attempt === 2 ? 'gemini-3.5-flash' : 'gemini-flash-latest');
    try {
      console.log(`Generating task starting point using model: ${modelToUse} (attempt ${attempt})...`);
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.7,
        },
      });

      responseText = response.text;
      if (!responseText) {
        throw new Error('Empty response from Gemini API');
      }

      const parsed = parseGeminiJson(responseText);
      // Validate structure roughly to ensure it matches
      if (!parsed.opener || !Array.isArray(parsed.keyQuestions) || !Array.isArray(parsed.startingStructure) || !parsed.nextAction) {
        throw new Error('Response JSON is missing required fields');
      }
      
      // Log successful generation
      logGeminiDebug({ title, description, priority, commitmentTitle, commitmentDescription, attempt, modelUsed: modelToUse }, responseText, null);
      return parsed;
    } catch (err) {
      console.error(`Gemini task help generation attempt ${attempt} with ${modelToUse} failed:`, err);
      logGeminiDebug({ title, description, priority, commitmentTitle, commitmentDescription, attempt, modelUsed: modelToUse }, responseText, err);
      if (attempt < 3) {
        const nextDelay = attempt * 1000;
        console.log(`Waiting ${nextDelay}ms before retry attempt ${attempt + 1}...`);
        await delay(nextDelay);
        return generateWithRetry(attempt + 1);
      }
      throw err;
    }
  };

  try {
    const helpData = await generateWithRetry(1);
    res.json(helpData);
  } catch (err) {
    console.error('All attempts to generate task help via Gemini failed. Serving fallback.');
    res.json(getFallbackHelp());
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    
    // Asynchronous self-test on startup to verify Gemini connection across multiple models if necessary
    (async () => {
      const modelsToTest = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'];
      for (const modelName of modelsToTest) {
        try {
          console.log(`Running Gemini startup self-test with ${modelName}...`);
          const testResponse = await ai.models.generateContent({
            model: modelName,
            contents: 'Generate a JSON object: {"status": "success", "message": "Gemini API is connected successfully!"}',
            config: {
              responseMimeType: 'application/json',
            },
          });
          console.log(`Gemini startup self-test with ${modelName} succeeded.`);
          logGeminiDebug(
            { title: `Startup Self-Test (${modelName})`, description: "Verifying Gemini connectivity" },
            testResponse.text || null,
            null
          );
          return; // Successfully connected, stop testing other models
        } catch (err) {
          console.error(`Gemini startup self-test with ${modelName} failed:`, err);
          logGeminiDebug(
            { title: `Startup Self-Test (${modelName})`, description: "Verifying Gemini connectivity" },
            null,
            err
          );
          // Wait a moment before fallback test
          await new Promise(r => setTimeout(r, 500));
        }
      }
    })();
  });
}

startServer();
