import fs from 'node:fs';
const path='semgrep-results.json';
if(!fs.existsSync(path)){
 console.error('[Semgrep] No scan output: scanner did not complete successfully.');
 process.exit(1);
}
let report;
try{report=JSON.parse(fs.readFileSync(path,'utf8'));}
catch{console.error('[Semgrep] Malformed JSON scan output.');process.exit(1);}
if(!Array.isArray(report.results)||!Array.isArray(report.errors)){
 console.error('[Semgrep] Incomplete output: missing results or errors arrays.');
 process.exit(1);
}
const counts={};
for(const item of report.results){
 const level=String(item.extra?.severity||'UNKNOWN').toUpperCase();
 counts[level]=(counts[level]||0)+1;
}
console.log('[Semgrep] Completed scan. Findings by severity:',JSON.stringify(counts));
if(report.errors.length){
 console.error('[Semgrep] Scanner errors:',JSON.stringify(report.errors.slice(0,5)));
 process.exit(1);
}
// Findings are uploaded for triage. The scan itself must run successfully;
// a green build does not imply zero untriaged SAST findings.
