/**
 * Built-in scaffold UI — generic descriptor renderer for Torque bundles.
 * Reads bundle manifests for routes/navigation, loads bundle UI scripts,
 * and renders descriptor objects ({ type, props, children }) into vanilla DOM.
 * Zero app-specific code — all views come from bundle ui/ directories.
 */
export function scaffoldHTML(appName, registry) {
  // Collect route table and nav from all bundle manifests
  const uiRoutes = [];
  const uiNav = [];
  const apiRoutes = [];
  let authBundle = null;
  let loginPath = '/login';
  let searchBundle = null;

  for (const name of registry.activeBundles()) {
    const m = registry.bundleManifest(name);

    // API routes (for introspection)
    for (const r of (m.api?.routes || [])) {
      apiRoutes.push({ method: r.method || 'GET', path: r.path, bundle: name, auth: r.auth });
    }

    // UI routes
    for (const r of (m.ui?.routes || [])) {
      uiRoutes.push({ ...r, bundle: name, script: m.ui?.script || 'ui/index.js' });
    }

    // Navigation
    for (const n of (m.ui?.navigation || [])) {
      uiNav.push({ ...n, bundle: name });
    }

    // Detect auth bundle (has validateToken interface)
    if (m.interfaces?.queries?.includes('validateToken') || m.interfaces?.contracts?.validateToken) {
      authBundle = name;
      const loginRoute = (m.ui?.routes || []).find(r => r.path === '/login');
      if (loginRoute) loginPath = loginRoute.path;
    }

    // Detect search bundle
    if (name === 'search-app' || name === 'search') {
      searchBundle = name;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${appName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root,[data-theme="dark"]{--bg-0:#090a0e;--bg-1:#0f1017;--bg-2:#14161f;--sf-1:#1a1d2a;--sf-2:#232738;--bd-1:#1f2233;--bd-2:#2a2f44;--tx-1:#eef0f6;--tx-2:#9ba1bb;--tx-3:#5c6280;--ac:#6C8EFF;--ac-g:#6C8EFF25;--err:#ef4444;--ok:#34d399;--warn:#fbbf24}
[data-theme="light"]{--bg-0:#f5f6fa;--bg-1:#fff;--bg-2:#f0f1f5;--sf-1:#e8e9ee;--sf-2:#dcdee5;--bd-1:#d0d2da;--bd-2:#b8bac5;--tx-1:#1a1c24;--tx-2:#4a4d5c;--tx-3:#7c7f94;--ac:#5570e6;--ac-g:#5570e625;--err:#dc2626;--ok:#16a34a;--warn:#d97706}
body{font-family:'Outfit',system-ui,sans-serif;background:var(--bg-0);color:var(--tx-1);min-height:100vh;font-size:13px;line-height:1.45;transition:background .2s,color .2s}
#app{min-height:100vh;display:flex;flex-direction:column}

/* Nav */
.nav{display:flex;align-items:center;gap:3px;padding:0 20px;height:48px;border-bottom:1px solid var(--bd-1);background:var(--bg-1);flex-shrink:0}
.nav .brand{font-weight:700;color:var(--ac);font-size:15px;cursor:pointer;margin-right:12px;letter-spacing:-.3px}
.nb{display:inline-flex;align-items:center;gap:5px;color:var(--tx-3);text-decoration:none;font-size:12px;background:none;border:none;cursor:pointer;padding:4px 10px;border-radius:6px;font-family:inherit;transition:all .15s}
.nb:hover,.nb.active{color:var(--tx-1);background:var(--sf-1)}
.spacer{flex:1}
.search-wrap{position:relative}
.search-box{display:flex;align-items:center;gap:6px;background:var(--sf-1);border:1px solid var(--bd-1);border-radius:6px;padding:0 10px;height:28px}
.search-box input{background:none;border:none;color:var(--tx-1);font-size:11px;width:150px;outline:none;font-family:inherit}
.search-box svg{color:var(--tx-3);flex-shrink:0}
.dd-menu{position:absolute;top:calc(100% + 4px);background:var(--bg-2);border:1px solid var(--bd-1);border-radius:8px;box-shadow:0 12px 40px #000a;z-index:60;min-width:180px;padding:4px;display:none}
.dd-item{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:11px;cursor:pointer;border-radius:5px;color:var(--tx-2);border:none;background:none;width:100%;font-family:inherit;text-align:left}
.dd-item:hover{background:var(--sf-1);color:var(--tx-1)}
.dd-item.danger{color:var(--err)}
.dd-sep{padding:4px 12px;font-size:9px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--bd-1);margin:2px 0}

/* Avatar */
.av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-weight:600;color:#fff;flex-shrink:0}

/* Main */
.main{flex:1;overflow-y:auto;padding:20px 24px}

/* Descriptor type styles */
.d-stack{display:flex;flex-direction:column}
.d-stack.row{flex-direction:row}
.d-grid{display:grid}
.d-text{margin:0}
.d-text.h4{font-size:17px;font-weight:700;letter-spacing:-.3px}
.d-text.h5{font-size:15px;font-weight:600}
.d-text.h6{font-size:14px;font-weight:600}
.d-text.subtitle1{font-size:13px;font-weight:600}
.d-text.body2{font-size:12px}
.d-text.caption{font-size:11px}
.d-card{background:var(--bg-2);border:1px solid var(--bd-1);border-radius:8px;padding:16px;transition:border-color .15s}
.d-card:hover{border-color:var(--bd-2)}
.d-btn{display:inline-flex;align-items:center;gap:5px;border:none;cursor:pointer;font-family:inherit;border-radius:6px;font-size:11px;transition:all .15s;padding:6px 14px;color:var(--tx-2);background:var(--sf-1)}
.d-btn:hover{color:var(--tx-1);background:var(--sf-2)}
.d-btn.contained{background:var(--ac);color:#fff}
.d-btn.contained:hover{opacity:.85}
.d-btn.outlined{background:none;border:1px solid var(--bd-1);color:var(--tx-2)}
.d-btn.outlined:hover{border-color:var(--ac);color:var(--ac)}
.d-btn.text{background:none;color:var(--tx-3);padding:4px 8px}
.d-btn.text:hover{color:var(--tx-1)}
.d-input{background:var(--sf-1);border:1px solid var(--bd-1);color:var(--tx-1);padding:6px 10px;border-radius:6px;font-size:12px;font-family:inherit;outline:none;transition:border-color .15s}
.d-input:focus{border-color:var(--ac)}
.d-input.full{width:100%}
.d-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;background:var(--ac-g);color:var(--ac)}
.d-alert{padding:10px 14px;border-radius:6px;font-size:12px}
.d-alert.info{background:var(--ac-g);color:var(--ac)}
.d-alert.error{background:#ef444420;color:var(--err)}
.d-divider{height:1px;background:var(--bd-1);margin:8px 0}
.d-spinner{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--tx-3);font-size:12px}
.d-form{display:contents}
.d-stat{display:inline-flex;flex-direction:column;align-items:center;padding:16px 24px;background:var(--bg-2);border:1px solid var(--bd-1);border-radius:8px;min-width:120px}
.d-stat .val{font-size:24px;font-weight:700;color:var(--ac)}
.d-stat .lbl{font-size:11px;color:var(--tx-3);margin-top:4px}
.d-pbar{height:4px;background:var(--sf-1);border-radius:2px;overflow:hidden;margin:4px 0}
.d-pbar-fill{height:100%;border-radius:2px;background:var(--ac);transition:width .3s}
.d-modal-overlay{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;z-index:100}
.d-modal{background:var(--bg-2);border:1px solid var(--bd-1);border-radius:12px;max-width:700px;width:95vw;max-height:88vh;overflow:auto;padding:20px}
.d-checklist-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px}
.d-checklist-item input[type=checkbox]{width:16px;height:16px;accent-color:var(--ac);cursor:pointer}
.d-inline-edit{cursor:text;padding:2px 4px;border-radius:4px;border:1px solid transparent}
.d-inline-edit:hover{border-color:var(--bd-1)}
.d-tab-bar{display:flex;gap:0;border-bottom:1px solid var(--bd-1);margin-bottom:16px}
.d-tab{padding:8px 16px;font-size:12px;color:var(--tx-3);cursor:pointer;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none;font-family:inherit;transition:all .15s}
.d-tab:hover{color:var(--tx-2)}.d-tab.active{color:var(--ac);border-bottom-color:var(--ac)}
.d-kanban-board{display:flex;gap:10px;overflow-x:auto;padding:8px 0;align-items:flex-start}
.d-kanban-list{min-width:270px;max-width:270px;background:var(--bg-2);border:1px solid var(--bd-1);border-radius:8px;display:flex;flex-direction:column;max-height:calc(100vh - 160px)}
.d-kanban-list-header{display:flex;align-items:center;gap:6px;padding:10px 12px 6px}
.d-kanban-list-cards{padding:4px 7px 7px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:5px}
.d-kanban-card{background:var(--sf-1);border:1px solid var(--bd-1);border-radius:9px;padding:10px 12px;cursor:pointer;transition:all .15s}
.d-kanban-card:hover{transform:translateY(-1px);border-color:var(--bd-2);box-shadow:0 4px 12px #0004}
.d-workspace-card{background:var(--bg-2);border:1px solid var(--bd-1);border-radius:8px;transition:border-color .15s;overflow:hidden}
.d-workspace-card:hover{border-color:var(--bd-2)}
.d-board-card{background:var(--bg-2);border:1px solid var(--bd-1);border-radius:8px;padding:14px;cursor:pointer;transition:all .15s}
.d-board-card:hover{border-color:var(--ac);transform:translateY(-1px);box-shadow:0 4px 16px #0003}
.d-filter-dd{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--sf-1);border:1px solid var(--bd-1);border-radius:6px;font-size:10px;cursor:pointer;color:var(--tx-2)}
.d-select{background:var(--sf-1);border:1px solid var(--bd-1);color:var(--tx-1);padding:4px 8px;border-radius:6px;font-size:11px;font-family:inherit}

/* Scrollbar */
::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bd-2);border-radius:3px}
</style>
</head>
<body>
<div id="app"><!-- B7: SSR skeleton — visible before JS loads --><div class="nav" style="opacity:.5"><span class="brand">${appName}</span></div><div class="main"><div style="max-width:1100px;margin:0 auto"><div class="d-spinner">Loading ${appName}...</div></div></div></div>
<script type="module">
const APP=${JSON.stringify(appName)};
const UI_ROUTES=${JSON.stringify(uiRoutes)};
const UI_NAV=${JSON.stringify(uiNav)};
const AUTH_BUNDLE=${JSON.stringify(authBundle)};
const LOGIN_PATH=${JSON.stringify(loginPath)};
const HAS_SEARCH=${JSON.stringify(!!searchBundle)};

let token=localStorage.getItem('__torque_token__');
let user=null;
let theme=localStorage.getItem('__torque_theme__')||'dark';
try{user=JSON.parse(localStorage.getItem('__torque_user__'))}catch{}
applyTheme();

function applyTheme(){const t=theme==='system'?(matchMedia('(prefers-color-scheme:light)').matches?'light':'dark'):theme;document.documentElement.setAttribute('data-theme',t)}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function avColor(id){return'hsl('+([...(id||'x')].reduce((a,c)=>a+c.charCodeAt(0),0)*137%360)+',55%,45%)'}

// ── Loaded bundle modules cache ────────────────────────────
const moduleCache={};
async function loadBundleViews(bundleName){
  if(moduleCache[bundleName])return moduleCache[bundleName];
  try{
    const mod=await import('/bundles/'+bundleName+'/ui/index.js');
    moduleCache[bundleName]=(mod.default||mod).views||{};
    return moduleCache[bundleName];
  }catch(e){console.warn('Failed to load UI for bundle '+bundleName+':',e);return{}}
}

// ── API helper ─────────────────────────────────────────────
function api(path,opts={}){
  const h={'Content-Type':'application/json',...(opts.headers||{})};
  if(token)h.Authorization='Bearer '+token;
  return fetch(path,{...opts,headers:h}).then(async r=>{
    if(r.status===401){token=null;localStorage.removeItem('__torque_token__');localStorage.removeItem('__torque_user__');user=null;navigate(LOGIN_PATH);throw new Error('Unauthorized')}
    const data=await r.json();
    return data.data!==undefined?data.data:data;
  });
}

// ── Router ─────────────────────────────────────────────────
let currentPath=window.location.hash.slice(1)||'/';

function matchRoute(path){
  for(const route of UI_ROUTES){
    const routeParts=route.path.split('/');
    const pathParts=path.split('/');
    if(routeParts.length!==pathParts.length)continue;
    const params={};let match=true;
    for(let i=0;i<routeParts.length;i++){
      if(routeParts[i].startsWith(':')){params[routeParts[i].slice(1)]=pathParts[i]}
      else if(routeParts[i]!==pathParts[i]){match=false;break}
    }
    if(match)return{route,params};
  }
  return null;
}

function navigate(path){
  currentPath=path;
  window.location.hash=path;
  renderApp();
}

window.addEventListener('hashchange',()=>{
  const p=window.location.hash.slice(1)||'/';
  if(p!==currentPath){currentPath=p;renderApp()}
});

// ── Actions context for views ──────────────────────────────
function makeActions(params){
  return{
    api,
    navigate,
    refresh:()=>renderApp(),
    params:params||{},
  };
}

// ── Descriptor → DOM renderer ──────────────────────────────
function render(desc,actions){
  if(!desc)return document.createTextNode('');
  if(typeof desc==='string')return document.createTextNode(desc);
  if(Array.isArray(desc)){const f=document.createDocumentFragment();for(const d of desc){const el=render(d,actions);if(el)f.appendChild(el);}return f}

  const{type,props={},children}=desc;
  if(!type)return document.createTextNode('');

  let el;
  switch(type){
    case'stack':el=renderStack(props,children,actions);break;
    case'grid':el=renderGrid(props,children,actions);break;
    case'text':el=renderText(props,actions);break;
    case'text-field':el=renderTextField(props);break;
    case'inline-edit':el=renderInlineEdit(props,actions);break;
    case'button':el=renderButton(props,actions);break;
    case'form':el=renderForm(props,children,actions);break;
    case'card':el=renderCard(props,children,actions);break;
    case'badge':el=renderBadge(props);break;
    case'alert':el=renderAlert(props);break;
    case'divider':el=document.createElement('div');el.className='d-divider';break;
    case'spinner':el=document.createElement('div');el.className='d-spinner';el.textContent='Loading...';break;
    case'icon':el=renderIcon(props);break;
    case'modal':el=renderModal(props,children,actions);break;
    case'tab-bar':el=renderTabBar(props,actions);break;
    case'stat-card':el=renderStatCard(props,children,actions);break;
    case'progress-bar':el=renderProgressBar(props);break;
    case'avatar':el=renderAvatar(props);break;
    case'avatar-stack':el=renderAvatarStack(props);break;
    case'select':el=renderSelect(props,actions);break;
    case'filter-dropdown':el=renderFilterDD(props,actions);break;
    case'checklist':el=renderChecklist(props,children,actions);break;
    case'kanban-board':el=renderContainer('d-kanban-board',props,children,actions);break;
    case'kanban-list':el=renderKanbanList(props,children,actions);break;
    case'kanban-card':el=renderKanbanCard(props,actions);break;
    case'card-modal':el=renderModal(props,children,actions);break;
    case'workspace-card':el=renderContainer('d-workspace-card',props,children,actions);break;
    case'board-card':el=renderContainer('d-board-card',props,children,actions);break;
    case'mini-bar':el=renderMiniBar(props);break;
    case'sparkline':el=renderSparkline(props);break;
    default:el=renderContainer('div',props,children,actions);
  }

  applySx(el,props.sx);
  if(props.onClick)el.addEventListener('click',props.onClick);
  if(props.style&&typeof props.style==='object')Object.assign(el.style,props.style);

  return el;
}

function renderChildren(children,actions){
  if(!children)return;
  const arr=Array.isArray(children)?children:[ children];
  const f=document.createDocumentFragment();
  for(const c of arr){if(c!=null){const el=render(c,actions);if(el)f.appendChild(el)}}
  return f;
}

function renderStack(props,children,actions){
  const el=document.createElement('div');el.className='d-stack'+(props.direction==='row'?' row':'');
  if(props.spacing)el.style.gap=(props.spacing*8)+'px';
  const ch=renderChildren(children,actions);if(ch)el.appendChild(ch);
  return el;
}

function renderGrid(props,children,actions){
  const el=document.createElement('div');el.className='d-grid';
  if(props.columns)el.style.gridTemplateColumns=props.columns;
  if(props.spacing)el.style.gap=(props.spacing*8)+'px';
  const ch=renderChildren(children,actions);if(ch)el.appendChild(ch);
  return el;
}

function renderText(props,actions){
  const tag=props.variant==='h4'?'h2':props.variant==='h5'?'h3':props.variant==='h6'?'h4':'p';
  const el=document.createElement(tag);
  el.className='d-text'+(props.variant?' '+props.variant:'');
  el.textContent=props.content||'';
  if(props.onClick)el.style.cursor='pointer';
  return el;
}

function renderTextField(props){
  const el=document.createElement(props.multiline?'textarea':'input');
  el.className='d-input'+(props.fullWidth?' full':'');
  if(props.type)el.type=props.type;
  if(props.name)el.name=props.name;
  if(props.placeholder)el.placeholder=props.placeholder;
  if(props.value!=null)el.value=props.value;
  if(props.required)el.required=true;
  if(props.label){const w=document.createElement('div');const l=document.createElement('label');l.textContent=props.label;l.style.cssText='font-size:10px;color:var(--tx-3);display:block;margin-bottom:3px';w.appendChild(l);w.appendChild(el);return w}
  return el;
}

function renderInlineEdit(props,actions){
  const el=document.createElement('span');
  el.className='d-inline-edit'+(props.variant?' d-text '+props.variant:'');
  el.textContent=props.value||'';
  el.contentEditable=true;
  el.addEventListener('blur',()=>{if(props.onSave&&el.textContent!==props.value)props.onSave(el.textContent)});
  el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();el.blur()}});
  return el;
}

function renderButton(props,actions){
  const el=document.createElement('button');
  el.className='d-btn'+(props.variant?' '+props.variant:'');
  el.textContent=props.label||'';
  if(props.type)el.type=props.type;
  if(props.color==='error'){el.style.color='var(--err)'}
  if(props.disabled)el.disabled=true;
  return el;
}

function renderForm(props,children,actions){
  const el=document.createElement('form');el.className='d-form';
  el.addEventListener('submit',e=>{e.preventDefault();if(props.onSubmit)props.onSubmit(e)});
  const ch=renderChildren(children,actions);if(ch)el.appendChild(ch);
  return el;
}

function renderCard(props,children,actions){
  const el=document.createElement('div');el.className='d-card';
  const ch=renderChildren(children,actions);if(ch)el.appendChild(ch);
  return el;
}

function renderBadge(props){
  const el=document.createElement('span');el.className='d-badge';
  if(props.color){el.style.background=props.color+'30';el.style.color=props.color}
  el.textContent=props.text||props.content||'';
  return el;
}

function renderAlert(props){
  const el=document.createElement('div');el.className='d-alert '+(props.severity||'info');
  el.textContent=props.content||'';
  return el;
}

function renderIcon(props){
  const el=document.createElement('span');el.style.display='inline-flex';
  el.innerHTML=ICONS[props.name]||'';
  return el;
}

function renderModal(props,children,actions){
  const overlay=document.createElement('div');overlay.className='d-modal-overlay';
  const modal=document.createElement('div');modal.className='d-modal';
  modal.addEventListener('click',e=>e.stopPropagation());
  overlay.addEventListener('click',()=>overlay.remove());
  const ch=renderChildren(children,actions);if(ch)modal.appendChild(ch);
  overlay.appendChild(modal);
  return overlay;
}

function renderTabBar(props,actions){
  const el=document.createElement('div');el.className='d-tab-bar';
  for(const tab of(props.tabs||[])){
    const t=document.createElement('button');t.className='d-tab'+(tab.active?' active':'');
    t.textContent=tab.label||'';
    if(tab.onClick)t.addEventListener('click',tab.onClick);
    el.appendChild(t);
  }
  return el;
}

function renderStatCard(props,children,actions){
  const el=document.createElement('div');el.className='d-stat';
  if(children){
    const ch=renderChildren(children,actions);if(ch)el.appendChild(ch);
  }else{
    const v=document.createElement('div');v.className='val';v.textContent=props.value??'—';
    const l=document.createElement('div');l.className='lbl';l.textContent=props.label||'';
    el.appendChild(v);el.appendChild(l);
  }
  return el;
}

function renderProgressBar(props){
  const wrap=document.createElement('div');
  if(props.label){const l=document.createElement('span');l.style.cssText='font-size:10px;color:var(--tx-3)';l.textContent=props.label;wrap.appendChild(l)}
  const bar=document.createElement('div');bar.className='d-pbar';
  const fill=document.createElement('div');fill.className='d-pbar-fill';
  const pct=props.max?Math.round((props.value/props.max)*100):0;
  fill.style.width=pct+'%';
  if(pct>=100)fill.style.background='var(--ok)';
  bar.appendChild(fill);wrap.appendChild(bar);
  return wrap;
}

function renderAvatar(props){
  const el=document.createElement('span');el.className='av';
  const sz=props.size||24;
  el.style.cssText='width:'+sz+'px;height:'+sz+'px;font-size:'+(sz*.36)+'px;background:'+avColor(props.id||props.name);
  const name=props.name||props.initials||'?';
  el.textContent=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return el;
}

function renderAvatarStack(props){
  const el=document.createElement('span');el.style.display='inline-flex';
  const members=props.members||[];
  members.slice(0,3).forEach((m,i)=>{
    const a=renderAvatar({name:m.name||m.email||'?',id:m.id||m.user_id,size:props.size||20});
    if(i>0)a.style.marginLeft='-6px';
    a.style.border='2px solid var(--bg-1)';
    el.appendChild(a);
  });
  if(members.length>3){const more=document.createElement('span');more.className='av';more.style.cssText='width:20px;height:20px;font-size:7px;background:var(--sf-2);color:var(--tx-3);margin-left:-6px;border:2px solid var(--bg-1)';more.textContent='+'+(members.length-3);el.appendChild(more)}
  return el;
}

function renderSelect(props,actions){
  const el=document.createElement('select');el.className='d-select';
  if(props.name)el.name=props.name;
  for(const o of(props.options||[])){const opt=document.createElement('option');opt.value=o.value;opt.textContent=o.label;el.appendChild(opt)}
  if(props.onChange)el.addEventListener('change',()=>props.onChange(el.value));
  return el;
}

function renderFilterDD(props,actions){
  const el=document.createElement('div');el.className='d-filter-dd';
  el.textContent=props.label||'Filter';
  return el;
}

function renderChecklist(props,children,actions){
  const el=document.createElement('div');
  const ch=renderChildren(children,actions);if(ch)el.appendChild(ch);
  return el;
}

function renderKanbanList(props,children,actions){
  const el=document.createElement('div');el.className='d-kanban-list';
  // Header
  const hdr=document.createElement('div');hdr.className='d-kanban-list-header';
  const name=document.createElement('span');name.style.cssText='font-size:12.5px;font-weight:600;color:var(--tx-2);flex:1';name.textContent=props.name||'';
  hdr.appendChild(name);
  if(props.count!=null){const cnt=document.createElement('span');cnt.style.cssText='font-size:10px;padding:1px 6px;background:var(--sf-1);border-radius:4px;color:var(--tx-3)';cnt.textContent=props.count;hdr.appendChild(cnt)}
  el.appendChild(hdr);
  const cards=document.createElement('div');cards.className='d-kanban-list-cards';
  const ch=renderChildren(children,actions);if(ch)cards.appendChild(ch);
  el.appendChild(cards);
  // Drag target
  el.addEventListener('dragover',e=>{e.preventDefault();el.style.outline='2px solid var(--ac)'});
  el.addEventListener('dragleave',()=>{el.style.outline='none'});
  el.addEventListener('drop',e=>{e.preventDefault();el.style.outline='none';if(props.onDrop)props.onDrop(e)});
  return el;
}

function renderKanbanCard(props,actions){
  const el=document.createElement('div');el.className='d-kanban-card';
  el.draggable=true;
  el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',props.id||'');el.style.opacity='.4'});
  el.addEventListener('dragend',()=>{el.style.opacity='1'});
  // Labels
  if(props.labels?.length){const lw=document.createElement('div');lw.style.cssText='display:flex;gap:4px;flex-wrap:wrap;margin-bottom:5px';for(const l of props.labels){const lb=document.createElement('span');lb.style.cssText='padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;background:'+(l.color||'#666')+'30;color:'+(l.color||'#666');lb.textContent=l.name||'';lw.appendChild(lb)}el.appendChild(lw)}
  // Title
  const title=document.createElement('div');title.style.cssText='font-size:12.5px;font-weight:500';title.textContent=props.name||props.title||'';el.appendChild(title);
  return el;
}

function renderMiniBar(props){const el=document.createElement('div');el.style.cssText='display:flex;align-items:flex-end;gap:4px;height:40px';return el}
function renderSparkline(props){return document.createElement('div')}

function renderContainer(cls,props,children,actions){
  const el=document.createElement('div');el.className=cls;
  const ch=renderChildren(children,actions);if(ch)el.appendChild(ch);
  return el;
}

// ── sx prop → inline styles ────────────────────────────────
const SX_MAP={p:'padding',px:null,py:null,m:'margin',mx:null,my:null,mt:'marginTop',mb:'marginBottom',ml:'marginLeft',mr:'marginRight',pt:'paddingTop',pb:'paddingBottom',pl:'paddingLeft',pr:'paddingRight'};
function applySx(el,sx){
  if(!sx||!el)return;
  for(const[k,v]of Object.entries(sx)){
    if(k==='p'){el.style.padding=space(v);continue}
    if(k==='px'){el.style.paddingLeft=space(v);el.style.paddingRight=space(v);continue}
    if(k==='py'){el.style.paddingTop=space(v);el.style.paddingBottom=space(v);continue}
    if(k==='m'){el.style.margin=space(v);continue}
    if(k==='mx'){if(v==='auto'){el.style.marginLeft='auto';el.style.marginRight='auto'}else{el.style.marginLeft=space(v);el.style.marginRight=space(v)}continue}
    if(k==='my'){el.style.marginTop=space(v);el.style.marginBottom=space(v);continue}
    if(SX_MAP[k]){el.style[SX_MAP[k]]=space(v);continue}
    if(k==='maxWidth'||k==='minWidth'||k==='width'||k==='height')el.style[k]=typeof v==='number'?v+'px':v;
    else if(k==='fontWeight')el.style.fontWeight=v;
    else if(k==='fontSize')el.style.fontSize=typeof v==='number'?v+'px':v;
    else if(k==='textAlign')el.style.textAlign=v;
    else if(k==='cursor')el.style.textAlign=v;
    else if(k==='flex')el.style.flex=v;
    else if(k==='alignItems')el.style.alignItems=v;
    else if(k==='justifyContent')el.style.justifyContent=v;
    else if(k==='flexWrap')el.style.flexWrap=v;
    else if(k==='color'){if(v==='text.secondary'||v==='text.disabled')el.style.color='var(--tx-3)';else if(v==='primary.main')el.style.color='var(--ac)';else el.style.color=v}
    else if(k==='bgcolor'||k==='background')el.style.background=v;
    else if(k==='transition')el.style.transition=v;
    else if(k==='overflow')el.style.overflow=v;
    else if(k==='gap')el.style.gap=space(v);
    // ignore complex selectors like &:hover
  }
}
function space(v){return typeof v==='number'?(v*8)+'px':v}

// ── SVG Icons ──────────────────────────────────────────────
const ICONS={
  search:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  folder:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  dashboard:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  bell:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  admin:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  team:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  user:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  moon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  signout:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  chevron:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>',
};

// ── Navigation ─────────────────────────────────────────────
function renderNav(){
  const nav=document.createElement('div');nav.className='nav';

  // Brand
  const brand=document.createElement('span');brand.className='brand';brand.textContent=APP;
  brand.addEventListener('click',()=>navigate('/'));nav.appendChild(brand);

  // Nav items from manifests
  for(const item of UI_NAV){
    const btn=document.createElement('button');btn.className='nb';btn.dataset.path=item.path;
    if(currentPath===item.path||(item.path!=='/'&&currentPath.startsWith(item.path)))btn.classList.add('active');
    if(item.icon&&ICONS[item.icon]){btn.innerHTML=ICONS[item.icon]+' '}
    btn.appendChild(document.createTextNode(item.label));
    btn.addEventListener('click',()=>navigate(item.path));
    nav.appendChild(btn);
  }

  nav.appendChild(Object.assign(document.createElement('span'),{className:'spacer'}));

  // Search box (if search bundle exists)
  if(HAS_SEARCH){
    const sw=document.createElement('div');sw.className='search-wrap';
    const sb=document.createElement('div');sb.className='search-box';
    sb.innerHTML=ICONS.search;
    const inp=document.createElement('input');inp.placeholder='Search...';
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&inp.value){navigate('/search/'+encodeURIComponent(inp.value));inp.value=''}});
    sb.appendChild(inp);sw.appendChild(sb);nav.appendChild(sw);
  }

  // User menu
  if(user){
    const um=document.createElement('div');um.style.position='relative';
    const avBtn=document.createElement('button');avBtn.style.cssText='width:28px;height:28px;border-radius:50%;border:none;cursor:pointer;font-weight:600;font-size:10px;color:#fff;background:'+avColor(user.id);
    avBtn.textContent=(user.name||user.email||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const dd=document.createElement('div');dd.className='dd-menu';dd.style.right='0';dd.style.width='180px';
    // Header
    const hdr=document.createElement('div');hdr.style.cssText='padding:8px 12px;border-bottom:1px solid var(--bd-1);margin-bottom:4px';
    hdr.innerHTML='<div style="font-size:12px;font-weight:600">'+esc(user.name||'')+'</div><div style="font-size:10px;color:var(--tx-3)">'+esc(user.email||'')+'</div>';
    dd.appendChild(hdr);
    [{label:'Profile',icon:'user',path:'/profile'},{label:'Appearance',icon:'moon',path:'/settings'},{label:'Sign out',icon:'signout',action:'logout',cls:'danger'}].forEach(item=>{
      const btn=document.createElement('button');btn.className='dd-item'+(item.cls?' '+item.cls:'');
      btn.innerHTML=(ICONS[item.icon]||'')+' '+item.label;
      btn.addEventListener('click',()=>{dd.style.display='none';if(item.action==='logout'){token=null;user=null;localStorage.removeItem('__torque_token__');localStorage.removeItem('__torque_user__');navigate(LOGIN_PATH)}else{navigate(item.path)}});
      dd.appendChild(btn);
    });
    avBtn.addEventListener('click',e=>{e.stopPropagation();dd.style.display=dd.style.display==='block'?'none':'block'});
    document.addEventListener('click',()=>{dd.style.display='none'});
    um.appendChild(avBtn);um.appendChild(dd);nav.appendChild(um);
  }

  return nav;
}

// ── Main render pipeline ───────────────────────────────────
async function renderApp(){
  const app=document.getElementById('app');
  app.innerHTML='';

  // Auth check
  if(AUTH_BUNDLE&&!token&&currentPath!==LOGIN_PATH){
    navigate(LOGIN_PATH);return;
  }

  // If authenticated and on login page, redirect to home
  if(token&&currentPath===LOGIN_PATH){navigate('/');return}

  // Login page — no nav
  if(currentPath===LOGIN_PATH){
    let bundleLoginRendered=false;
    try{
      const match=matchRoute(LOGIN_PATH);
      if(match){
        const views=await loadBundleViews(match.route.bundle);
        const viewFn=views[match.route.component];
        if(viewFn){
          const actions=makeActions({});
          const desc=viewFn({data:null,actions});
          const main=document.createElement('div');main.style.cssText='min-height:100vh;display:flex;align-items:center;justify-content:center';
          main.appendChild(render(desc,actions));
          app.appendChild(main);
          bundleLoginRendered=true;
        }
      }
    }catch(e){console.warn('Bundle login failed, using fallback:',e)}
    if(bundleLoginRendered)return;
    // Fallback basic login
    app.innerHTML='<div style="display:flex;align-items:center;justify-content:center;min-height:100vh"><div style="background:var(--bg-2);border:1px solid var(--bd-1);border-radius:12px;padding:32px;width:360px"><h2 style="text-align:center;margin-bottom:16px">'+esc(APP)+'</h2><form id="lf"><input class="d-input full" name="email" placeholder="Email" style="margin-bottom:8px"><input class="d-input full" name="password" type="password" placeholder="Password" style="margin-bottom:8px"><button class="d-btn contained full" type="submit" style="width:100%;justify-content:center">Sign in</button></form><div id="lerr" style="color:var(--err);font-size:11px;margin-top:8px"></div></div></div>';
    document.getElementById('lf').addEventListener('submit',async e=>{
      e.preventDefault();
      try{
        const r=await fetch('/api/identity/sign_in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.target.email.value,password:e.target.password.value})});
        const d=await r.json();if(!r.ok){document.getElementById('lerr').textContent=(d.data||d).error||'Login failed';return}
        const dd=d.data||d;token=dd.access_token;user=dd.user;
        localStorage.setItem('__torque_token__',token);localStorage.setItem('__torque_user__',JSON.stringify(user));
        navigate('/');
      }catch(err){document.getElementById('lerr').textContent=err.message}
    });
    return;
  }

  // B4: Incremental DOM — reuse nav, only replace content area
  if(!_navEl||!app.contains(_navEl)){
    _navEl=renderNav();app.appendChild(_navEl);
    _contentContainer=document.createElement('div');_contentContainer.className='main';
    app.appendChild(_contentContainer);
  }else{
    // Update active states in existing nav
    _navEl.querySelectorAll('.nb').forEach(btn=>{
      const path=btn.dataset.path;
      if(path){btn.classList.toggle('active',currentPath===path||(path!=='/'&&currentPath.startsWith(path)))}
    });
  }
  const main=_contentContainer;
  main.innerHTML='';

  // Route matching
  const match=matchRoute(currentPath);
  if(!match){
    main.innerHTML='<div style="max-width:1100px;margin:0 auto"><h2 style="color:var(--tx-3)">Page not found</h2><p style="color:var(--tx-3);font-size:12px;margin-top:8px">No route matches '+esc(currentPath)+'</p></div>';
    return;
  }

  const{route,params}=match;
  const container=document.createElement('div');container.style.maxWidth='1100px';container.style.margin='0 auto';
  main.appendChild(container);

  // Loading state
  container.innerHTML='<div class="d-spinner">Loading...</div>';

  try{
    // Fetch data from fetchUrls
    let data=null;
    if(route.fetchUrls?.length){
      const fetches=route.fetchUrls.map(url=>{
        let resolvedUrl=url;
        for(const[k,v]of Object.entries(params))resolvedUrl=resolvedUrl.replace(':'+k,v);
        return api(resolvedUrl);
      });
      const results=await Promise.all(fetches);
      data=results.length===1?results[0]:results;
    }

    // Load bundle views and call the view function
    const views=await loadBundleViews(route.bundle);
    const viewFn=views[route.component];
    if(!viewFn){
      container.innerHTML='<div class="d-alert error">View component "'+esc(route.component)+'" not found in bundle "'+esc(route.bundle)+'"</div>';
      return;
    }

    // B6: Store state for re-renders
    _state.data=data;_state.route=route;

    // B5: Subscribe to relevant WS channel
    if(params.boardId)wsSubscribe('board:'+params.boardId);
    else if(params.workspaceId)wsSubscribe('workspace:'+params.workspaceId);
    else wsSubscribe('*');

    const actions=makeActions(params);
    const desc=viewFn({data,actions});
    container.innerHTML='';
    container.appendChild(render(desc,actions));
  }catch(err){
    container.innerHTML='<div class="d-alert error">'+esc(err.message)+'</div>';
  }
}

// ── B6: Signal-based State Manager ─────────────────────────
const _state={data:null,route:null,version:0};
function getState(){return _state}
function setState(patch){Object.assign(_state,patch);_state.version++;renderApp()}
// Views always get fresh state via getState() — no stale closures

// ── B4: Incremental DOM — patch only changed content area ──
let _navEl=null;
let _contentContainer=null;

// ── B5: WebSocket Client ───────────────────────────────────
let _ws=null;
let _wsChannel=null;
let _wsRetries=0;
function wsConnect(){
  if(_ws&&_ws.readyState<=1)return;
  if(_wsRetries>2)return; // stop after 3 failed attempts (ws package not installed)
  try{
    const proto=location.protocol==='https:'?'wss:':'ws:';
    const wsUrl=proto+'//'+location.host+'/__torque_ws'+(token?'?token='+token:'');
    _ws=new WebSocket(wsUrl);
    _ws.onopen=()=>{_wsRetries=0;if(_wsChannel)_ws.send(JSON.stringify({type:'subscribe',channel:_wsChannel}))};
    _ws.onmessage=(e)=>{
      try{
        const msg=JSON.parse(e.data);
        if(msg.type==='event'){
          renderApp();
        }
      }catch{}
    };
    _ws.onclose=()=>{_wsRetries++;if(_wsRetries<=2)setTimeout(wsConnect,3000)};
  }catch{}
}
function wsSubscribe(channel){
  if(_wsChannel===channel)return;
  if(_ws&&_ws.readyState===1&&_wsChannel){_ws.send(JSON.stringify({type:'unsubscribe',channel:_wsChannel}))}
  _wsChannel=channel;
  if(_ws&&_ws.readyState===1&&channel){_ws.send(JSON.stringify({type:'subscribe',channel:channel}))}
}

// ── Boot ───────────────────────────────────────────────────
wsConnect();
renderApp();
<` + `/script>
</body>
</html>`;
}
