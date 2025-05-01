const { format } = require('date-fns');
const { vi } = require('date-fns/locale');

/**
 * Format currency in Vietnamese format
 * @param {number} amount - Amount to format
 * @returns {string} - Formatted currency string
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN').format(amount);
};

/**
 * Format date in Vietnamese format
 * @param {Date|string|number} date - Date to format
 * @param {string} formatStr - Format string
 * @returns {string} - Formatted date string
 */
const formatDate = (date, formatStr = 'dd/MM/yyyy') => {
  return format(new Date(date), formatStr, { locale: vi });
};

/**
 * Format date and time in Vietnamese format
 * @param {Date|string|number} date - Date to format
 * @returns {string} - Formatted date and time string
 */
const formatDateTime = (date) => {
  return format(new Date(date), 'HH:mm - dd/MM/yyyy', { locale: vi });
};

module.exports = {
  formatCurrency,
  formatDate,
  formatDateTime
}; 