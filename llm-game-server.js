'use strict';
/* NCE 像素答题闯关 · 本地服务 + LM Studio 代理
 * - GET  /              -> 返回 pixel-battle-ui.html（同源，避免 CORS）
 * - GET  /nce-shared.js -> 共享数据模块（题库/动词表/打码/精灵提示词）
 * - POST /llm           -> 转发到 LM Studio http://127.0.0.1:1234/v1/chat/completions
 * - POST /savelogs      -> 实验日志按 sid 落盘（log-fairy-{sid}.json / log-player-{sid}.json + log-index.json）
 * 端口 8797 */
const http=require('http');
const fs=require('fs');
const path=require('path');
const HTML=path.resolve(__dirname,'pixel-battle-ui.html');
const SHARED=path.resolve(__dirname,'nce-shared.js');
const PORT=8797;
const BODY_LIMIT=1024*1024;   /* 请求体上限 1MB：超过直接 413，顺手防御 */

/* 读请求体：累计超 1MB 即断 413（本地单机以前无所谓，加上不亏） */
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

http.createServer((req,res)=>{
  console.log(new Date().toISOString().slice(11,19), req.method, req.url);
  if(req.method==='GET'&&(req.url==='/'||req.url.startsWith('/?'))){
    fs.readFile(HTML,(e,buf)=>{
      if(e){ res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'}); res.end('read html failed: '+e.message); return; }
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      res.end(buf);
    });
    return;
  }
  if(req.method==='GET'&&req.url==='/nce-shared.js'){
    fs.readFile(SHARED,(e,buf)=>{
      if(e){ res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'}); res.end('read shared failed: '+e.message); return; }
      res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});
      res.end(buf);
    });
    return;
  }
  if(req.method==='GET'&&req.url==='/llmhealth'){
    /* 健康检查：LM Studio 是否可达（快速探测，供"召唤小精灵"门禁用） */
    const preq=http.request({host:'127.0.0.1',port:1234,path:'/v1/models',method:'GET',timeout:3000},prs=>{
      let b=''; prs.on('data',c=>b+=c); prs.on('end',()=>{
        let hasModel=false;
        try{ hasModel=(JSON.parse(b).data||[]).some(m=>/qwen/i.test(m.id||'')); }catch(e){}
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:prs.statusCode===200, hasModel}));
      });
    });
    preq.on('error',()=>{ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false})); });
    preq.on('timeout',()=>{ preq.destroy(); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false})); });
    preq.end();
    return;
  }
  if(req.method==='POST'&&req.url==='/savelogs'){
    /* 自动驾驶实验：接收页面内的精灵/玩家日志并按 sid 落盘（供后续分析）。
       按 sid 分文件：两个标签页同时跑不再互相覆盖同一份 live 日志（双会话污染坑）。
       log-index.json 记录每次上报的元信息（sid/模型/是否无提示组/条数），分析时先查索引。 */
    readBody(req,res,buf=>{
      try{
        const d=JSON.parse(buf.toString('utf8'));
        const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
        if(d.tag!=='v2'){ /* 旧版自动驾驶（无判定修正）的数据，另存不覆盖正式文件 */
          fs.writeFileSync(path.join(__dirname,'log-stale.json'),JSON.stringify(d,null,1));
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:true,stale:true})); return;
        }
        /* sid 只留安全字符，防止拼出路径穿越 */
        const sid=String(d.sid||stamp).replace(/[^A-Za-z0-9_-]/g,'').slice(0,32)||stamp;
        const meta={sid, at:stamp, nohint:!!d.nohint, model:d.model||null, sysVer:d.sysVer||null,
                    fairy:(d.fairy||[]).length, player:(d.player||[]).length};
        if(d.fairy) fs.writeFileSync(path.join(__dirname,'log-fairy-'+sid+'.json'),JSON.stringify(d.fairy,null,1));
        if(d.player) fs.writeFileSync(path.join(__dirname,'log-player-'+sid+'.json'),JSON.stringify(d.player,null,1));
        let idx=[];
        try{ idx=JSON.parse(fs.readFileSync(path.join(__dirname,'log-index.json'),'utf8')); if(!Array.isArray(idx)) idx=[]; }catch(e){}
        const prev=idx.find(x=>x.sid===sid);
        if(prev) Object.assign(prev, meta); else idx.push(meta);
        fs.writeFileSync(path.join(__dirname,'log-index.json'),JSON.stringify(idx,null,1));
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,sid,at:stamp,fairy:meta.fairy,player:meta.player}));
      }catch(e){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,err:e.message})); }
    });
    return;
  }
  if(req.method==='POST'&&req.url==='/llm'){
    readBody(req,res,body=>{
      const preq=http.request({host:'127.0.0.1',port:1234,path:'/v1/chat/completions',method:'POST',
        headers:{'Content-Type':'application/json','Content-Length':body.length}},prs=>{
        res.writeHead(prs.statusCode||502,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        prs.pipe(res);
      });
      preq.on('error',e=>{
        res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({error:'LM Studio 不可达: '+e.message}));
      });
      preq.end(body);
    });
    return;
  }
  res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
  res.end('not found');
}).listen(PORT,'127.0.0.1',()=>console.log('NCE game server ready -> http://127.0.0.1:'+PORT));
