/**
 * Helper utility functions for e-commerce operations
 * Contains functions for generating unique identifiers for orders and transactions
 */

const crypto = require('crypto');

/**
 * Generates a unique order number with configurable prefix
 * Format: PREFIX-TIMESTAMP-RANDOMSTRING
 * 
 * @param {Object} options Configuration options
 * @param {string} [options.prefix='ORD'] Prefix for the order number
 * @param {number} [options.randomLength=4] Length of the random string
 * @param {boolean} [options.includeDate=true] Whether to include date in the order number
 * @returns {string} Unique order number
 */
const generateOrderNumber = (options = {}) => {
  try {
    const {
      prefix = 'ORD',
      randomLength = 4,
      includeDate = true
    } = options;

    // Get current timestamp
    const timestamp = Date.now();
    const dateStr = includeDate ? 
      new Date().toISOString().slice(2, 10).replace(/-/g, '') : 
      '';
    
    // Generate random string
    const randomString = crypto
      .randomBytes(randomLength)
      .toString('hex')
      .toUpperCase()
      .substring(0, randomLength);
    
    // Combine parts to create order number
    const orderNumber = `${prefix}-${dateStr}${dateStr ? '-' : ''}${timestamp.toString().slice(-6)}-${randomString}`;
    
    return orderNumber;
  } catch (error) {
    console.error('Error generating order number:', error);
    // Fallback to a simple format if there's an error
    return `ORD-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  }
};

/**
 * Generates a unique transaction ID
 * Format: TXN-TIMESTAMP-RANDOMSTRING
 * 
 * @param {Object} options Configuration options
 * @param {string} [options.prefix='TXN'] Prefix for the transaction ID
 * @param {number} [options.randomLength=6] Length of the random string
 * @param {boolean} [options.includeDate=false] Whether to include date in the transaction ID
 * @returns {string} Unique transaction ID
 */
const generateTransactionId = (options = {}) => {
  try {
    const {
      prefix = 'TXN',
      randomLength = 6,
      includeDate = false
    } = options;

    // Get current timestamp
    const timestamp = Date.now();
    const dateStr = includeDate ? 
      new Date().toISOString().slice(2, 10).replace(/-/g, '') : 
      '';
    
    // Generate random string with higher entropy for transactions
    const randomString = crypto
      .randomBytes(Math.ceil(randomLength * 1.5))
      .toString('hex')
      .toUpperCase()
      .substring(0, randomLength);
    
    // Combine parts to create transaction ID
    const transactionId = `${prefix}-${dateStr}${dateStr ? '-' : ''}${timestamp.toString().slice(-8)}-${randomString}`;
    
    return transactionId;
  } catch (error) {
    console.error('Error generating transaction ID:', error);
    // Fallback to a simple format if there's an error
    return `TXN-${Date.now()}-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
  }
};

/**
 * Validates if a string is a valid order number
 * 
 * @param {string} orderNumber The order number to validate
 * @param {string} [prefix='ORD'] Expected prefix
 * @returns {boolean} Whether the order number is valid
 */
const isValidOrderNumber = (orderNumber, prefix = 'ORD') => {
  if (!orderNumber || typeof orderNumber !== 'string') return false;
  
  // Basic validation - check prefix and format
  const regex = new RegExp(`^${prefix}-\\d{0,8}-?\\d{1,6}-[A-Z0-9]{1,8}$`);
  return regex.test(orderNumber);
};

/**
 * Validates if a string is a valid transaction ID
 * 
 * @param {string} transactionId The transaction ID to validate
 * @param {string} [prefix='TXN'] Expected prefix
 * @returns {boolean} Whether the transaction ID is valid
 */
const isValidTransactionId = (transactionId, prefix = 'TXN') => {
  if (!transactionId || typeof transactionId !== 'string') return false;
  
  // Basic validation - check prefix and format
  const regex = new RegExp(`^${prefix}-\\d{0,8}-?\\d{1,8}-[A-Z0-9]{1,8}$`);
  return regex.test(transactionId);
};

/**
 * Generates a reference code for various purposes (coupons, referrals, etc.)
 * 
 * @param {Object} options Configuration options
 * @param {string} [options.prefix='REF'] Prefix for the reference code
 * @param {number} [options.length=8] Length of the reference code (excluding prefix)
 * @param {boolean} [options.alphanumeric=true] Whether to include both letters and numbers
 * @returns {string} Unique reference code
 */
const generateReferenceCode = (options = {}) => {
  const {
    prefix = 'REF',
    length = 8,
    alphanumeric = true
  } = options;
  
  let chars = '0123456789';
  if (alphanumeric) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  
  return `${prefix}${prefix ? '-' : ''}${result}`;
};

module.exports = {
  generateOrderNumber,
  generateTransactionId,
  isValidOrderNumber,
  isValidTransactionId,
  generateReferenceCode
};