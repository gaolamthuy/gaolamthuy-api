/**
 * Font Management Module
 * 
 * This module provides an interface for registering fonts for use with node-canvas
 * in the Gao Lam Thuy Internal Service.
 * 
 * Font Directory Structure:
 * - src/assets/fonts/
 *   - nunito/
 *     - Nunito-Regular.ttf
 *     - Nunito-Bold.ttf
 *     - Nunito-ExtraBold.ttf
 *     - etc.
 *   - roboto/ (reserved for future use)
 * 
 * Usage:
 * const { registerFonts } = require('../assets/fonts');
 * registerFonts(); // Registers all fonts
 */

const path = require('path');
const { registerFont } = require('canvas');
const fs = require('fs');

/**
 * Register all available fonts for use with node-canvas
 */
function registerFonts() {
  console.log('📝 Registering fonts for canvas...');
  
  // Register Nunito fonts
  registerNunitoFonts();
  
  console.log('📝 Font registration complete');
}

/**
 * Register all Nunito font variants
 */
function registerNunitoFonts() {
  const nunitoDir = path.join(__dirname, 'nunito');
  
  const weightMap = {
    'Thin': 100,
    'ExtraLight': 200,
    'Light': 300,
    'Regular': 400,
    'Medium': 500,
    'SemiBold': 600,
    'Bold': 700,
    'ExtraBold': 800,
    'Black': 900
  };
  
  try {
    // Get all font files in the nunito directory
    const fontFiles = fs.readdirSync(nunitoDir).filter(file => file.endsWith('.ttf'));
    
    if (fontFiles.length === 0) {
      console.warn('⚠️ No font files found in', nunitoDir);
      return;
    }
    
    // Register each font file with the appropriate weight and style
    fontFiles.forEach(fontFile => {
      try {
        const fontPath = path.join(nunitoDir, fontFile);
        
        // Parse the font name to determine weight and style
        const isItalic = fontFile.includes('Italic');
        let weight = 'normal';
        let style = isItalic ? 'italic' : 'normal';
        
        // Extract the weight name from the file name
        Object.keys(weightMap).forEach(weightName => {
          if (fontFile.includes(weightName)) {
            weight = isItalic ? 'normal' : weightMap[weightName].toString();
            
            // For ExtraBold, register it both as ExtraBold and the regular weight
            if (weightName === 'ExtraBold') {
              registerFont(fontPath, {
                family: 'NunitoExtraBold',
                weight: 'normal',
                style: 'normal'
              });
              console.log(`✅ Registered ${fontFile} as NunitoExtraBold`);
            }
          }
        });
        
        // Default weight for Regular
        if (fontFile === 'Nunito-Regular.ttf') {
          weight = 'normal';
        }
        
        registerFont(fontPath, {
          family: 'Nunito',
          weight: weight,
          style: style
        });
        
        // console.log(`✅ Registered ${fontFile} with weight: ${weight}, style: ${style}`);
      } catch (error) {
        console.error(`❌ Error registering font ${fontFile}:`, error.message);
      }
    });
  } catch (error) {
    console.error('❌ Error reading nunito directory:', error.message);
  }
}

module.exports = {
  registerFonts
}; 