/* global process, console */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {WORKSPACE} from './prepare.mjs';
export async function serve(port=0,host='127.0.0.1'){
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local'),relative=decodeURI(url.pathname).replace(/^\//,'')||'game/index.html';const f=path.resolve(WORKSPACE,relative);if(!f.startsWith(WORKSPACE+path.sep))throw Error('path');const ext=path.extname(f);res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.txt':'text/plain'})[ext]??'application/octet-stream');res.setHeader('cache-control','no-store');res.end(await readFile(f));}catch{res.writeHead(404);res.end('Not found');}});
 await new Promise(r=>server.listen(port,host,r));return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const s=await serve(Number(process.argv[2]||4328),'0.0.0.0');console.log('Local H5 preview on port '+s.address().port+' /game/index.html');}
