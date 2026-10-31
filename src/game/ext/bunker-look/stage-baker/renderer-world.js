// Host adaptation of the supplied SDK: the ordinary colour pass is unchanged.
// semanticPass only emits geometry IDs for native floor/wall/lip staging; original vendor files remain preserved.
import {buildTerrain} from './terrain-field.js';
import {WallRenderer} from './wall-renderer.js';
const VS=`#version 300 es
precision highp float;layout(location=0)in vec3 aPosition;layout(location=1)in vec2 aWorld;out vec2 vWorld;void main(){gl_Position=vec4(aPosition,1.);vWorld=aWorld;}`;
const FS=`#version 300 es
precision highp float;in vec2 vWorld;out vec4 outColor;uniform sampler2D uSand;uniform sampler2D uSoil;uniform sampler2D uGrass;uniform sampler2D uFirstCut;uniform sampler2D uField;uniform vec2 uWorldSize;uniform vec2 uMaterialOrigin;uniform float uDepth;uniform float uCollar;uniform float uFirstWidth;uniform float uRim;uniform float uSlope;uniform float uShadow;uniform float uWall;uniform vec2 uFace;uniform vec2 uFaceSpan;uniform float uTextureScale;uniform float uRoughScale;uniform float uFirstScale;uniform float uSandScale;uniform float uSandAngle;uniform float uSandExposure;uniform float uEarthScale;uniform float uSoilScale;uniform int uBorder;uniform int uSemantic;
float ss(float a,float b,float v){float t=clamp((v-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
float distanceAt(vec2 p){vec2 rg=texture(uField,clamp((p+8.)/uWorldSize,0.,1.)).rg;return ((rg.r*255.*256.+rg.g*255.)/65535.)*16.-8.;}
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x),mix(hash2(i+vec2(0,1)),hash2(i+1.),f.x),f.y);}
// Host: the cut face is full height on the side toward the green and half on the far side (faceK; uFace zero: even all round)
float faceK(vec2 p){if(dot(uFace,uFace)<.5)return 1.;return .75+.25*clamp((dot(p,uFace)-uFaceSpan.x)/uFaceSpan.y,-1.,1.);}
float heightAt(vec2 p){float d=distanceAt(p);float t=max(d,0.);float bowl=.72*ss(-.045,uSlope,d)+.28*(1.-exp(-t/2.5));float mound=uRim*exp(-pow((d+uCollar*.26)/(uCollar*.47),2.));return -uDepth*bowl+mound-uWall*faceK(p)*ss(-.006,.008,d);}
float slopeHeightAt(vec2 p){float d=distanceAt(p);return heightAt(p)+uWall*faceK(p)*ss(-.006,.008,d);}
vec3 rawMat(sampler2D s,vec2 uv){return texture(s,.008+.984*uv).rgb;}
vec3 seamless(sampler2D s,vec2 p){vec2 q=fract(p),r=fract(p+.5);vec2 w=vec2(ss(.27,.47,abs(q.x-.5)),ss(.27,.47,abs(q.y-.5)));return mix(mix(rawMat(s,q),rawMat(s,vec2(r.x,q.y)),w.x),mix(rawMat(s,vec2(q.x,r.y)),rawMat(s,r),w.x),w.y);}
vec3 grassTexture(vec2 p){vec2 uv=vec2((p.x-p.y)*.08,(p.x+p.y)*.09)/(uTextureScale*uRoughScale);vec2 q=fract(uv),r=fract(uv+.5);vec2 w=vec2(ss(.32,.48,abs(q.x-.5)),ss(.32,.48,abs(q.y-.5)));return mix(mix(texture(uGrass,q).rgb,texture(uGrass,vec2(r.x,q.y)).rgb,w.x),mix(texture(uGrass,vec2(q.x,r.y)).rgb,texture(uGrass,r).rgb,w.x),w.y);}
vec3 firstCutTexture(vec2 p){vec2 uv=vec2((p.x-p.y)*.0872,(p.x+p.y)*.09)/(uTextureScale*uFirstScale);vec2 q=fract(uv),r=fract(uv+.5);vec2 w=vec2(ss(.32,.48,abs(q.x-.5)),ss(.32,.48,abs(q.y-.5)));return mix(mix(texture(uFirstCut,q).rgb,texture(uFirstCut,vec2(r.x,q.y)).rgb,w.x),mix(texture(uFirstCut,vec2(q.x,r.y)).rgb,texture(uFirstCut,r).rgb,w.x),w.y);}
void main(){
 vec2 p=vWorld;vec2 materialP=p+uMaterialOrigin;float d=distanceAt(p);
 float outerWidth=uCollar+uFirstWidth;
 float edgeClumps=noise2(materialP*24.)*.68+noise2(materialP*83.)*.32;
 float outerEdge=-d-outerWidth+(edgeClumps-.5)*.20;
 float alpha=1.-ss(-.012,.012,outerEdge);
 if(uBorder==1)alpha*=1.-ss(.30,.70,d);
 if(alpha<.001)discard;
 if(uSemantic==1){outColor=vec4(d>=0.?vec3(1.,0.,0.):vec3(0.,0.,1.),alpha);return;}
 vec2 uv=materialP*.9/(uTextureScale*uSoilScale);vec3 roughGrass=grassTexture(materialP),cutGrass=firstCutTexture(materialP);
 float leafPattern=clamp(dot(cutGrass,vec3(.299,.587,.114))*1.7,0.,1.);
 float overlapNoise=noise2(materialP*25.)*.57+noise2(materialP*79.)*.27+leafPattern*.16;
 float cutEdge=-d-uCollar+(overlapNoise-.5)*min(.28,uFirstWidth*.65);
 vec3 grass=mix(roughGrass,cutGrass,ss(-.014,.014,cutEdge));
 vec3 sand=seamless(uSand,mat2(cos(uSandAngle),sin(uSandAngle),-sin(uSandAngle),cos(uSandAngle))*materialP*1.5/(uTextureScale*uSandScale))*vec3(1.015,1.0,.97)*uSandExposure,soil=seamless(uSoil,uv);
 float raggedEdge=d+(noise2(materialP*75.)-.5)*.030;
 vec2 inward=normalize(vec2(distanceAt(p+vec2(.01,0.))-distanceAt(p-vec2(.01,0.)),distanceAt(p+vec2(0.,.01))-distanceAt(p-vec2(0.,.01)))+vec2(.00001));
 vec2 tangent=vec2(-inward.y,inward.x);
 float strandLength=.025+.070*noise2(materialP*31.);
 float strands=pow(.5+.5*sin(dot(materialP,tangent)*310.+noise2(materialP*11.)*3.),12.)*(1.-ss(.008,strandLength,d))*ss(-.025,.003,d);
 float toSand=ss(-.006,.012,raggedEdge)*(1.-strands);vec3 color=mix(grass,sand,toSand);
 float roots=ss(-.002,.010,d)*(1.-ss(.018,.047,d))*min(.64,uDepth*.52);
 color=mix(color,soil,roots);
 float borderPhase=d*170./(uTextureScale*uSandScale)+sin(materialP.x*.8+materialP.y*.7)*.16;
 float centrePhase=dot(materialP,vec2(.91,.414))*170./(uTextureScale*uSandScale)+sin(materialP.x*.65)*.12;
 float centreMix=ss(.48,.98,d);
 vec2 rakeLight=normalize(vec2(.65,-.9));
 float borderFacing=dot(inward,rakeLight),centreFacing=dot(normalize(vec2(.91,.414)),rakeLight);
 float borderSide=borderFacing>=0.?1.:-1.,centreSide=centreFacing>=0.?1.:-1.;
 float borderGroove=pow(.5+.5*cos(borderPhase-borderSide*.58),12.);
 float centreGroove=pow(.5+.5*cos(centrePhase-centreSide*.58),12.);
 float borderHighlight=pow(.5+.5*cos(borderPhase+borderSide*.58),12.);
 float centreHighlight=pow(.5+.5*cos(centrePhase+centreSide*.58),12.);
 float borderTone=(-.155*borderGroove+.095*borderHighlight)*(.55+.45*abs(borderFacing));
 float centreTone=(-.155*centreGroove+.095*centreHighlight)*(.55+.45*abs(centreFacing));
 float rakeTone=mix(borderTone,centreTone,centreMix);
 float workedSand=ss(.22,.40,d);
 float passVariation=(fract(dot(materialP,vec2(.91,.414))/.25)-.5)*.012;
 color*=1.+rakeTone*toSand*workedSand+passVariation*centreMix;
 color*=1.-.018*workedSand;
 float eps=.008;float zx=(slopeHeightAt(p+vec2(eps,0.))-slopeHeightAt(p-vec2(eps,0.)))/(4.*eps);
 float zy=(slopeHeightAt(p+vec2(0.,eps))-slopeHeightAt(p-vec2(0.,eps)))/(4.*eps);
 vec3 N=normalize(vec3(-zx,-zy,1.)),L=normalize(vec3(.65,-.9,.52));
 float shade=clamp((.40+.71*max(dot(N,L),0.))/(.40+.71*L.z),.66,1.13);
 float z=heightAt(p),occlusion=0.;vec2 ray=normalize(L.xy);
 for(int step=1;step<=18;step++){float t=float(step)*.075;float rayZ=z+t*2.*L.z/length(L.xy);float blocker=heightAt(p+ray*t);occlusion=max(occlusion,ss(-.045,.065,blocker-rayZ));}
 float contact=exp(-pow((d-.10)/.18,2.))*min(.35,uDepth*.20);
 color*=shade*(1.-contact)*max(.36,1.-occlusion*.38*uShadow);
 float cutDistance=-d-uCollar,outerDistance=-d-outerWidth;
 float cutShadow=(exp(-pow(max(cutDistance,0.)/.075,2.))*ss(-.006,.015,cutDistance)+.55*exp(-pow(max(outerDistance,0.)/.045,2.))*ss(-.006,.012,outerDistance))*max(dot(inward,normalize(L.xy)),0.);
 color*=1.-clamp(cutShadow*uShadow*.23,0.,.36);
 float litEdge=pow(max(dot(-inward,normalize(L.xy)),0.),3.);
 float glint=(exp(-pow((cutDistance+.018)/.027,2.))+.50*exp(-pow((outerDistance+.012)/.022,2.)))*litEdge;
 color+=vec3(.13,.12,.055)*glint*(.60+.40*noise2(materialP*45.));
 outColor=vec4(color,alpha);
}`;
function compile(gl,t,s){const q=gl.createShader(t);gl.shaderSource(q,s);gl.compileShader(q);if(!gl.getShaderParameter(q,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(q));return q;}
const BLADE_VS=`#version 300 es
precision highp float;layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aColor;out vec3 vColor;void main(){gl_Position=vec4(aPosition,1.);vColor=aColor;}`;
const BLADE_FS=`#version 300 es
precision highp float;in vec3 vColor;out vec4 outColor;uniform int uSemantic;void main(){outColor=uSemantic==1?vec4(0.,0.,1.,1.):vec4(vColor,1.);}`;
export function surfaceHeight(d,depth,options={}){const ss=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};const collar=options.collar??.65,rim=options.rim??.16,slope=options.slope??1.1;return -depth*(.72*ss(-.045,slope,d)+.28*(1-Math.exp(-Math.max(d,0)/2.5)))+rim*Math.exp(-Math.pow((d+collar*.26)/(collar*.47),2))-(options.wall??.25)*ss(-.006,.008,d);}
/** Host: the cut face's direction (options.face: a unit vector in tiles toward the green) across this bunker's outline: the outline's
 *  middle and half its reach along it, or null (no green: the face is even all round). */
export function faceSpan(contours,face){if(!face||!contours?.length)return null;let lo=Infinity,hi=-Infinity;for(const path of contours)for(const [x,y]of path){const t=x*face[0]+y*face[1];lo=Math.min(lo,t);hi=Math.max(hi,t);}return hi>lo?{face,c:(lo+hi)/2,r:(hi-lo)/2}:null;}
/** Host: the share of the cut face's height at a point (1 on the green side, .5 on the far side; the shader's faceK). */
export function faceK(span,x,y){return span ? .75+.25*Math.max(-1,Math.min(1,(x*span.face[0]+y*span.face[1]-span.c)/span.r)):1;}
export class WorldRenderer{
 constructor(){
  this.canvas=typeof document==='undefined'?new OffscreenCanvas(1,1):document.createElement('canvas');this.canvas.width=1488;this.canvas.height=768;
  const gl=this.gl=this.canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 required');
  const p=this.program=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,VS));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
  this.u={};for(const n of ['uSand','uSoil','uGrass','uFirstCut','uField','uWorldSize','uMaterialOrigin','uDepth','uCollar','uFirstWidth','uRim','uSlope','uShadow','uWall','uFace','uFaceSpan','uTextureScale','uRoughScale','uFirstScale','uSandScale','uSandAngle','uSandExposure','uEarthScale','uSoilScale','uBorder','uSemantic'])this.u[n]=gl.getUniformLocation(p,n);
  // texture units: 0 sand, 1 distance field, 2 rough, 3 first cut, 4 wall (WallRenderer), 5 soil, 7 uploads
  gl.uniform1i(this.u.uSand,0);gl.uniform1i(this.u.uSoil,5);gl.uniform1i(this.u.uGrass,2);gl.uniform1i(this.u.uFirstCut,3);
  this.fieldTex=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.fieldTex);for(const what of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,what,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(this.u.uField,1);
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,20,12);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);this.gridKey='';
  this.bladeProgram=gl.createProgram();gl.attachShader(this.bladeProgram,compile(gl,gl.VERTEX_SHADER,BLADE_VS));gl.attachShader(this.bladeProgram,compile(gl,gl.FRAGMENT_SHADER,BLADE_FS));gl.linkProgram(this.bladeProgram);if(!gl.getProgramParameter(this.bladeProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.bladeProgram));this.bladeSemantic=gl.getUniformLocation(this.bladeProgram,'uSemantic');this.bladeVAO=gl.createVertexArray();gl.bindVertexArray(this.bladeVAO);this.bladeBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.bladeBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);gl.bindVertexArray(this.vao);
  this.wallRenderer=new WallRenderer(gl);gl.useProgram(this.program);gl.bindVertexArray(this.vao);
 }
 /** One slot picture as a mipmapped texture (the caller caches it by texture id); the wall repeats, the ground slots clamp. */
 upload(image,repeat=false){const gl=this.gl,tex=gl.createTexture();gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);const wrap=repeat?gl.REPEAT:gl.CLAMP_TO_EDGE;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);gl.bindTexture(gl.TEXTURE_2D,null);return tex;}
 bindTextures(textures){const gl=this.gl;if(!textures)throw Error('Bunker render needs its slot textures');for(const [unit,slot] of [[0,'sand'],[2,'rough'],[3,'firstCut'],[5,'soil']]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,textures[slot]);}}
 prepare(grid,options={}){
  const key=(options.roundness??.45)+':'+JSON.stringify(options.authoritativeRings?.map(r=>Array.from(r))??null)+':'+grid.vertices.map(r=>r.join('')).join('|');if(key!==this.gridKey){
   const pad=8,padded={width:grid.width+pad*2,height:grid.height+pad*2,vertices:Array.from({length:grid.height+pad*2+1},()=>Array(grid.width+pad*2+1).fill(0))};
   for(let y=0;y<=grid.height;y++)for(let x=0;x<=grid.width;x++)padded.vertices[y+pad][x+pad]=grid.vertices[y][x];
   padded.caseAt=(x,y)=>{if(x>=pad&&y>=pad&&x<grid.width+pad&&y<grid.height+pad)return grid.caseAt(x-pad,y-pad);const v=padded.vertices,mask=v[y][x]+2*v[y][x+1]+4*v[y+1][x+1]+8*v[y+1][x];return {mask,variant:'sand'};};
   const origin=options.textureOriginTiles??{x:0,y:0};
   const contours=options.authoritativeRings?.map(ring=>{const path=[];for(let i=0;i<ring.length;i+=2)path.push([ring[i]-origin.x+pad,ring[i+1]-origin.y+pad]);if(path.length&&!(path[0][0]===path.at(-1)[0]&&path[0][1]===path.at(-1)[1]))path.push([...path[0]]);return path;});
   const field=buildTerrain(padded,512,{roundness:options.roundness??.45,contours}),sample=field.sample;this.terrain={...field,contours:field.contours.map(path=>path.map(([x,y])=>[x-pad,y-pad])),sample:(x,y)=>sample(x+pad,y+pad)};this.mesh=null;
   this.gridKey=key;const t=this.terrain,gl=this.gl;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.fieldTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,t.texWidth,t.texHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,t.data);}
  return this.terrain;
 }
 drawGrass(depth,scale,origin,options){
  const P=options.projection??{halfWidth:256,halfHeight:148,verticalPixelsPerMetre:147.8};const t=this.terrain,gl=this.gl,data=[],width=this.canvas.width,height=this.canvas.height;
  const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  const emit=(x,y,z,color)=>{data.push((origin.x+(x-y)*P.halfWidth*scale)/(width/2)-1,1-(origin.y+(x+y)*P.halfHeight*scale-z*P.verticalPixelsPerMetre*scale)/(height/2),-(2*(x+y)+z)*(options.depthScale??.01)-.000005,...color);};
  for(const path of t.contours)for(let s=0;s<path.length-1;s++){
   const a=path[s],b=path[s+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(length/.014));
   for(let k=0;k<count;k++){
    const q=(k+.5)/count,x=a[0]+(b[0]-a[0])*q,y=a[1]+(b[1]-a[1])*q,seed=x*31.7+y*83.1;
    let nx=t.sample(x+.012,y)-t.sample(x-.012,y),ny=t.sample(x,y+.012)-t.sample(x,y-.012),norm=Math.hypot(nx,ny);if(norm<1e-7)continue;nx/=norm;ny/=norm;
    const tx=-ny,ty=nx,bladeLength=.040+.085*hash(seed),bend=(hash(seed+2)-.5)*.038,bladeWidth=.004+.008*hash(seed+3),arch=.02+.04*hash(seed+4),warm=hash(seed+5),baseHeight=surfaceHeight(-.022,depth,options);
    const points=[];
    for(let j=0;j<=4;j++){const r=j/4,px=x+nx*(bladeLength*r-.022)+tx*bend*r*r,py=y+ny*(bladeLength*r-.022)+ty*bend*r*r,z=baseHeight+arch*Math.sin(Math.PI*r)-(.045+.10*hash(seed+6))*r*r+.006,half=bladeWidth*(1-r)*.5;
     const color=[(.30+.16*warm)*(1+.30*r),(.35+.14*warm)*(1+.22*r),.045+.065*warm+.025*r];points.push({left:[px-tx*half,py-ty*half,z],right:[px+tx*half,py+ty*half,z],color});}
    for(let j=0;j<4;j++){const p=points[j],n=points[j+1];emit(...p.left,p.color);emit(...p.right,p.color);emit(...n.right,n.color);emit(...p.left,p.color);emit(...n.right,n.color);emit(...n.left,n.color);}
   }
  }
  if(data.length){gl.useProgram(this.bladeProgram);gl.uniform1i(this.bladeSemantic,options.semanticPass?1:0);gl.bindVertexArray(this.bladeVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.bladeBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/6);}
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);
 }
 buildMesh(){
  if(this.mesh)return this.mesh;
  const t=this.terrain,NX=384,NY=Math.round(NX*t.height/t.width),points=Array.from({length:NY+1},()=>Array(NX+1)),data=[];
  for(let y=0;y<=NY;y++)for(let x=0;x<=NX;x++){const px=x/NX*t.width-8,py=y/NY*t.height-8;points[y][x]={x:px,y:py,d:t.sample(px,py)};}
  const push=(p,side)=>data.push(p.x,p.y,p.d,side);
  const clip=(poly,side)=>{const out=[];let previous=poly[poly.length-1],previousIn=side?previous.d>=0:previous.d<=0;for(const current of poly){const inside=side?current.d>=0:current.d<=0;if(inside!==previousIn){const q=previous.d/(previous.d-current.d);out.push({x:previous.x+(current.x-previous.x)*q,y:previous.y+(current.y-previous.y)*q,d:0});}if(inside)out.push(current);previous=current;previousIn=inside;}return out;};
  const tri=(a,b,c)=>{const poly=[a,b,c];if(poly.every(p=>p.d>=0)){poly.forEach(p=>push(p,1));return;}if(poly.every(p=>p.d<=0)){poly.forEach(p=>push(p,0));return;}for(const side of [0,1]){const clipped=clip(poly,side);for(let k=1;k<clipped.length-1;k++){push(clipped[0],side);push(clipped[k],side);push(clipped[k+1],side);}}};
  for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){tri(points[y][x],points[y][x+1],points[y+1][x+1]);tri(points[y][x],points[y+1][x+1],points[y+1][x]);}
  this.mesh=new Float32Array(data);return this.mesh;
 }
 render(grid,depth,scale,origin,border=false,options={}){
  const P=options.projection??{halfWidth:256,halfHeight:148,verticalPixelsPerMetre:147.8};const width=options.width??1488,height=options.height??768;if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
  this.prepare(grid,options);
  const gl=this.gl,t=this.terrain,mesh=this.buildMesh(),v=new Float32Array(mesh.length/4*5),baseOptions={...options,wall:0},span=faceSpan(t.contours,options.face);options={...options,faceSpan:span};let i=0;
  for(let k=0;k<mesh.length;k+=4){const x=mesh[k],y=mesh[k+1],z=surfaceHeight(mesh[k+2],depth,baseOptions)-mesh[k+3]*(options.wall??.25)*faceK(span,x,y),px=origin.x+(x-y)*P.halfWidth*scale,py=origin.y+(x+y)*P.halfHeight*scale-z*P.verticalPixelsPerMetre*scale;v[i++]=px/(width/2)-1;v[i++]=1-py/(height/2);v[i++]=-(2*(x+y)+z)*(options.depthScale??.01);v[i++]=x;v[i++]=y;}
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,v,gl.STREAM_DRAW);gl.uniform2f(this.u.uWorldSize,t.width,t.height);gl.uniform2f(this.u.uMaterialOrigin,options.textureOriginTiles?.x??0,options.textureOriginTiles?.y??0);gl.uniform1f(this.u.uDepth,depth);gl.uniform1f(this.u.uCollar,options.collar??.65);gl.uniform1f(this.u.uFirstWidth,options.firstCut??.9);gl.uniform1f(this.u.uRim,options.rim??.16);gl.uniform1f(this.u.uSlope,options.slope??1.1);gl.uniform1f(this.u.uShadow,options.shadow??1.25);gl.uniform1f(this.u.uWall,options.wall??.25);gl.uniform2f(this.u.uFace,span?span.face[0]:0,span?span.face[1]:0);gl.uniform2f(this.u.uFaceSpan,span?span.c:0,span?span.r:1);gl.uniform1f(this.u.uTextureScale,options.textureScale??1);gl.uniform1f(this.u.uRoughScale,options.roughScale??1);gl.uniform1f(this.u.uFirstScale,options.firstScale??1);gl.uniform1f(this.u.uSandScale,options.sandScale??1);gl.uniform1f(this.u.uSandAngle,(options.sandAngle??0)*Math.PI/180);gl.uniform1f(this.u.uSandExposure,options.sandExposure??1);gl.uniform1f(this.u.uEarthScale,options.earthScale??1);gl.uniform1f(this.u.uSoilScale,options.soilScale??options.earthScale??1);this.bindTextures(options.textures);gl.uniform1i(this.u.uBorder,border?1:0);gl.uniform1i(this.u.uSemantic,options.semanticPass?1:0);gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,v.length/5);this.wallRenderer.draw({terrain:t,depth,scale,origin,options,width,height,heightAt:surfaceHeight});this.drawGrass(depth,scale,origin,options);return this.canvas;
 }
}

