// Remote logging utility for debugging embedded apps
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

function sendLog(level: string, args: unknown[]) {
  // Serialize args safely
  const serializedArgs = args.map((arg) => {
    try {
      if (arg instanceof Error) {
        return { error: arg.message, stack: arg.stack }
      }
      return JSON.parse(JSON.stringify(arg))
    } catch {
      return String(arg)
    }
  })

  fetch('/api/debug/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, args: serializedArgs }),
  }).catch(() => {
    // Silently fail if logging fails
  })
}

export function enableRemoteLogging() {
  console.log = (...args: unknown[]) => {
    originalConsole.log(...args)
    sendLog('log', args)
  }

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args)
    sendLog('warn', args)
  }

  console.error = (...args: unknown[]) => {
    originalConsole.error(...args)
    sendLog('error', args)
  }

  // Also catch unhandled errors
  window.addEventListener('error', (event) => {
    sendLog('error', [`Uncaught error: ${event.message}`, event.filename, event.lineno])
  })

  window.addEventListener('unhandledrejection', (event) => {
    sendLog('error', ['Unhandled promise rejection:', event.reason])
  })

  console.log('[RemoteLog] Remote logging enabled')
}
