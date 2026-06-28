/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface User {
  id: string;
  name: string;
  isGuest: boolean;
}

export interface Commitment {
  id: string;
  userId: string;
  title: string;
  description: string;
  deadline: string; // ISO string
  availableTime: string; // Free text, e.g. "weekdays 8pm-11pm"
  priority: Priority;
  progress: number; // 0-100
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string; // ISO string
  summary?: string;
  milestones?: Milestone[];
  priorityLogic?: string;
}

export interface Task {
  id: string;
  commitmentId: string;
  title: string;
  description: string;
  dueDate: string; // ISO string
  completed: boolean;
  priority: Priority;
  impactLevel: 'low' | 'medium' | 'high';
  estimatedMinutes: number;
}

export interface Milestone {
  title: string;
  description: string;
}

export interface AIPlan {
  summary: string;
  milestones: Milestone[];
  tasks: {
    title: string;
    description: string;
    priority: Priority;
    impactLevel: 'low' | 'medium' | 'high';
    estimatedMinutes: number;
  }[];
  priorityLogic: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  sender: 'user' | 'assistant';
  text: string;
  createdAt: string; // ISO string
}

