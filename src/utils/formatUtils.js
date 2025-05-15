/**
 * Format a number as Vietnamese currency
 * @param {number} amount - The amount to format
 * @returns {string} Formatted amount
 */
exports.formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}; 