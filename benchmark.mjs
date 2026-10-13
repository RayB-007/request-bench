#!/usr/bin/env node
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function percentile(values, fraction) {
  if (!values.length || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error('Invalid percentile input');
  const ordered = [...values].sort((a,b) => a-b);
  const index = fraction * (ordered.length - 1);
  const low = Math.floor(index), high = Math.ceil(index);
  return ordered[low] + (ordered[high]-ordered[low]) * (index-low);
}

export async function runBenchmark(target, {requests=30, concurrency=4, timeoutMs=2000, allowRemote=false} = {}) {
  const url = new URL(target);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) URL without embedded credentials');
  if (!allowRemote && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Default mode requires a loopback URL; use --allow-remote for a remote target');
  if (!Number.isInteger(requests) || requests < 1 || requests > 10000) throw new Error('Requests must be an integer from 1 to 10000');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new Error('Concurrency must be an integer from 1 to 64');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) throw new Error('Timeout must be between 0 and 60000 ms');
  const samples = [];
  let next = 0;
  const started = performance.now();
  async function worker() {
    while (next < requests) {
      const index = next++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const begin = performance.now();
      const sample = {index, ok:false, status:null, error:null};
      try {
        const response = await fetch(url, {signal:controller.signal,redirect:'error'});
        // Consume the body so latency includes the complete response, not only headers.
        await response.arrayBuffer();
        sample.status = response.status;
        sample.ok = response.ok;
        if (!response.ok) sample.error = `HTTP ${response.status}`;
      } catch (error) {
        sample.error = controller.signal.aborted ? 'timeout' : error.message;
      } finally {
        clearTimeout(timer);
        sample.latency_ms = performance.now()-begin;
        samples.push(sample);
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,requests)},worker));
  const elapsed = performance.now()-started;
  const latencies = samples.map(s => s.latency_ms);
  const codes = {};
  samples.forEach(s => { const key = s.status === null ? 'transport_error' : String(s.status); codes[key]=(codes[key]||0)+1; });
  return {
    target:url.href, requests, concurrency, timeout_ms:timeoutMs,
    successes:samples.filter(s=>s.ok).length, failures:samples.filter(s=>!s.ok).length,
    elapsed_ms:elapsed, requests_per_second:requests/(elapsed/1000),
    latency_ms:{min:Math.min(...latencies),p50:percentile(latencies,.5),p95:percentile(latencies,.95),p99:percentile(latencies,.99),max:Math.max(...latencies)},
    status_codes:codes, samples:samples.sort((a,b)=>a.index-b.index),
  };
}

function parse(argv) {
  const args = {requests:30,concurrency:4,timeoutMs:2000,allowRemote:false,json:false};
  const numbers = {'--requests':'requests','--concurrency':'concurrency','--timeout-ms':'timeoutMs'};
  for(let i=0;i<argv.length;i++) {
    const flag=argv[i];
    if(flag==='--url') args.target=argv[++i];
    else if(flag in numbers) args[numbers[flag]]=Number(argv[++i]);
    else if(flag==='--allow-remote') args.allowRemote=true;
    else if(flag==='--json') args.json=true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if(!args.target) throw new Error('--url is required');
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('node benchmark.mjs --url http://127.0.0.1:8080 --requests 30 --concurrency 4 --timeout-ms 2000 [--json] [--allow-remote]');
  } else {
    try {
      const args=parse(process.argv.slice(2));
      const result=await runBenchmark(args.target,args);
      if(args.json) console.log(JSON.stringify(result,null,2));
      else {
        console.log(`${result.requests} requests · ${result.successes} succeeded · ${result.failures} failed`);
        console.log(`p50 ${result.latency_ms.p50.toFixed(2)} ms · p95 ${result.latency_ms.p95.toFixed(2)} ms · p99 ${result.latency_ms.p99.toFixed(2)} ms`);
        console.log(`${result.requests_per_second.toFixed(2)} requests/s · ${result.elapsed_ms.toFixed(2)} ms elapsed`);
      }
      process.exitCode=result.failures ? 1 : 0;
    } catch(error) { console.error(error.message);process.exitCode=2; }
  }
}
