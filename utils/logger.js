
const logger = {

    info: (message, data) => {
      const timestamp = new Date().toISOString()
      console.log(`[${timestamp}] [INFO] ${message}`)
      if (data !== undefined) {
        console.log(data)
      }
    },
  

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
  
 
    warn: (message, data) => {
      const timestamp = new Date().toISOString()
      console.warn(`[${timestamp}] [WARN] ${message}`)
      if (data !== undefined) {
        console.warn(data)
      }
    },

    debug: (message, data) => {

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
  