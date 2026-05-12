const { Queue, Worker } = require('bullmq');
const { bullMQConnection } = require('./back/dist/lib/redis.js');

async function run() {
  const q = new Queue('test-q', { connection: bullMQConnection });
  await q.add('test-job', { foo: 'bar' }, { repeat: { every: 1000 }, jobId: 'my-custom-id' });
  const jobs = await q.getRepeatableJobs();
  console.log(jobs);
  process.exit(0);
}
run();
