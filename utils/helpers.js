const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique order number
 * Format: ORD-YYYYMMDD-XXXX (where XXXX is a random 4-digit number)
 */
const generateOrderNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  
  return `ORD-${year}${month}${day}-${random}`;
};

/**
 * Generate a unique transaction ID
 * Format: TXN-UUID
 */
const generateTransactionId = () => {
  return `TXN-${uuidv4()}`;
};

/**
 * Generate a unique item number for order items
 * Format: ITEM-ORDERID-XX (where XX is the item number in the order)
 */
const generateItemNumber = (orderId, itemIndex) => {
  return `ITEM-${orderId.toString().substring(orderId.length - 6)}-${String(itemIndex + 1).padStart(2, '0')}`;
};

/**
 * Calculate refund amount for an order item
 * Takes into account any discounts applied proportionally
 */
const calculateRefundAmount = (orderItem, order) => {
  if (!orderItem || !order) return 0;
  
  // If no discount was applied to the order, return the full item amount
  if (!order.discount || order.discount <= 0) {
    return orderItem.total_amount;
  }
  
  // Calculate the proportion of this item to the total order value
  const orderTotal = order.total + order.discount; // Original total before discount
  const itemProportion = orderItem.total_amount / orderTotal;
  
  // Calculate the discount amount that applies to this item
  const itemDiscountAmount = order.discount * itemProportion;
  
  // Return the item amount minus its share of the discount
  return orderItem.total_amount - itemDiscountAmount;
};

/**
 * Format currency for display
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(amount);
};

/**
 * Format date for display
 */
const formatDate = (date) => {
  if (!date) return 'N/A';
  
  return new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

module.exports = {
  generateOrderNumber,
  generateTransactionId,
  generateItemNumber,
  calculateRefundAmount,
  formatCurrency,
  formatDate
};