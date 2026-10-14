
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stats401-lab10-'));
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const errors = [];
let browser, socket, server;
let failData = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mockVision = `
export class FilesetResolver { static async forVisionTasks() { return {}; } }
export class HandLandmarker {
  static async createFromOptions() {
    window.modelLoads = (window.modelLoads || 0) + 1;
    if (window.failModel) throw new Error('simulated model failure');
    if (window.delayModel) await new Promise(resolve => window.resolveModel = resolve);
    return new HandLandmarker();
  }
  detectForVideo() { return { landmarks: window.handX == null ? [] : [Array.from({length:21}, () => ({x:1-window.handX,y:.5,z:0}))] }; }
  close() { window.modelClosed = (window.modelClosed || 0) + 1; }
}`;
const setup = `
window.voiceStarts = 0; window.cameraRequests = 0;
class FakeSpeechRecognition {
  constructor() { window.fakeRecognition = this; }
  start() { window.voiceStarts++; this.onstart?.(); }
  abort() { this.onend?.(); }
}
window.SpeechRecognition = FakeSpeechRecognition;
window.emitSpeech = transcript => window.fakeRecognition.onresult({resultIndex:0, results:[Object.assign([{transcript}],{isFinal:true})]});
navigator.mediaDevices.getUserMedia = async () => {
  window.cameraRequests++;
  if (window.denyCamera) throw new DOMException('denied','NotAllowedError');
  const canvas = document.createElement('canvas'); canvas.width=640; canvas.height=480;
  const ctx=canvas.getContext('2d'); let t=0;
  const timer=setInterval(() => {ctx.fillStyle=t++%2?'#777':'#888';ctx.fillRect(0,0,640,480)},50);
  window.fakeStream=canvas.captureStream(20);
  for(const track of window.fakeStream.getTracks()) { const stop=track.stop.bind(track); track.stop=()=>{clearInterval(timer);stop()}; }
  return window.fakeStream;
};`;

async function main() {
    const reflection = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
        .match(/id="design-reflection">([\s\S]*?)<\/p>/)[1].trim().split(/\s+/).length;
    assert(reflection >= 100 && reflection <= 200);
    console.log(`PASS: reflection is ${reflection} words`);
    server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (pathname === '/test-vision/vision_bundle.mjs') {
            response.writeHead(200, {'Content-Type':'text/javascript'}); response.end(mockVision); return;
        }
        if (failData && pathname.endsWith('.csv')) {response.writeHead(404);response.end();return;}
        const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
        if (!file.startsWith(root + path.sep)) { response.writeHead(403);response.end();return; }
        try {
            let content = fs.readFileSync(file);
            if (pathname === '/lab10/lab10.js') content = content.toString().replace(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18', '/test-vision');
            const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.csv':'text/csv'};
            response.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
            response.end(content);
        } catch {response.writeHead(404);response.end();}
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = `http://localhost:${server.address().port}/lab10/`;
    browser = spawn(chromePath, ['--headless=new','--no-first-run','--no-default-browser-check',
        '--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`], {windowsHide:true});
    const debuggerUrl = await new Promise((resolve, reject) => {
        let output = '';
        browser.stderr.on('data', chunk => {output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match)resolve(match[1]);});
        browser.on('error',reject);browser.on('exit',code=>reject(new Error(`Chrome exited: ${code}`)));
        setTimeout(()=>reject(new Error('Chrome debugger startup timed out')),15000).unref();
    });
    const port = new URL(debuggerUrl).port;
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
    socket = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
    let nextId=0; const pending = new Map();
    socket.addEventListener('message',event=>{
        const message=JSON.parse(event.data);
        if(message.id) {const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(new Error(message.error.message)):p.resolve(message.result);}
        if(message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description||''));
    });
    const send = (method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    const evaluate = async expression => {
        const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
        if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description||'Evaluation failed');
        return result.result.value;
    };
    const until = async expression => {
        for(let i=0;i<100;i++) {if(await evaluate(expression))return;await sleep(50);}
        throw new Error(`Timed out: ${expression}`);
    };
    const click=id=>evaluate(`document.getElementById('${id}').click()`);
    const day=()=>evaluate(`+document.getElementById('time-slider').value`);
    const text=id=>evaluate(`document.getElementById('${id}').textContent`);
    await send('Page.enable');await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:setup});
    await send('Page.navigate',{url:address});
    await until(`!document.getElementById('play')?.disabled`);
    assert.equal(await evaluate('voiceStarts + cameraRequests'),0);
    assert.equal(await evaluate(`document.querySelectorAll('.network-node').length`),12);
    assert.equal(await evaluate(`document.querySelectorAll('.timeline-svg').length`),1);
    console.log('PASS: original network and timeline load; sensors stay off');
    await click('play');await sleep(1050);assert.equal(await day(),2);
    await click('pause');await sleep(1000);assert.equal(await day(),2);
    await click('reset');assert.equal(await day(),1);
    await evaluate(`const s=document.getElementById('time-slider');s.value=30;s.dispatchEvent(new Event('input',{bubbles:true}));`);
    assert((await text('current-time')).startsWith('Day 30 -'));
    assert.equal(await evaluate(`+document.querySelector('.time-guide').getAttribute('x1')`),80+(29/59)*850);
    console.log('PASS: mouse playback and slider synchronize with the timeline');
    await click('voice-button');await evaluate(`emitSpeech('Play.');`);await sleep(1050);assert.equal(await day(),31);
    await evaluate(`emitSpeech('Pause');`);await sleep(1000);assert.equal(await day(),31);
    await evaluate(`emitSpeech('Reset!');`);assert.equal(await day(),1);
    await evaluate(`emitSpeech('display');`);assert.match(await text('voice-status'),/not recognized/);
    await click('voice-button');const starts=await evaluate('voiceStarts');
    await evaluate(`emitSpeech('Play');`);await sleep(600);assert.equal(await evaluate('voiceStarts'),starts);
    assert.equal(await day(),1);
    await click('voice-button');await evaluate(`fakeRecognition.onerror({error:'not-allowed'});`);
    assert.match(await text('voice-status'),/permission denied/);
    assert.equal(await evaluate(`document.getElementById('voice-button').getAttribute('aria-pressed')`),'false');
    console.log('PASS: voice commands, unknown phrases, stopping, and permission failure');
    await evaluate('window.denyCamera=true');await click('camera-button');
    await until(`document.getElementById('gesture-status').textContent.includes('permission denied')`);
    await evaluate(`window.denyCamera=false;window.failModel=true`);await click('camera-button');
    await until(`document.getElementById('gesture-status').textContent.includes('could not start')`);
    assert.equal(await evaluate(`fakeStream.getTracks()[0].readyState`),'ended');
    console.log('PASS: denied camera and model failure preserve fallback and release streams');
    await evaluate(`window.failModel=false;window.handX=.5`);await click('camera-button');
    await until(`document.getElementById('gesture-status').textContent.includes('Hand detected')`);
    await sleep(500);assert.equal(await day(),1);
    await evaluate('window.handX=.505');await sleep(500);assert.equal(await day(),1);
    await evaluate('window.handX=.65');await sleep(750);assert((await day())>10);
    assert.match(await text('gesture-status'),/Right/);
    const rightDay=await day();await evaluate('window.handX=.5');await sleep(750);assert((await day())<rightDay);
    assert.match(await text('gesture-status'),/Left/);
    await evaluate(`{const s=document.getElementById('time-slider');s.value=59;s.dispatchEvent(new Event('input',{bubbles:true}));window.handX=.5;}`);
    await sleep(450);await evaluate('window.handX=.65');await sleep(750);assert.equal(await day(),60);
    await evaluate('window.handX=.55');await sleep(650);assert((await day())<60);
    const beforeLoss=await day();await evaluate('window.handX=null');await sleep(250);
    await evaluate('window.handX=.9');await sleep(600);assert.equal(await day(),beforeLoss);
    await click('camera-button');assert.equal(await evaluate(`fakeStream.getTracks()[0].readyState`),'ended');
    console.log('PASS: simulated hand dragging, jitter filtering, reacquisition, and camera stop');
    await click('voice-button');await click('camera-button');
    await until(`document.getElementById('gesture-status').textContent.includes('Hand detected')`);
    await evaluate(`Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));`);
    assert.equal(await evaluate(`document.getElementById('voice-button').getAttribute('aria-pressed')`),'false');
    assert.equal(await evaluate(`fakeStream.getTracks()[0].readyState`),'ended');
    console.log('PASS: hiding the page stops both sensors');
    if (process.env.CHECK_MEDIAPIPE === '1') {
        await evaluate(`
          (async()=>{
            const {FilesetResolver,HandLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs');
            const fileset=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm');
            const detector=await HandLandmarker.createFromOptions(fileset,{
              baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'CPU'},
              runningMode:'IMAGE',numHands:1
            });
            const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
            canvas.getContext('2d').fillRect(0,0,640,480);
            const result=detector.detect(canvas);detector.close();
            if(result.landmarks.length!==0)throw new Error('Unexpected hand in blank frame');
          })()
        `);
        console.log('PASS: real CDN module, WebAssembly, model initialization, and blank-frame inference');
    }
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;`});
    await send('Page.navigate',{url:address});await until(`!document.getElementById('play')?.disabled`);
    assert.equal(await evaluate(`document.getElementById('voice-button').disabled`),true);
    await click('play');await sleep(1000);assert.equal(await day(),2);await click('pause');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true);
    console.log('PASS: unsupported voice keeps fallback usable; mobile layout fits');
    assert.deepEqual(errors,[]);
    failData=true;await send('Page.navigate',{url:address});
    await until(`document.getElementById('action-status')?.textContent.includes('Data unavailable')`);
    assert.equal(await evaluate(`document.getElementById('camera-button').disabled`),true);
    console.log('PASS: data failure leaves sensors disabled and explains recovery');
    console.log('All browser integration checks passed (simulated recognition, no live hardware).');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
    socket?.close();browser?.kill();server?.close();
    await sleep(700);
    // Only delete the temporary browser profile created by mkdtemp above.
    if(profile.startsWith(path.join(os.tmpdir(),'stats401-lab10-'))) {
        try {fs.rmSync(profile,{recursive:true,force:true});} catch {}
    }
});
