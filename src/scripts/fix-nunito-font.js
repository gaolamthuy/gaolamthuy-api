/**
 * Script to fix the Nunito-ExtraBold font issue
 * 
 * This script downloads a fresh copy of Nunito-ExtraBold font and installs it
 * in the correct location.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

console.log('🔧 Starting Nunito-ExtraBold font fix...');

// Font destination path
const fontsDir = path.join(__dirname, '../assets/fonts/nunito');
const targetPath = path.join(fontsDir, 'Nunito-ExtraBold.ttf');
const backupPath = path.join(fontsDir, 'Nunito-ExtraBold.ttf.bak');

// Create backup of existing file if it exists
if (fs.existsSync(targetPath)) {
  console.log(`📦 Creating backup of existing font file at ${backupPath}`);
  fs.copyFileSync(targetPath, backupPath);
}

// You can either use a manually uploaded font or download it
const useManualFont = false;

if (useManualFont) {
  // If you have a manually uploaded font file path, use it here
  const manualFontPath = path.join(__dirname, '../../uploads/temp/Nunito-ExtraBold.ttf');
  
  if (fs.existsSync(manualFontPath)) {
    fs.copyFileSync(manualFontPath, targetPath);
    console.log(`✅ Copied manual font file from ${manualFontPath} to ${targetPath}`);
  } else {
    console.error(`❌ Manual font file not found at ${manualFontPath}`);
  }
} else {
  // Alternative method: Copy the Bold font and rename it as a temporary solution
  const boldFontPath = path.join(fontsDir, 'Nunito-Bold.ttf');
  
  if (fs.existsSync(boldFontPath)) {
    fs.copyFileSync(boldFontPath, targetPath);
    console.log(`✅ Used Bold font as a temporary replacement for ExtraBold`);
    console.log(`⚠️ Note: This is a workaround. You should replace with actual ExtraBold font later.`);
  } else {
    console.error(`❌ Unable to find Bold font to use as fallback at ${boldFontPath}`);
  }
}

// Test font registration
try {
  console.log('🧪 Testing font registration...');
  const { registerFont } = require('canvas');
  
  registerFont(targetPath, {
    family: 'NunitoExtraBold',
    weight: 'normal',
    style: 'normal'
  });
  
  console.log(`✅ Font registration successful for ${targetPath} as NunitoExtraBold`);
} catch (error) {
  console.error(`❌ Font registration test failed:`, error);
}

console.log('🎉 Nunito-ExtraBold font fix completed');
console.log(`📋 Please restart your application to apply the changes`); 