/**
 * Client-side Debug Utility
 * Enable debug mode by opening console and typing: window.DEBUG_MODE = true;
 * Or set URL parameter: ?debug=true
 */

// Check if debug parameter is in URL
const urlParams = new URLSearchParams(window.location.search);
const DEBUG_MODE = (window.DEBUG_MODE !== undefined) ? window.DEBUG_MODE : (urlParams.get('debug') === 'true');

const log = (...args) => {
  if (DEBUG_MODE) console.log(...args);
};

const error = (...args) => {
  if (DEBUG_MODE) console.error(...args);
};

const warn = (...args) => {
  if (DEBUG_MODE) console.warn(...args);
};

// Make DEBUG_MODE available globally so users can toggle it
window.DEBUG_MODE = DEBUG_MODE;
window.toggleDebug = () => {
  window.DEBUG_MODE = !window.DEBUG_MODE;
  console.log(`Debug mode is now ${window.DEBUG_MODE ? 'enabled' : 'disabled'}`);
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { log, error, warn, DEBUG_MODE };
}
