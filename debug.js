/**
 * Debug Logging Utility
 * Respects DEBUG_MODE environment variable
 */

const DEBUG = process.env.DEBUG_MODE === 'true';

const log = (...args) => {
  if (DEBUG) console.log(...args);
};

const error = (...args) => {
  if (DEBUG) console.error(...args);
};

const warn = (...args) => {
  if (DEBUG) console.warn(...args);
};

module.exports = { log, error, warn, DEBUG };
