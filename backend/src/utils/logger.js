const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

export const logger = {
  info(msg, ...args) {
    console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.cyan}INFO:${COLORS.reset} ${msg}`, ...args);
  },
  warn(msg, ...args) {
    console.warn(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}WARN:${COLORS.reset} ${msg}`, ...args);
  },
  error(msg, ...args) {
    console.error(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.red}ERROR:${COLORS.reset} ${msg}`, ...args);
  },
};
