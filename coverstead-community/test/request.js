// Exercise the actual Express pipeline without opening a listening socket.
import {IncomingMessage,ServerResponse} from 'node:http';
import {Duplex} from 'node:stream';
export function request(app,url,{method='GET',body,cookie,origin='http://localhost:3100',headers={}}={}) {
  return new Promise((resolve,reject)=>{
    const chunks=[];
    const socket=new Duplex({read(){},write(chunk,_enc,callback){chunks.push(Buffer.from(chunk));callback();}});
    socket.remoteAddress='127.0.0.1';
    const req=new IncomingMessage(socket),res=new ServerResponse(req);
    req.url=url;req.method=method;req.headers={host:'localhost:3100',...headers};
    if(origin)req.headers.origin=origin;
    if(cookie)req.headers.cookie=cookie;
    const data=body===undefined?null:Buffer.from(JSON.stringify(body));
    if(data){req.headers['content-type']='application/json';req.headers['content-length']=String(data.length);}
    req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;
    res.assignSocket(socket);
    res.on('finish',()=>{const raw=Buffer.concat(chunks).toString(),text=raw.slice(raw.indexOf('\r\n\r\n')+4);let json;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.getHeaders(),text,json});});
    res.on('error',reject);app.handle(req,res);
    // A real HTTP parser marks the request complete before ending its stream.
    // Otherwise IncomingMessage can destroy the fake socket before async handlers reply.
    req.complete=true;if(data)req.push(data);req.push(null);
  });
}
