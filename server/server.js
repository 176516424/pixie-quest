'use strict';
/* pixie-quest · 本地服务 + LM Studio 代理（v26：配置化 / 上游超时 / 健康检查验模型 / 日志目录）
 * - GET  /                  -> 返回 pixel-battle-ui.html（同源，避免 CORS）
 * - GET  /nce-shared.js     -> 共享数据模块（题库/动词表/打码/精灵提示词）
 * - GET  /src/game-core.js  -> 战斗核心纯逻辑（浏览器与测试共用）
 * - GET  /llmhealth?model=  -> 健康检查：LM Studio 可达且所需模型已加载
 * - POST /llm               -> 转发到 LM Studio /v1/chat/completions（带上游超时）
 * - POST /savelogs          -> 实验日志按 sid 落盘到 LOG_DIR
 *
 * 环境变量（全部有缺省值，本地零配置可跑）：
 *   PORT=8797  HOST=127.0.0.1  LLM_HOST=127.0.0.1  LLM_PORT=1234
 *   LLM_TIMEOUT_MS=170000（页面侧 fetch 150s 主动放弃，上游留余量）
 *   LLM_MODEL_EXPECT=qwen（健康检查的模型匹配口径，可被 ?model= 覆盖）
 *   LOG_DIR=<仓库根>/（实验日志目录） */
const http=require('http');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const HTML=path.join(ROOT,'pixel-battle-ui.html');
const SHARED=path.join(ROOT,'nce-shared.js');
const GAME_CORE=path.join(ROOT,'src','game-core.js');
const PORT=parseInt(process.env.PORT||'8797',10);
const HOST=process.env.HOST||'127.0.0.1';
const LLM_HOST=process.env.LLM_HOST||'127.0.0.1';
const LLM_PORT=parseInt(process.env.LLM_PORT||'1234',10);
const LLM_TIMEOUT_MS=parseInt(process.env.LLM_TIMEOUT_MS||'170000',10);
const LLM_MODEL_EXPECT=process.env.LLM_MODEL_EXPECT||'qwen';
const LOG_DIR=process.env.LOG_DIR?path.resolve(process.env.LOG_DIR):ROOT;
const BODY_LIMIT=1024*1024;   /* 请求体上限 1MB：超过直接 413 */

/* 日志目录：启动时确保存在；落盘失败要能反馈给调用方而不是静默丢数据 */
fs.mkdirSync(LOG_DIR,{recursive:true});
function writeLog(name, data){
  fs.writeFileSync(path.join(LOG_DIR,name), data);   /* 抛错由调用方转 500 */
}

/* 读请求体：累计超 1MB 即断 413 */
function readBody(req,res,cb){
  const chunks=[]; let size=0, dead=false;
  req.on('data',c=>{
    if(dead) return;
    size+=c.length;
    if(size>BODY_LIMIT){
      dead=true;
      res.writeHead(413,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:false,err:'request body too large (>1MB)'}));
      req.destroy(); return;
    }
    chunks.push(c);
  });
  req.on('end',()=>{ if(!dead) cb(Buffer.concat(chunks)); });
}

/* 静态文件：只服务白名单内、仓库根下的文件（防路径穿越） */
function serveFile(res, abs, type){
  if(!abs.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(abs,(e,buf)=>{
    if(e){ res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'}); res.end('read failed: '+e.message); return; }
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});
    res.end(buf);
  });
}

http.createServer((req,res)=>{
  console.log(new Date().toISOString().slice(11,19), req.method, req.url);
  if(req.method==='GET'&&(req.url==='/'||req.url.startsWith('/?'))){
    serveFile(res, HTML, 'text/html; charset=utf-8'); return;
  }
  if(req.method==='GET'&&req.url==='/nce-shared.js'){
    serveFile(res, SHARED, 'application/javascript; charset=utf-8'); return;
  }
  if(req.method==='GET'&&req.url==='/src/game-core.js'){
    serveFile(res, GAME_CORE, 'application/javascript; charset=utf-8'); return;
  }
  if(req.method==='GET'&&req.url.startsWith('/llmhealth')){
    /* 健康检查：不只是「LM Studio 可达」，还要校验所需模型已在列表里。
       ?model=xxx 指定期望模型（子串匹配）；缺省用 LLM_MODEL_EXPECT（默认 qwen） */
    const q=new URL(req.url,'http://x').searchParams;
    const expect=(q.get('model')||LLM_MODEL_EXPECT).toLowerCase();
    const preq=http.request({host:LLM_HOST,port:LLM_PORT,path:'/v1/models',method:'GET',timeout:3000},prs=>{
      let b=''; prs.on('data',c=>b+=c); prs.on('end',()=>{
        let hasModel=false, models=[];
        try{ models=(JSON.parse(b).data||[]).map(m=>m.id||''); hasModel=models.some(id=>id.toLowerCase().includes(expect)); }catch(e){}
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:prs.statusCode===200&&hasModel, hasModel, expect, models}));
      });
    });
    preq.on('error',()=>{ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,expect})); });
    preq.on('timeout',()=>{ preq.destroy(); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,expect})); });
    preq.end();
    return;
  }
  if(req.method==='POST'&&req.url==='/savelogs'){
    /* 按 sid 分文件落盘（双标签页并发不互相覆盖）；log-index.json 记录元信息索引。
       写入失败返回 500——实验数据丢了必须让人知道，不能假装 ok */
    readBody(req,res,buf=>{
      try{
        const d=JSON.parse(buf.toString('utf8'));
        const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
        if(d.tag!=='v2'){ /* 旧版自动驾驶（无判定修正）的数据，另存不覆盖正式文件 */
          writeLog('log-stale.json',JSON.stringify(d,null,1));
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:true,stale:true})); return;
        }
        /* sid 只留安全字符，防止拼出路径穿越 */
        const sid=String(d.sid||stamp).replace(/[^A-Za-z0-9_-]/g,'').slice(0,32)||stamp;
        const meta={sid, at:stamp, nohint:!!d.nohint, model:d.model||null, sysVer:d.sysVer||null,
                    fairy:(d.fairy||[]).length, player:(d.player||[]).length};
        if(d.fairy) writeLog('log-fairy-'+sid+'.json',JSON.stringify(d.fairy,null,1));
        if(d.player) writeLog('log-player-'+sid+'.json',JSON.stringify(d.player,null,1));
        let idx=[];
        try{ idx=JSON.parse(fs.readFileSync(path.join(LOG_DIR,'log-index.json'),'utf8')); if(!Array.isArray(idx)) idx=[]; }catch(e){}
        const prev=idx.find(x=>x.sid===sid);
        if(prev) Object.assign(prev, meta); else idx.push(meta);
        writeLog('log-index.json',JSON.stringify(idx,null,1));
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,sid,at:stamp,fairy:meta.fairy,player:meta.player}));
      }catch(e){ res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,err:'log write failed: '+e.message})); }
    });
    return;
  }
  if(req.method==='POST'&&req.url==='/llm'){
    /* 上游转发 + 超时控制：LM Studio 挂起时给客户端明确的 504，
       而不是让页面 fetch 挂到自己 150s 的 AbortController */
    readBody(req,res,body=>{
      const preq=http.request({host:LLM_HOST,port:LLM_PORT,path:'/v1/chat/completions',method:'POST',
        timeout:LLM_TIMEOUT_MS,
        headers:{'Content-Type':'application/json','Content-Length':body.length}},prs=>{
        res.writeHead(prs.statusCode||502,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        prs.pipe(res);
      });
      preq.on('timeout',()=>{
        preq.destroy();
        if(res.headersSent) return;
        res.writeHead(504,{'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({error:{message:'LLM upstream timeout after '+LLM_TIMEOUT_MS+'ms ('+LLM_HOST+':'+LLM_PORT+')',type:'upstream_timeout'}}));
      });
      preq.on('error',e=>{
        if(res.headersSent) return;
        res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({error:{message:'LM Studio 不可达: '+e.message,type:'upstream_unreachable'}}));
      });
      preq.end(body);
    });
    return;
  }
  res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
  res.end('not found');
}).listen(PORT,HOST,()=>console.log('pixie-quest server ready -> http://'+HOST+':'+PORT+'  (log dir: '+LOG_DIR+')'));
