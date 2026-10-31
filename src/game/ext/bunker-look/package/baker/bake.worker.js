import {BunkerBaker} from './bake.js';
let baker;let chain=Promise.resolve();self.onmessage=({data})=>{if(data.type==='dispose'){chain=chain.then(()=>{baker?.dispose();self.close();});return;}if(data.type!=='bake')return;chain=chain.then(async()=>{try{baker??=new BunkerBaker(data.options);const sprite=await baker.bake(data.request);self.postMessage({id:data.id,sprite},[sprite.image]);}catch(error){self.postMessage({id:data.id,error:error?.message??String(error)});}});};

