export type GameSource = 'local' | 'web';
export type GameOrientation = 'landscape' | 'portrait' | 'any';

export interface Game {
  id: string;
  title: string;
  /** https:// for web games, file:// for uploads kept in the app's documents folder. */
  url: string;
  thumb: string | null;
  description: string;
  category: string;
  source: GameSource;
  orientation: GameOrientation;
  addedAt?: string;
  /** Cover art saved in Supabase storage (private bucket); `thumb` is a signed link to it. */
  coverPath?: string;
}

/** Category given to games added with the + button. */
export const USER_GAME_CATEGORY = 'Added by you';

/** Games the person added themselves (uploaded or pasted), which they can remove. */
export function isUserGame(g: Pick<Game, 'source' | 'category'>): boolean {
  return g.source === 'local' || g.category === USER_GAME_CATEGORY;
}

const featured = (slug: string, title: string, url: string, category: string, description: string): Game => ({
  id: `featured-${slug}`,
  title,
  url,
  thumb: null,
  description,
  category,
  source: 'web',
  orientation: 'landscape',
});

/**
 * Pre-loaded on the Discover tab, ahead of the online feed. Cover art is
 * scraped from each site's og:image the first time Discover opens.
 *
 * Left out because their domains do not exist (checked against DNS on
 * 30 Oct 2026), so they could only show a broken tile: London Street Football
 * (londonstreetfootball.com), San Andreas: Street Legends
 * (sanandreasstreetlegends.com) and Dude Theft Auto (dudetheftauto.com).
 * Paste a working link with the + button to add them.
 */
export const FEATURED_GAMES: Game[] = [
  featured('rim-republic', 'Rim Republic', 'https://rimrepublic.com', 'Street Sports', 'Modern arcade basketball.'),
  featured('basket-bros', 'Basket Bros', 'https://basketbros.io', 'Street Sports', 'Fast-paced 1v1 basketball.'),
  featured('polytrack', 'PolyTrack', 'https://polytrack.org', 'Racing', 'Low-poly neon racing.'),
  featured('dta6', 'DTA 6', 'https://dta6.com', 'Open World', 'Blocky GTA clone.'),
  featured('cod-webports', 'COD Webports', 'https://cod-webports.pages.dev/', 'Shooter', 'Browser COD Zombies and multiplayer.'),
  featured('krunker', 'Krunker.io', 'https://krunker.io', 'Shooter', 'Fast-paced blocky FPS.'),
  featured('venge', 'Venge.io', 'https://venge.io', 'Shooter', 'Slick modern FPS.'),
  featured('shell-shockers', 'Shell Shockers', 'https://shellshock.io', 'Shooter', 'Egg-based team FPS.'),
];

/** Open-source HTML5 games that are always offered, so Discover is never empty offline. */
export const CURATED_GAMES: Game[] = [
  {
    id: 'curated-hextris',
    title: 'Hextris',
    url: 'https://hextris.github.io/hextris/',
    thumb: null,
    description: 'Fast puzzle game inspired by Tetris. Rotate the hexagon to match colours.',
    category: 'Puzzle',
    source: 'web',
    orientation: 'any',
  },
  {
    id: 'curated-clumsy-bird',
    title: 'Clumsy Bird',
    url: 'https://ellisonleao.github.io/clumsy-bird/',
    thumb: null,
    description: 'Tap or press Cross to flap through the pipes.',
    category: 'Arcade',
    source: 'web',
    orientation: 'any',
  },
  {
    id: 'curated-react-tetris',
    title: 'Tetris',
    url: 'https://chvin.github.io/react-tetris/',
    thumb: null,
    description: 'The classic, with D-pad and Cross controls.',
    category: 'Puzzle',
    source: 'web',
    orientation: 'portrait',
  },
  {
    id: 'curated-2048',
    title: '2048',
    url: 'https://play2048.co/',
    thumb: null,
    description: 'Slide tiles to join numbers and reach 2048.',
    category: 'Puzzle',
    source: 'web',
    orientation: 'portrait',
  },
];

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function httpsUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function orientationFor(width: number, height: number): GameOrientation {
  if (!(width > 0) || !(height > 0)) return 'any';
  const r = width / height;
  return r > 1.15 ? 'landscape' : r < 0.87 ? 'portrait' : 'any';
}

/** Turns the GameMonetize JSON feed into games, dropping anything without an https game URL. */
export function parseGameMonetize(json: unknown): Game[] {
  if (!Array.isArray(json)) return [];
  const seen = new Set<string>();
  const out: Game[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const url = httpsUrl(r.url);
    const title = str(r.title);
    if (!url || !title) continue;
    const id = `gm-${str(r.id) || url}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title,
      url,
      thumb: httpsUrl(r.thumb),
      description: str(r.description).slice(0, 400),
      category: str(r.category) || 'Arcade',
      source: 'web',
      orientation: orientationFor(Number(r.width), Number(r.height)),
    });
  }
  return out;
}

/** Library and recently played entries saved on the device; anything malformed is dropped. */
export function parseGameList(raw: string | null): Game[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (g): g is Game =>
        !!g &&
        typeof g === 'object' &&
        typeof (g as Game).id === 'string' &&
        typeof (g as Game).title === 'string' &&
        typeof (g as Game).url === 'string' &&
        /^(https|file):/.test((g as Game).url),
    );
  } catch {
    return [];
  }
}

/** Most recent first, no duplicates, capped. */
export function pushRecent(list: readonly Game[], game: Game, max = 12): Game[] {
  return [game, ...list.filter((g) => g.id !== game.id)].slice(0, max);
}

export function isHtmlFileName(name: string): boolean {
  return /\.x?html?$/i.test(name.trim());
}

/** "space_runner-v2.html" becomes "Space Runner V2". */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60) : 'My game';
}

const siteOf = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** Same site: identical, with or without www, or one is a subdomain of the other (play.example.com on example.com). */
export function sameSite(a: string, b: string): boolean {
  const x = siteOf(a);
  const y = siteOf(b);
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/**
 * Whether the game frame may follow a navigation. The game stays on its own site
 * (a redirect to www. or a subdomain is fine); redirects and pop-unders to other
 * sites (ads, mostly) are blocked at the top frame, while ads and assets inside
 * iframes still load so games keep working.
 */
export function allowGameNavigation(gameUrl: string, requestUrl: string, isTopFrame = true): boolean {
  if (!isTopFrame) return true;
  if (requestUrl === 'about:blank' || requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) return true;
  try {
    const game = new URL(gameUrl);
    const next = new URL(requestUrl);
    if (game.protocol === 'file:') return next.protocol === 'file:' && next.pathname === game.pathname;
    return next.protocol === 'https:' && sameSite(next.hostname, game.hostname);
  } catch {
    return false;
  }
}

export interface EnhancerOptions {
  /** Upscale the game's canvas to the screen's native resolution with sharpening and edge smoothing. */
  upscale: boolean;
  /** Height in device pixels the game is asked to render at (720p by default). */
  renderHeight?: number;
  /** 0 (off) to 1 (strong). */
  sharpness?: number;
}

/** Messages the injected script posts back to the app. */
export type GameMessage =
  | { t: 'beat'; fps: number; enh: boolean; game: boolean }
  | { t: 'error'; msg: string }
  | { t: 'pad'; id: string; on: boolean }
  | { t: 'enh'; on: boolean; why?: string };

export function parseGameMessage(data: string): GameMessage | null {
  try {
    const m = JSON.parse(data) as Partial<GameMessage> & Record<string, unknown>;
    switch (m.t) {
      case 'beat':
        return { t: 'beat', fps: Math.max(0, Math.round(Number(m.fps) || 0)), enh: m.enh === true, game: m.game === true };
      case 'error':
        return { t: 'error', msg: str(m.msg).slice(0, 300) || 'Script error' };
      case 'pad':
        return { t: 'pad', id: str(m.id).slice(0, 80), on: m.on === true };
      case 'enh':
        return { t: 'enh', on: m.on === true, why: m.why ? str(m.why).slice(0, 120) : undefined };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** DualSense / standard-mapping buttons to the keys HTML5 games usually listen for. */
export const PAD_KEYS: Record<number, { key: string; code: string; keyCode: number }> = {
  0: { key: ' ', code: 'Space', keyCode: 32 }, // Cross
  1: { key: 'x', code: 'KeyX', keyCode: 88 }, // Circle
  2: { key: 'z', code: 'KeyZ', keyCode: 90 }, // Square
  3: { key: 'c', code: 'KeyC', keyCode: 67 }, // Triangle
  4: { key: 'q', code: 'KeyQ', keyCode: 81 }, // L1
  5: { key: 'e', code: 'KeyE', keyCode: 69 }, // R1
  8: { key: 'Escape', code: 'Escape', keyCode: 27 }, // Create
  9: { key: 'Enter', code: 'Enter', keyCode: 13 }, // Options
  12: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  13: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  14: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  15: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
};

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_src;
uniform vec2 u_srcSize;
uniform float u_sharp;
varying vec2 v_uv;
vec4 catmullRom(vec2 uv) {
  vec2 p = uv * u_srcSize;
  vec2 t1 = floor(p - 0.5) + 0.5;
  vec2 f = p - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0) / u_srcSize;
  vec2 t3 = (t1 + 2.0) / u_srcSize;
  vec2 t12 = (t1 + w2 / w12) / u_srcSize;
  vec4 c = texture2D(u_src, vec2(t0.x, t0.y)) * w0.x * w0.y;
  c += texture2D(u_src, vec2(t12.x, t0.y)) * w12.x * w0.y;
  c += texture2D(u_src, vec2(t3.x, t0.y)) * w3.x * w0.y;
  c += texture2D(u_src, vec2(t0.x, t12.y)) * w0.x * w12.y;
  c += texture2D(u_src, vec2(t12.x, t12.y)) * w12.x * w12.y;
  c += texture2D(u_src, vec2(t3.x, t12.y)) * w3.x * w12.y;
  c += texture2D(u_src, vec2(t0.x, t3.y)) * w0.x * w3.y;
  c += texture2D(u_src, vec2(t12.x, t3.y)) * w12.x * w3.y;
  c += texture2D(u_src, vec2(t3.x, t3.y)) * w3.x * w3.y;
  return c;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 px = 1.0 / u_srcSize;
  vec3 c = catmullRom(v_uv).rgb;
  vec3 n = texture2D(u_src, v_uv + vec2(0.0, px.y)).rgb;
  vec3 s = texture2D(u_src, v_uv - vec2(0.0, px.y)).rgb;
  vec3 e = texture2D(u_src, v_uv + vec2(px.x, 0.0)).rgb;
  vec3 w = texture2D(u_src, v_uv - vec2(px.x, 0.0)).rgb;
  vec3 lo = min(c, min(min(n, s), min(e, w)));
  vec3 hi = max(c, max(max(n, s), max(e, w)));
  vec3 avg = (n + s + e + w) * 0.25;
  // Contrast-adaptive sharpening: strong on flat detail, eased off near hard edges, clamped so it never rings.
  float contrast = luma(hi) - luma(lo);
  float amount = u_sharp * (1.0 - smoothstep(0.25, 0.75, contrast));
  vec3 sharp = clamp(c + (c - avg) * amount * 2.0, lo, hi);
  // Edge smoothing: blend toward the neighbourhood on high-contrast stair-steps.
  float edge = smoothstep(0.35, 0.8, contrast);
  gl_FragColor = vec4(mix(sharp, (c * 2.0 + avg * 2.0) * 0.25, edge * 0.35), 1.0);
}`;

/**
 * Runs inside the game page before its own scripts. It asks the game to render
 * at about 720p, redraws the main canvas at native resolution through a WebGL
 * upscaler (Catmull-Rom with contrast-adaptive sharpening and edge smoothing),
 * maps a DualSense to keyboard keys, and reports errors and a heartbeat so a
 * hung or crashed game never takes the app down with it.
 */
export function buildEnhancerScript(opts: EnhancerOptions): string {
  const config = JSON.stringify({
    upscale: !!opts.upscale,
    renderHeight: Math.max(360, Math.min(2160, Math.round(opts.renderHeight ?? 720))),
    sharpness: Math.max(0, Math.min(1, opts.sharpness ?? 0.5)),
    pad: PAD_KEYS,
    frag: FRAGMENT_SHADER,
  });
  return `(function(){try{
var CFG=${config};
var RN=window.ReactNativeWebView;
function post(m){try{RN&&RN.postMessage(JSON.stringify(m));}catch(e){}}
var isTop=false;try{isTop=window.top===window;}catch(e){}
// Many sites run the real game in an iframe; only the frame that holds the big canvas (or the page itself) reports.
function hasBigCanvas(){var l=document.getElementsByTagName('canvas'),vw=innerWidth*innerHeight;for(var i=0;i<l.length;i++){var r=l[i].getBoundingClientRect();if(r.width*r.height>vw*0.35)return true;}return false;}
function postEnh(m){if(isTop||hasBigCanvas())post(m);}
var errs=0;
window.addEventListener('error',function(e){if(errs++<3)post({t:'error',msg:String((e&&e.message)||'Script error')});});
window.addEventListener('unhandledrejection',function(e){if(errs++<3)post({t:'error',msg:String((e&&e.reason&&e.reason.message)||e.reason||'Promise rejected')});});
var NATIVE_DPR=window.devicePixelRatio||1;
var origGetContext=HTMLCanvasElement.prototype.getContext;
if(CFG.upscale){
  var shortSide=Math.max(1,Math.min(screen.width,screen.height));
  var scaled=Math.min(NATIVE_DPR,CFG.renderHeight/shortSide);
  try{Object.defineProperty(window,'devicePixelRatio',{get:function(){return scaled;},configurable:true});}catch(e){}
  HTMLCanvasElement.prototype.getContext=function(type,attrs){
    if(type==='webgl'||type==='webgl2'||type==='experimental-webgl'){attrs=Object.assign({},attrs||{},{preserveDrawingBuffer:true});}
    return origGetContext.call(this,type,attrs);
  };
}
var frames=0,fps=0,last=performance.now(),slow=0,enh=null;
function Enhancer(){
  var cv=document.createElement('canvas');
  cv.setAttribute('data-boa-enhancer','1');
  cv.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;image-rendering:auto;';
  var gl=origGetContext.call(cv,'webgl',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,powerPreference:'high-performance'});
  if(!gl)return null;
  function sh(t,src){var s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'shader');return s;}
  var prog=gl.createProgram();
  gl.attachShader(prog,sh(gl.VERTEX_SHADER,'attribute vec2 a;varying vec2 v_uv;void main(){v_uv=a*0.5+0.5;gl_Position=vec4(a,0.0,1.0);}'));
  gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,CFG.frag));
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error('link');
  gl.useProgram(prog);
  var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  var loc=gl.getAttribLocation(prog,'a');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  var tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  var uSize=gl.getUniformLocation(prog,'u_srcSize');
  gl.uniform1f(gl.getUniformLocation(prog,'u_sharp'),CFG.sharpness);
  var src=null,attached=false;
  function pick(){
    var best=null,area=0,vw=innerWidth*innerHeight;
    var list=document.getElementsByTagName('canvas');
    for(var i=0;i<list.length;i++){var c=list[i];if(c===cv)continue;var r=c.getBoundingClientRect();var a=r.width*r.height;if(a>area&&a>vw*0.35&&c.width>0){best=c;area=a;}}
    src=best;
    if(!src){if(attached){cv.remove();attached=false;}return;}
    var r=src.getBoundingClientRect();
    var k=Math.min(NATIVE_DPR,2560/Math.max(r.width,r.height,1));
    var w=Math.round(r.width*k),h=Math.round(r.height*k);
    if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}
    cv.style.left=r.left+'px';cv.style.top=r.top+'px';cv.style.width=r.width+'px';cv.style.height=r.height+'px';
    // Only worth it when the game renders below the screen's resolution.
    var needed=src.width<w*0.95||src.height<h*0.95;
    if(needed&&!attached){document.body.appendChild(cv);attached=true;}
    if(!needed&&attached){cv.remove();attached=false;}
  }
  this.pick=pick;
  this.on=function(){return attached;};
  this.draw=function(){
    if(!attached||!src)return;
    gl.viewport(0,0,cv.width,cv.height);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
    gl.uniform2f(uSize,src.width,src.height);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  };
  this.stop=function(){if(attached)cv.remove();attached=false;src=null;};
}
function disable(why){if(enh){enh.stop();enh=null;postEnh({t:'enh',on:false,why:why});}}
if(CFG.upscale){
  var boot=function(){try{enh=new Enhancer();if(!enh){postEnh({t:'enh',on:false,why:'WebGL unavailable'});return;}enh.pick();setInterval(function(){if(enh)enh.pick();},1500);addEventListener('resize',function(){if(enh)enh.pick();});}catch(e){enh=null;postEnh({t:'enh',on:false,why:String(e&&e.message||e)});}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
}
var held={};
function key(k,down){
  var d=CFG.pad[k];if(!d)return;
  var ev=new KeyboardEvent(down?'keydown':'keyup',{key:d.key,code:d.code,bubbles:true,cancelable:true});
  try{Object.defineProperty(ev,'keyCode',{get:function(){return d.keyCode;}});Object.defineProperty(ev,'which',{get:function(){return d.keyCode;}});}catch(e){}
  (document.activeElement||document.body||document).dispatchEvent(ev);
}
function set(k,down){if(!!held[k]===down)return;held[k]=down;key(k,down);}
addEventListener('gamepadconnected',function(e){post({t:'pad',id:e.gamepad.id,on:true});});
addEventListener('gamepaddisconnected',function(e){post({t:'pad',id:e.gamepad.id,on:false});for(var k in held)if(held[k])set(+k,false);});
function pollPad(){
  var pads=navigator.getGamepads?navigator.getGamepads():[];
  var p=null;for(var i=0;i<pads.length;i++)if(pads[i]&&pads[i].connected){p=pads[i];break;}
  if(!p)return;
  for(var b in CFG.pad){var n=+b;var btn=p.buttons[n];var down=!!(btn&&(btn.pressed||btn.value>0.5));
    if(n===12)down=down||p.axes[1]<-0.5;if(n===13)down=down||p.axes[1]>0.5;if(n===14)down=down||p.axes[0]<-0.5;if(n===15)down=down||p.axes[0]>0.5;
    set(n,down);}
}
function loop(now){
  frames++;
  if(now-last>=1000){fps=Math.round(frames*1000/(now-last));frames=0;last=now;
    // A phone that can't hold 40fps with the upscaler gets the game back at full speed.
    if(enh&&enh.on()&&fps<40){if(++slow>=5)disable('Turned off to keep the game smooth');}else slow=0;}
  try{pollPad();}catch(e){}
  if(enh){try{enh.draw();}catch(e){disable('Canvas cannot be read (cross-origin)');}}
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
setInterval(function(){var g=hasBigCanvas();if(isTop||g)post({t:'beat',fps:document.hidden?0:fps,enh:!!(enh&&enh.on()),game:g});},2000);
}catch(e){try{window.ReactNativeWebView.postMessage(JSON.stringify({t:'error',msg:'Enhancer: '+String(e&&e.message||e)}));}catch(_){}}})();true;`;
}
