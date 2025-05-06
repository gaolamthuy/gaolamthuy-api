/**
 * Date utility functions for the application
 */

/**
 * Get today's date components
 * @returns {{year: string, month: string, day: string}} - Date components
 */
const getTodayComponents = () => {
  const today = new Date();
  return {
    year: today.getFullYear().toString(),
    month: (today.getMonth() + 1).toString().padStart(2, '0'),
    day: today.getDate().toString().padStart(2, '0')
  };
};

/**
 * Format a date as YYYY-MM-DD
 * @param {Object} params - Date parameters
 * @param {string} params.year - Year (4 digits)
 * @param {string} params.month - Month (1-12)
 * @param {string} params.day - Day (1-31)
 * @returns {string} - Formatted date
 */
const formatYMD = ({ year, month, day }) => {
  const paddedMonth = month.padStart(2, '0');
  const paddedDay = day.padStart(2, '0');
  return `${year}-${paddedMonth}-${paddedDay}`;
};

/**
 * Validate a year value
 * @param {string} year - Year to validate
 * @returns {boolean} - True if valid
 */
const isValidYear = (year) => {
  const yearNum = parseInt(year, 10);
  const currentYear = new Date().getFullYear();
  return !isNaN(yearNum) && year.length === 4 && yearNum >= 2020 && yearNum <= currentYear;
};

/**
 * Validate a month value
 * @param {string} month - Month to validate
 * @returns {boolean} - True if valid
 */
const isValidMonth = (month) => {
  const monthNum = parseInt(month, 10);
  return !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12;
};

/**
 * Validate a day value
 * @param {string} day - Day to validate
 * @param {string} month - Month
 * @param {string} year - Year
 * @returns {boolean} - True if valid
 */
const isValidDay = (day, month, year) => {
  const dayNum = parseInt(day, 10);
  if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
    return false;
  }
  
  // Check if the day is valid for the given month and year
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  return dayNum <= lastDayOfMonth;
};

/**
 * Validate a date string format (MM/DD/YYYY)
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} - True if valid
 */
const validateDateFormat = (dateStr) => {
  if (!dateStr) return false;
  
  // Check format using regex
  const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
  if (!dateRegex.test(dateStr)) return false;
  
  // Check if it's a valid date
  const [month, day, year] = dateStr.split('/').map(Number);
  const dateObj = new Date(year, month - 1, day);
  
  return (
    dateObj.getMonth() === month - 1 && 
    dateObj.getDate() === day && 
    dateObj.getFullYear() === year
  );
};

module.exports = {
  getTodayComponents,
  formatYMD,
  isValidYear,
  isValidMonth,
  isValidDay,
  validateDateFormat
}; 