const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let playwright;
try{playwright=require('playwright');}
catch(_){playwright=require(process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const candidates=process.platform==='win32'?['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']:[];
const executablePath=process.env.BROWSER_PATH||candidates.find(p=>fs.existsSync(p));
module.exports={chromium:playwright.chromium,launchOptions:{headless:true,...(executablePath?{executablePath}:{})}};
