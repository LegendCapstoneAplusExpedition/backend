const mediasoup = require('mediasoup');
const config = require('../config');

const workers = [];
let nextWorkerIndex = 0;

const createWorkers = async () => {
  const { numWorkers } = config.mediasoup;
  console.info(`[mediasoup] Creating ${numWorkers} workers...`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.workerSettings.logLevel,
      logTags: config.mediasoup.workerSettings.logTags,
      rtcMinPort: config.mediasoup.workerSettings.rtcMinPort,
      rtcMaxPort: config.mediasoup.workerSettings.rtcMaxPort,
    });

    worker.on('died', () => {
      console.error(`[mediasoup] Worker died, exiting in 2 seconds... [pid:${worker.pid}]`);
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);
  }
};

const getWorker = () => {
  const worker = workers[nextWorkerIndex];
  if (++nextWorkerIndex === workers.length) {
    nextWorkerIndex = 0;
  }
  return worker;
};

const createRouter = async () => {
  const worker = getWorker();
  return await worker.createRouter(config.mediasoup.routerOptions);
};

module.exports = {
  createWorkers,
  getWorker,
  createRouter,
};
