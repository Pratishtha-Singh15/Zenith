/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Estimates available minutes per day from a free-text string.
 * Supports patterns like "3 hours", "120 mins", "4h".
 * Defaults to 120 minutes if unparseable.
 */
export function parseAvailableMinutesPerDay(availableTimeStr: string): number {
  if (!availableTimeStr) return 120;
  
  const normalized = availableTimeStr.toLowerCase();
  
  // Look for patterns like "3 hours", "3.5 hrs", "3h"
  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h)/);
  if (hourMatch) {
    const hours = parseFloat(hourMatch[1]);
    if (!isNaN(hours) && hours > 0) {
      return Math.round(hours * 60);
    }
  }

  // Look for patterns like "90 mins", "90 minutes", "90m"
  const minMatch = normalized.match(/(\d+)\s*(?:min|m)/);
  if (minMatch) {
    const mins = parseFloat(minMatch[1]);
    if (!isNaN(mins) && mins > 0) {
      return mins;
    }
  }

  // Default fallback if unparseable
  return 120;
}

/**
 * Calculates a commitment confidence score based on the specified formula:
 * confidence = 100 - (max(0, estimatedWorkDays - remainingDays) * 10), clamped between 20 and 95.
 * 
 * Where:
 * - estimatedWorkDays = (sum of estimatedMinutes across all tasks) / (estimated available minutes per day)
 * - remainingDays = days between now and the deadline
 */
export function calculateConfidenceScore(
  totalTaskMinutes: number,
  availableTimeStr: string,
  deadlineStr: string
): {
  confidence: number;
  estimatedWorkDays: number;
  remainingDays: number;
  minsPerDay: number;
} {
  const minsPerDay = parseAvailableMinutesPerDay(availableTimeStr);
  
  // Calculate total work days needed
  const estimatedWorkDays = totalTaskMinutes / minsPerDay;
  
  // Calculate remaining days until deadline
  const deadlineDate = new Date(deadlineStr);
  const now = new Date();
  const diffTime = deadlineDate.getTime() - now.getTime();
  const remainingDays = Math.max(0, diffTime / (1000 * 60 * 60 * 24));
  
  // Formula calculation
  const calculatedScore = 100 - (Math.max(0, estimatedWorkDays - remainingDays) * 10);
  
  // Clamped between 20 and 95
  const confidence = Math.max(20, Math.min(95, Math.round(calculatedScore)));
  
  return {
    confidence,
    estimatedWorkDays: Math.round(estimatedWorkDays * 10) / 10,
    remainingDays: Math.round(remainingDays * 10) / 10,
    minsPerDay
  };
}
