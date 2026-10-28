/** Parse real headings/tables and retain the latest linked source authority. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const claim=s=>/✅|\((?:already\s+)?in\s+(?:the\s+)?game\)/i.test(s)?'in-game-claimed':/🎨/.test(s)?'made-claimed':/⏳/.test(s)?'active-claimed':'unmarked';
export function parseCatalogue(markdown){
  const starts=[...markdown.matchAll(/^[ \t]*(?:[✅🎨⏳]\ufe0f?[ \t]*)?\*\*(\d+)\.\s+(.+?)\*\*([^\r\n]*)/gmu)].map(m=>({index:m.index,number:+m[1],name:m[2],heading:m[0]}));
  for(const m of markdown.matchAll(/^\|\s*(\d+)\s*\|([^\r\n]*)/gm)){const cells=m[2].split('|').map(x=>x.trim()).filter(Boolean);starts.push({index:m.index,number:+m[1],name:cells[0],heading:m[0],cells});}
  starts.sort((a,b)=>a.index-b.index);const sections=[...markdown.matchAll(/^#{2,3} ([^\r\n]+)/gm)];
  const contextAt=index=>{let section='',subsection='';for(const m of sections){if(m.index>index)break;if(m[0].startsWith('## ')){section=m[1];subsection='';}else subsection=m[1];}return {section,subsection};};
  const items=starts.map((s,i)=>{
    const block=markdown.slice(s.index,starts[i+1]?.index??markdown.length),context=contextAt(s.index),ctx=context.subsection+' '+context.section;
    const angle=/·\s*\*\*([A-Z]\d?(?:\s*\+\s*[A-Z])?)\*\*/.exec(s.heading)?.[1]??(s.cells&&/^[A-Z](?:\s*\+\s*[A-Z])?$/.test(s.cells[1])?s.cells[1]:null)??/\((S|Q|P)(?=[:,)])/i.exec(ctx)?.[1]?.toUpperCase()??(/top-down,\s*C/i.test(ctx)?'C':null);
    const id=/`([a-zA-Z][\w-]*:[^`\s]+)`/.exec(s.heading)?.[1]??null,pipelineOnly=/\b(?:player.?s|celebration|animation) clips\b/i.test(s.name);
    return {key:id??`list:${s.number}`,id,itemNumber:s.number,name:s.name.replace(/[✅🎨⏳]/gu,'').trim(),angle,...context,block,owner:pipelineOnly?'3D-pipeline':'ChatGPT',pipelineOnly,
      priority:/\b(P[123])\b/.exec(s.heading)?.[1]??'P3',authorityClaim:claim(s.heading),sourceBlockSha256:sha(Buffer.from(block)),line:markdown.slice(0,s.index).split('\n').length};
  });
  // A section can itself describe a catalogue: the greenkeeping family/condition tables have no numbered item headings.
  for(const m of sections.filter(m=>m[0].startsWith('## '))){const end=sections.find(n=>n.index>m.index&&n[0].startsWith('## '))?.index??markdown.length,block=markdown.slice(m.index,end);
    if(!/^\d+\./.test(m[1])||!/(?:families|conditions|decal sheets)/i.test(block)||!/^\|\s*`[\w-]+`\s*\|/m.test(block)||starts.some(x=>x.index>m.index&&x.index<end))continue;
    items.push({key:'section:'+m[1].split('.')[0],id:null,itemNumber:null,name:m[1],angle:/Angle C/i.test(block)?'C':null,section:m[1],subsection:'',block,owner:'ChatGPT',pipelineOnly:false,priority:'P3',authorityClaim:'unmarked',sourceBlockSha256:sha(Buffer.from(block)),line:markdown.slice(0,m.index).split('\n').length});
  }
  const counts=new Map();for(const item of items)counts.set(item.key,(counts.get(item.key)??0)+1);
  for(const item of items)if(counts.get(item.key)>1)item.key+=':'+sha(Buffer.from(item.section+'|'+item.subsection+'|'+item.name)).slice(0,12);
  return items.sort((a,b)=>a.line-b.line);
}
export async function readSources(config){
  const markdown=await fs.readFile(config.authorityFile,'utf8'),sources=[{file:config.authorityFile,sha256:sha(Buffer.from(markdown)),role:'catalogue'}],texts={catalogue:markdown};
  const links=[...markdown.matchAll(/\]\(([^)]+(?:CHATGPT-IMAGE-QUEUE|GROUND-TEXTURE-METHOD)\.md)\)/g)].map(m=>path.resolve(path.dirname(config.authorityFile),m[1]));
  for(const file of new Set([...(config.linkedAuthorityFiles??[]),...links])){const text=await fs.readFile(file,'utf8'),role=/CHATGPT-IMAGE-QUEUE/.test(file)?'paste-ready-queue':'ground-method';sources.push({file,sha256:sha(Buffer.from(text)),role});texts[role]=text;}
  return {markdown,sources,texts,authoritySha256:sources[0].sha256,sourceFingerprint:sha(Buffer.from(JSON.stringify(sources)))};
}
export async function sourcesUnchanged(queue){for(const s of queue.sources??[])try{if(sha(await fs.readFile(s.file))!==s.sha256)return false;}catch{return false;}return true;}
export function linkedDeliverables(text,config){
  const out=[];let number=null,folder='',firstNumber=null;const lines=text.split(/\r?\n/);
  for(let i=0;i<lines.length;i++){const line=lines[i],n=/^#{2,3}\s+(\d+)\b|^## .*?\(item (\d+)/i.exec(line);if(n)number=+(n[1]??n[2]);if(/^## First:/i.test(line)&&number)firstNumber=number;
    const target=/`art\/theme-consistency\/generated\/([^`]+)\//.exec(line);if(target)folder=target[1];const output=/save as\s+`([^`]+\.png)`/i.exec(line);if(!output||!number)continue;
    const name=output[1],label=/\*\*(\d+[a-z]),/.exec(line)?.[1],stem=path.basename(name).replace(/-v\d+\.png$/,''),tail=lines.slice(i+1).join('\n');
    out.push({itemNumber:number,key:label?label+'-'+stem.split('-').at(-1):number+'-'+stem,output:path.resolve(config.repoRoot,'art/theme-consistency/generated',name.includes('/')?name:path.join(folder,name)),prompt:/```(?:text)?\s*\n([\s\S]*?)```/.exec(tail)?.[1]??'',sourceLine:i+1,first:number===firstNumber});
  }
  return out;
}
