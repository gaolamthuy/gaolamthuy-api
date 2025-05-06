/**
 * Image Processing Utilities
 * 
 * This module contains utility functions for image processing operations
 * used throughout the application.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');

/**
 * Creates temporary directories for image processing
 * @returns {string} Path to temp directory
 */
function ensureTempDirectories() {
  const tempDir = path.join(__dirname, '../../uploads/temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Clean up temporary files
 * @param {Array<string>} filePaths - Array of file paths to delete
 */
function cleanupTempFiles(filePaths) {
  filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Cleaned up temporary file: ${filePath}`);
    }
  });
}

/**
 * Format price for display
 * @param {number} price - The price to format
 * @returns {string} Formatted price with commas
 */
function formatPrice(price) {
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Get day of week in Vietnamese format
 * @param {Date} date - The date to format
 * @returns {string} Day of week in Vietnamese format (T2-T7, CN)
 */
function getDayOfWeekVN(date) {
  const day = date.getDay();
  // In Vietnam, Sunday is Chủ Nhật, other days are Thứ 2-7
  return day === 0 ? 'CN' : `T${day + 1}`;
}

/**
 * Format date in Vietnamese locale format
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string (e.g., "T3 - 06/05/2025, 11:45")
 */
function formatDateTimeVN(date) {
  const dayOfWeek = getDayOfWeekVN(date);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${dayOfWeek} - ${day}/${month}/${year}, ${hours}:${minutes}`;
}

/**
 * Draw a rounded rectangle on a canvas context
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Rectangle width
 * @param {number} height - Rectangle height
 * @param {number} radius - Corner radius
 * @param {string} fillStyle - Fill color
 */
function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw multi-line text on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<string>} lines - Array of text lines
 * @param {number} x - Starting X position
 * @param {number} y - Starting Y position
 * @param {number} lineHeight - Height of each line
 * @param {number} lineGap - Gap between lines
 * @param {string} color - Text color
 */
function drawMultilineText(ctx, lines, x, y, lineHeight, lineGap, color) {
  ctx.fillStyle = color;
  lines.forEach((line, i) => {
    const lineY = y + i * (lineHeight + lineGap);
    ctx.fillText(line, x, lineY);
  });
}

module.exports = {
  ensureTempDirectories,
  cleanupTempFiles,
  formatPrice,
  getDayOfWeekVN,
  formatDateTimeVN,
  drawRoundedRect,
  drawMultilineText
}; 