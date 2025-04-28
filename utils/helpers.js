const { v4: uuidv4 } = require("uuid");

const generateOrderNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);

  return `ORD-${year}${month}${day}-${random}`;
};

const generateTransactionId = () => {
  return `TXN-${uuidv4()}`;
};

const generateItemNumber = (orderId, itemIndex) => {
  return `ITEM-${orderId.toString().substring(orderId.length - 6)}-${String(
    itemIndex + 1
  ).padStart(2, "0")}`;
};

const calculateRefundAmount = (orderItem, order) => {
  if (!orderItem || !order) return 0;

  if (!order.discount || order.discount <= 0) {
    return orderItem.total_amount;
  }

  const orderTotal = order.total + order.discount;
  const itemProportion = orderItem.total_amount / orderTotal;

  const itemDiscountAmount = order.discount * itemProportion;

  return orderItem.total_amount - itemDiscountAmount;
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date) => {
  if (!date) return "N/A";

  return new Date(date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

module.exports = {
  generateOrderNumber,
  generateTransactionId,
  generateItemNumber,
  calculateRefundAmount,
  formatCurrency,
  formatDate,
};
