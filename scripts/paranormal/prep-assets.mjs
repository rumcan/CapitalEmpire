import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=process.cwd(), source=path.resolve(root,'../TrickOrTreat/public/assets'), dest=path.join(root,'src/assets/paranormal');
await fs.mkdir(dest,{recursive:true});
const specs=[['tommy','characters/hero_tommy.png',6,4,32,90,64,96],['jess','characters/hero_jess.png',6,4,32,90,64,96],['sam','characters/hero_sam.png',6,4,32,90,64,96],['zombie','monsters/enemy_zombie.png',6,1,32,90,64,96],['skeleton','monsters/enemy_skeleton.png',6,1,32,90,64,96],['ghost','monsters/enemy_ghost.png',6,1,32,90,64,96],['werewolf','monsters/enemy_werewolf.png',6,1,48,122,96,128],['witch','monsters/enemy_witch.png',6,1,36,106,72,112],['bat','monsters/enemy_bat.png',4,1,32,52,64,56],['pumpkin','monsters/enemy_pumpkin.png',6,1,32,76,64,80]];
const manifest={}, overrides=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8')).overrides;
for(const [id,file,cols,rows,ax,ay,fw,fh] of specs){
 const key=path.basename(file,'.png'), override=overrides[key];
 const sourceFile=typeof override==='string'?override:override?.file;
 if(!sourceFile)throw Error(`Missing production artwork override for ${key}`);
 const src=path.join(source,sourceFile),m=await sharp(src).metadata();
 if(!m.width||!m.height||m.width%cols||m.height%rows)throw Error(`Invalid native sheet ${file}`);
 const sx=m.width/(cols*fw),sy=m.height/(rows*fh);
 if(Math.abs(sx-sy)>.01)throw Error(`Sheet proportions changed: ${file}`);
 // Keep the native grid/feet, downsample oversized sheets once; no generated art or source edits.
 await sharp(src).resize({width:cols*fw,height:rows*fh,fit:'fill',kernel:'lanczos3'}).webp({lossless:true}).toFile(path.join(dest,`${id}.webp`));
 manifest[id]={file:`${id}.webp`,cols,rows,fw,fh,ax,ay,rowFrames:rows===4?[4,6,4,6]:[cols],source:sourceFile};
}
await fs.writeFile(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Imported ${specs.length} original TrickOrTreat sheets with verified frame grids.`);
