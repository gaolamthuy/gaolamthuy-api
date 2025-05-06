/**
 * Font Migration Script
 * 
 * This script migrates fonts from the root fonts directory to the src/assets/fonts directory.
 * It also updates any references to the old font structure.
 */

const fs = require('fs');
const path = require('path');

console.log('🔄 Starting font migration script...');

// Source and destination directories
const sourceDir = path.join(__dirname, '../../fonts');
const destDir = path.join(__dirname, '../assets/fonts');

// Create destination directories if they don't exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const fontFamilies = ['nunito', 'roboto'];
fontFamilies.forEach(family => {
  const familyDestDir = path.join(destDir, family);
  if (!fs.existsSync(familyDestDir)) {
    fs.mkdirSync(familyDestDir, { recursive: true });
  }
});

// Copy fonts from source to destination
let copyCount = 0;
try {
  console.log(`🔍 Looking for font files in ${sourceDir}...`);
  
  fontFamilies.forEach(family => {
    const sourceFamilyDir = path.join(sourceDir, family);
    const destFamilyDir = path.join(destDir, family);
    
    if (fs.existsSync(sourceFamilyDir)) {
      const files = fs.readdirSync(sourceFamilyDir);
      console.log(`📦 Found ${files.length} files in ${sourceFamilyDir}`);
      
      files.forEach(file => {
        if (file.endsWith('.ttf') || file.endsWith('.otf')) {
          const sourceFile = path.join(sourceFamilyDir, file);
          const destFile = path.join(destFamilyDir, file);
          
          // Skip if file already exists in destination
          if (fs.existsSync(destFile)) {
            console.log(`⏩ Skipping ${file} (already exists in destination)`);
            return;
          }
          
          fs.copyFileSync(sourceFile, destFile);
          console.log(`✅ Copied ${sourceFile} to ${destFile}`);
          copyCount++;
        }
      });
    } else {
      console.log(`⚠️ Source directory ${sourceFamilyDir} does not exist, skipping`);
    }
  });
  
  console.log(`✅ Migration completed. Copied ${copyCount} font files.`);
} catch (error) {
  console.error('❌ Error during migration:', error);
}

// Create an index.js file for font registration in the destination directory
try {
  const indexJsPath = path.join(destDir, 'index.js');
  if (!fs.existsSync(indexJsPath)) {
    console.log('📝 Creating index.js for font registration...');
    
    // Create a simple index.js file
    const indexContent = `/**
 * Font Management Module
 * 
 * This module provides an interface for registering fonts for use with node-canvas
 * in the Gao Lam Thuy Internal Service.
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
              console.log(\`✅ Registered \${fontFile} as NunitoExtraBold\`);
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
        
        console.log(\`✅ Registered \${fontFile} with weight: \${weight}, style: \${style}\`);
      } catch (error) {
        console.error(\`❌ Error registering font \${fontFile}:\`, error.message);
      }
    });
  } catch (error) {
    console.error('❌ Error reading nunito directory:', error.message);
  }
}

module.exports = {
  registerFonts
};`;
    
    fs.writeFileSync(indexJsPath, indexContent);
    console.log(`✅ Created ${indexJsPath}`);
  } else {
    console.log(`⏩ Skipping index.js creation (file already exists)`);
  }
} catch (error) {
  console.error('❌ Error creating index.js:', error);
}

console.log('🎉 Font migration script completed successfully'); 