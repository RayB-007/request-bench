import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {percentile,runBenchmark} from '../benchmark.mjs';

async function server(t,handler) {
  const srv=createServer(handler);srv.listen(0,'127.0.0.1');await once(srv,'listening');
  t.after(()=>{srv.closeAllConnections();srv.close();});
  return `http://127.0.0.1:${srv.address().port}`;
}

test('percentiles interpolate without changing input order',()=>{
  const values=[30,0,20,10];assert.equal(percentile(values,.5),15);
  assert.ok(Math.abs(percentile(values,.95)-28.5)<1e-10);
  assert.deepEqual(values,[30,0,20,10]);assert.throws(()=>percentile([], .5));
});

test('requests respect concurrency and consume a complete response',async t=>{
  let active=0,maxActive=0;
  const url=await server(t,(_req,res)=>{active++;maxActive=Math.max(maxActive,active);setTimeout(()=>{active--;res.end('ok');},15);});
  const result=await runBenchmark(url,{requests:12,concurrency:3});
  assert.equal(result.successes,12);assert.equal(result.failures,0);
  assert.ok(maxActive<=3 && maxActive>1);assert.equal(result.status_codes['200'],12);
  assert.equal(new Set(result.samples.map(s=>s.index)).size,12);
  assert.ok(result.latency_ms.p99>=result.latency_ms.p50);
});

test('HTTP failures are separate from transport failures',async t=>{
  const url=await server(t,(_req,res)=>{res.statusCode=503;res.end('unavailable');});
  const result=await runBenchmark(url,{requests:3,concurrency:2});
  assert.equal(result.failures,3);assert.equal(result.status_codes['503'],3);
  assert.ok(result.samples.every(s=>s.error==='HTTP 503'));
});

test('deadline covers response body, not just headers',async t=>{
  const url=await server(t,(_req,res)=>{res.writeHead(200);res.flushHeaders();setTimeout(()=>res.end('late body'),150);});
  const result=await runBenchmark(url,{requests:1,concurrency:1,timeoutMs:30});
  assert.equal(result.failures,1);assert.equal(result.samples[0].error,'timeout');
});

test('rejects invalid options and remote targets in default mode',async()=>{
  for(const options of [{requests:0},{requests:1.5},{concurrency:0},{timeoutMs:0}]) {
    await assert.rejects(runBenchmark('http://127.0.0.1:1',options));
  }
  await assert.rejects(runBenchmark('https://example.com'));
  await assert.rejects(runBenchmark('file:///etc/passwd'));
  await assert.rejects(runBenchmark('http://name:password@localhost'));
});
