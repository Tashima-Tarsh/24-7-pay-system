import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Premium React app is outside the existing npm payment-engine workspaces',()=>{
 const root=JSON.parse(read('package.json'));assert.deepEqual(root.workspaces,['packages/*','apps/*']);
 const studio=JSON.parse(read('premium-studio/package.json'));assert.equal(studio.private,true);
 assert.ok(studio.dependencies.react);assert.ok(studio.dependencies['@visx/shape']);
 assert.ok(studio.dependencies.motion);assert.ok(studio.dependencies['@phosphor-icons/react']);
 assert.ok(studio.dependencies['@radix-ui/react-tabs']);
 assert.match(read('premium-studio/vite.config.ts'),/outDir:'\.\.\/public\/premium-studio'/);
});
test('Premium preview reads existing authenticated API and does not mutate financial state',()=>{
 const api=read('premium-studio/src/api.ts'),app=read('premium-studio/src/App.tsx');
 assert.match(api,/247pay-new-workspace-session/);
 assert.match(api,/Authorization:'Bearer '/);
 assert.match(api,/credentials:'omit'/);
 assert.match(api,/async function get<T>/);
 assert.doesNotMatch(api,/method:['"]POST|method:['"]PUT|method:['"]PATCH|method:['"]DELETE/);
 for(const path of ['/me','/dashboard/kpis','/transactions?limit=50','/webhook-deliveries'])assert.ok(app.includes(path),'Missing read endpoint: '+path);
 assert.doesNotMatch(app,/['"]\/payments['"],['"]POST/);
});
test('Migration leaves the production payment server and active portal untouched',()=>{
 const api=read('premium-studio/src/api.ts');
 assert.match(api,/new AuthRequired/);
 const doc=read('premium-studio/index.html');assert.match(doc,/noindex,nofollow/);
 assert.match(read('premium-studio/src/styles.css'),/prefers-reduced-motion/);
 assert.match(read('premium-studio/src/App.tsx'),/useReducedMotion/);
 assert.match(read('premium-studio/src/App.tsx'),/Pie data=\{parts\}/);
 assert.match(read('premium-studio/src/App.tsx'),/Tabs\.Root/);
});
