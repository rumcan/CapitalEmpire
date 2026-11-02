/** Decode a supplied game-native example; it is not a substitute for another bunker outline. */
export async function loadPrebakedSprite(url,record,{expectedKey}={}){
 if(!record?.gameProjectionCompatible||record.referenceProjection||!record.worker)throw Error('Use a game-native baked record');
 const meta=record.worker;if(expectedKey&&meta.key!==expectedKey)throw Error('Prebaked image does not match the requested geometry/style key');
 const response=await fetch(url);if(!response.ok)throw Error('Bunker asset failed to load');
 const image=await createImageBitmap(await response.blob(),{premultiplyAlpha:'premultiply'});
 if(image.width!==record.width||image.height!==record.height){image.close();throw Error('Bunker image/metadata dimensions differ');}
 return {...meta,image,width:image.width,height:image.height};
}
export async function cloneBunkerForWorker(sprite){const image=await createImageBitmap(sprite.image,{premultiplyAlpha:'premultiply'});return {...sprite,image};}

