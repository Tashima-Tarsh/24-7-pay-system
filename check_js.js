const fs = require('fs');
const html = fs.readFileSync('D:\\24-7-pay-system\\apps\\checkout-portal\\src\\views\\checkout-premium.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (scriptMatch) {
  try {
    new Function(scriptMatch[1]);
    console.log('JavaScript syntax: VALID');
  } catch(e) {
    console.log('JavaScript SYNTAX ERROR:', e.message);
    const lines = scriptMatch[1].split('\n');
    console.log('Script has', lines.length, 'lines');
    // Find lines with potential issues
    for (let i = 0; i < lines.length; i++) {
      try {
        new Function(lines[i]);
      } catch(e) {
        if (e.message.includes('Unexpected') || e.message.includes('Missing') || e.message.includes('Unexpected token')) {
          console.log('Line ' + (i+1) + ': ' + lines[i].trim());
          console.log('  Error: ' + e.message);
        }
      }
    }
  }
} else {
  console.log('No script tag found');
}