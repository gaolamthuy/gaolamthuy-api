const path = require('path');
const fs = require('fs').promises;

async function testTemplateLoading() {
  try {
    // Test invoice template
    const invoicePath = path.join(__dirname, '../../src/views/templates/invoice.html');
    console.log('Invoice template path:', invoicePath);
    console.log('Path exists?', await fs.access(invoicePath).then(() => true).catch(() => false));
    
    try {
      const invoiceContent = await fs.readFile(invoicePath, 'utf8');
      console.log('Invoice template loaded successfully!');
      console.log('Content length:', invoiceContent.length);
      console.log('First 100 chars:', invoiceContent.substring(0, 100));
    } catch (err) {
      console.error('Error loading invoice template:', err);
    }
    
    // Test label template
    const labelPath = path.join(__dirname, '../../src/views/templates/label.html');
    console.log('\nLabel template path:', labelPath);
    console.log('Path exists?', await fs.access(labelPath).then(() => true).catch(() => false));
    
    try {
      const labelContent = await fs.readFile(labelPath, 'utf8');
      console.log('Label template loaded successfully!');
      console.log('Content length:', labelContent.length);
      console.log('First 100 chars:', labelContent.substring(0, 100));
    } catch (err) {
      console.error('Error loading label template:', err);
    }
  } catch (err) {
    console.error('General error:', err);
  }
}

testTemplateLoading(); 