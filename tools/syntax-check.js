'use strict';
/* 语法检查：node --check 所有 .js（含 src/server/tools/tests）+ 提取 HTML 内联脚本检查
   用法：npm run check */
const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..');

let n=0, bad=0;
function checkFile(p){
  try{
    execFileSync(process.execPath,['--check',p],{stdio:'pipe'});
    n++;
  }catch(e){
    bad++;
    console.error('✗ '+path.relative(ROOT,p)+'\n'+e.stderr);
  }
}
function walk(dir){
  fs.readdirSync(dir,{withFileTypes:true}).forEach(d=>{
    if(d.name==='node_modules'||d.name==='.git'||d.name.startsWith('.')) return;
    const p=path.join(dir,d.name);
    if(d.isDirectory()) walk(p);
    else if(d.name.endsWith('.js')) checkFile(p);
  });
}
walk(ROOT);

/* HTML 内联脚本 */
const html=path.join(ROOT,'pixel-battle-ui.html');
const m=[...fs.readFileSync(html,'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)];
const tmp=path.join(require('os').tmpdir(),'pixie-quest-inline.js');
m.forEach((x,i)=>{
  fs.writeFileSync(tmp,x[1]);
  try{
    execFileSync(process.execPath,['--check',tmp],{stdio:'pipe'});
    n++;
  }catch(e){
    bad++;
    console.error('✗ pixel-battle-ui.html 内联脚本 #'+(i+1)+'\n'+e.stderr);
  }
});

console.log('语法检查: '+(n-bad>=0&&bad===0?'✅ 全部通过':'🔴 有失败')+' ('+n+' 段)');
process.exit(bad?1:0);
