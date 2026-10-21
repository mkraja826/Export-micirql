export class PayloadTooLargeError extends Error {
 constructor(){super('Request body exceeds configured size limit');this.name='PayloadTooLargeError'}
}
export async function readJsonLimited(request,maxBytes){
 const length=Number(request.headers.get('content-length'));
 if(Number.isFinite(length)&&length>maxBytes)throw new PayloadTooLargeError();
 if(!request.body)return JSON.parse('');
 const reader=request.body.getReader();
 const chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>maxBytes){await reader.cancel().catch(()=>{});throw new PayloadTooLargeError()}
   chunks.push(value);
  }
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
