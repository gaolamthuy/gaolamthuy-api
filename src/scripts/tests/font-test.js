/**
 * Font Registration Test
 * This script tests if fonts are being registered correctly
 */
const path = require('path');
const fs = require('fs');
const { createCanvas } = require('canvas');
const { registerFonts } = require('../../assets/fonts');

console.log('🔍 Starting font registration test');

// Register fonts
registerFonts();

// Create a canvas
const canvas = createCanvas(800, 400);
const ctx = canvas.getContext('2d');

// Fill background
ctx.fillStyle = '#f0f0f0';
ctx.fillRect(0, 0, 800, 400);

// Draw text with different font weights
const texts = [
  { text: 'Nunito Regular', font: '30px "Nunito"', y: 50 },
  { text: 'Nunito Bold', font: 'bold 30px "Nunito"', y: 100 },
  { text: 'Nunito ExtraBold', font: '30px "NunitoExtraBold"', y: 150 },
  { text: 'Nunito Italic', font: 'italic 30px "Nunito"', y: 200 },
  { text: 'Nunito Bold Italic', font: 'italic bold 30px "Nunito"', y: 250 },
  { text: 'Nunito with size', font: '40px "Nunito"', y: 300 },
  { text: 'Nunito ExtraBold with size', font: '40px "NunitoExtraBold"', y: 350 }
];

// Draw sample text
ctx.fillStyle = '#333';
texts.forEach(item => {
  ctx.font = item.font;
  console.log(`Drawing text with font: ${item.font}`);
  ctx.fillText(item.text, 50, item.y);
});

// Save to a file
const outputPath = path.join(__dirname, '../../assets/font-test-output.png');
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync(outputPath, buffer);

console.log(`✅ Font test completed. Output saved to: ${outputPath}`);
console.log(`Font registration test completed successfully.`); 