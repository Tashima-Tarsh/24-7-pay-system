(async () => {
  const res = await fetch('https://dynamo-pay-d545.onrender.com/checkout/pay_d4f6dd78-5028-4644-8874-f8bf104a6a4c');
  const body = await res.text();
  
  const scriptMatches = body.match(/<script[^>]*src="([^"]+)"/g);
  console.log('Script tags found:', scriptMatches?.length || 0);
  scriptMatches?.forEach(m => console.log('  ', m));
  
  const linkMatches = body.match(/<link[^>]*href="([^"]+)"/g);
  console.log('Link tags found:', linkMatches?.length || 0);
  linkMatches?.forEach(m => console.log('  ', m));
  
  const jsMatch = body.match(/<script[^>]*src="([^"]+\.js[^"]*)"/);
  if (jsMatch) {
    const jsUrl = new URL(jsMatch[1], 'https://dynamo-pay-d545.onrender.com').href;
    console.log('\nFetching JS bundle:', jsUrl);
    try {
      const jsRes = await fetch(jsUrl);
      console.log('JS Status:', jsRes.status);
      const jsText = await jsRes.text();
      console.log('JS Length:', jsText.length);
      console.log('JS starts with:', jsText.substring(0, 100));
    } catch(e) {
      console.log('JS Fetch error:', e.message);
    }
  }
})();
