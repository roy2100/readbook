/**
 * utils.js
 * Pure utility functions shared across modules.
 */

// ── Resolve a URL path by collapsing . and .. segments ──
// Returns the normalized path string.
// Edge: excessive ../ beyond root silently drops (stack underflow yields '')
export function normalizePath(path) {
  const parts = path.split('/');
  const stack = [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else if (p !== '.') stack.push(p);
  }
  return stack.join('/');
}
