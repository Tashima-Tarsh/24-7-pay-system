import fs from 'fs';
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
  }
} else {
  console.log('No script tag found');
}