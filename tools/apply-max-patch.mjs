import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const p = (...x) => path.join(root, ...x);

function exists(file){ return fs.existsSync(file); }
function read(file){ return fs.readFileSync(file, 'utf8'); }
function write(file, data){ fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, data); }
function backup(file){ if(exists(file)) fs.copyFileSync(file, `${file}.bak-${stamp}`); }
function copyFromPatch(rel){
  const source = path.join(path.dirname(new URL(import.meta.url).pathname), '..', rel);
  const target = p(rel);
  if(!exists(source)) throw new Error(`Patch file not found: ${source}`);
  backup(target);
  write(target, read(source));
  console.log('copied', rel);
}

function injectAssets(){
  const file = p('public', 'index.html');
  if(!exists(file)){ console.warn('skip index.html: not found'); return; }
  backup(file);
  let html = read(file);
  const css = '<link rel="stylesheet" href="/secure-ui.css?v=20260707">';
  const js = '<script defer src="/secure-ui.js?v=20260707"></script>';
  if(!html.includes('/secure-ui.css')){
    html = html.includes('</head>') ? html.replace('</head>', `  ${css}\n</head>`) : `${css}\n${html}`;
  }
  if(!html.includes('/secure-ui.js')){
    html = html.includes('</body>') ? html.replace('</body>', `  ${js}\n</body>`) : `${html}\n${js}\n`;
  }
  write(file, html);
  console.log('patched public/index.html assets');
}

function patchPackage(){
  const file = p('package.json');
  if(!exists(file)){ console.warn('skip package.json: not found'); return; }
  backup(file);
  let json;
  try{ json = JSON.parse(read(file)); }catch(e){ console.warn('skip package.json: invalid json'); return; }
  json.scripts = json.scripts || {};
  json.scripts['secure-patch'] = 'node tools/apply-max-patch.mjs';
  json.scripts['check:security'] = 'node tools/apply-max-patch.mjs --check';
  write(file, JSON.stringify(json, null, 2) + '\n');
  console.log('patched package.json scripts');
}

function patchApi(checkOnly=false){
  const file = p('netlify', 'functions', 'api.mjs');
  if(!exists(file)){ console.warn('skip api.mjs: not found'); return; }
  let src = read(file);
  const before = src;
  const findings = [];

  if(/ALLOW_UNTRUSTED_ACCESS/.test(src)) findings.push('ALLOW_UNTRUSTED_ACCESS exists');
  if(/Access-Control-Allow-Origin'\s*:\s*origin/.test(src)) findings.push('CORS reflects Origin');
  if(/url\.searchParams\.get\('key'\)/.test(src)) findings.push('ADMIN_SECRET can be passed in URL');
  if(/access_key:ACCESS_KEY/.test(src)) findings.push('/api/health leaks internal key names');

  if(checkOnly){
    console.log('api findings:', findings.length ? findings.join('; ') : 'no known weak patterns found');
    return;
  }

  src = src.replace(
    /function allowUntrustedAccess\(env\)\{[\s\S]*?\}\s*function corsHeaders/,
    `function allowUntrustedAccess(env){
  // Safer default: never trust browser-supplied Telegram ID unless you explicitly accept the risk.
  return String(env.SAFE_ALLOW_UNTRUSTED_ACCESS || '').trim() === 'I_UNDERSTAND_THIS_IS_INSECURE';
}
function corsHeaders`
  );

  src = src.replace(
    /function corsHeaders\(request\)\{[\s\S]*?\}\s*function jsonResponse/,
    `function corsHeaders(request){
  const origin = request.headers.get('Origin') || '';
  const envObj = (globalThis.process && globalThis.process.env) ? globalThis.process.env : {};
  const allowed = String(envObj.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  let selfOrigin = '';
  try { selfOrigin = new URL(request.url).origin; } catch(e) {}
  const allow = !origin ? (selfOrigin || '*') : (allowed.includes(origin) || (!allowed.length && origin === selfOrigin) ? origin : (selfOrigin || origin));
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Telegram-Init-Data,X-Admin-Secret',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}
function jsonResponse`
  );

  src = src.replace(
    /const provided = request\.headers\.get\('X-Admin-Secret'\) \|\| url\.searchParams\.get\('key'\) \|\| '';/,
    `const allowUrlKey = String(env.ALLOW_ADMIN_KEY_IN_URL || '').trim() === '1'; const provided = request.headers.get('X-Admin-Secret') || (allowUrlKey ? url.searchParams.get('key') : '') || '';`
  );

  src = src.replace(
    /if\(path==='\/' \|\| path==='\/api\/health'\)\{ return jsonResponse\(request,\{ok:true, service:'quizbot-backend',[\s\S]*?tests_cache_ttl_seconds:testsCacheTtl\(env\)\}\); \}/,
    `if(path==='/' || path==='/api/health'){ return jsonResponse(request,{ok:true, service:'quizbot-backend', time:new Date().toISOString()}); }`
  );

  src = src.replace(
    /String\(env\.REQUIRE_TELEGRAM_AUTH\|\|''\)==='1'/g,
    `String(env.REQUIRE_TELEGRAM_AUTH ?? '1')==='1'`
  );

  src = src.replace(
    /String\(env\.REQUIRE_REPORT_AUTH\|\|'1'\)==='1'/g,
    `String(env.REQUIRE_REPORT_AUTH ?? '1')==='1'`
  );

  if(src !== before){
    backup(file);
    write(file, src);
    console.log('patched netlify/functions/api.mjs');
  }else{
    console.warn('api.mjs: no changes applied. Maybe structure already changed. See SECURITY_AUDIT.md and patch manually.');
  }
}

const checkOnly = process.argv.includes('--check');
if(!checkOnly){
  copyFromPatch('public/secure-ui.css');
  copyFromPatch('public/secure-ui.js');
  copyFromPatch('netlify.toml');
  injectAssets();
  patchPackage();
}
patchApi(checkOnly);
console.log(checkOnly ? 'check complete' : 'max patch applied');
