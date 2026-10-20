import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:message=>parentPort.postMessage(message)};
await import('../../src/simulation/worker.ts');
parentPort.on('message',data=>globalThis.self.onmessage({data}));
