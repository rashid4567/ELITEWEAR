/**
 * Simple logger utility for the application
 * Provides consistent logging with timestamps and log levels
 */
const logger = {
    /**
     * Log an info message
     * @param {string} message - The message to log
     * @param {any} data - Optional data to include in the log
     */
    info: (message, data) => {
      const timestamp = new Date().toISOString()
      console.log(`[${timestamp}] [INFO] ${message}`)
      if (data !== undefined) {
        console.log(data)
      }
    },
  
    /**
     * Log an error message
     * @param {string} message - The error message to log
     * @param {Error|any} error - The error object or additional data
     */
    error: (message, error) => {
      const timestamp = new Date().toISOString()
      console.error(`[${timestamp}] [ERROR] ${message}`)
      if (error) {
        if (error instanceof Error) {
          console.error(`${error.message}\n${error.stack}`)
        } else {
          console.error(error)
        }
      }
    },
  
    /**
     * Log a warning message
     * @param {string} message - The warning message to log
     * @param {any} data - Optional data to include in the log
     */
    warn: (message, data) => {
      const timestamp = new Date().toISOString()
      console.warn(`[${timestamp}] [WARN] ${message}`)
      if (data !== undefined) {
        console.warn(data)
      }
    },
  
    /**
     * Log a debug message (only in development environment)
     * @param {string} message - The debug message to log
     * @param {any} data - Optional data to include in the log
     */
    debug: (message, data) => {
      // Only log debug messages in development environment
      if (process.env.NODE_ENV !== "production") {
        const timestamp = new Date().toISOString()
        console.log(`[${timestamp}] [DEBUG] ${message}`)
        if (data !== undefined) {
          console.log(data)
        }
      }
    },
  }
  
  module.exports = logger
  