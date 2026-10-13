import {createServer} from 'node:http';
const server=createServer((req,res)=>{
  if(req.url==='/fail'){res.writeHead(503);res.end('example failure');return;}
  setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}));},20);
});
server.listen(8080,'127.0.0.1',()=>console.log('Example server: http://127.0.0.1:8080'));
process.on('SIGINT',()=>server.close());
