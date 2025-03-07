import { Queue, QueueScheduler, Worker, QueueEvents } from '@src/classes';
import { delay } from 'bluebird';
import IORedis from 'ioredis';
import { after } from 'lodash';
import { beforeEach, describe, it } from 'mocha';
import { v4 } from 'uuid';
import * as sinon from 'sinon';

describe('stalled jobs', function() {
  let queue: Queue;
  let queueName: string;
  let client: IORedis.Redis;

  beforeEach(function() {
    client = new IORedis();
    return client.flushdb();
  });

  beforeEach(async function() {
    queueName = 'test-' + v4();
    queue = new Queue(queueName);
  });

  afterEach(async function() {
    await queue.close();
    return client.quit();
  });

  it('process stalled jobs when starting a queue', async function() {
    this.timeout(10000);

    const queueEvents = new QueueEvents(queueName);
    await queueEvents.waitUntilReady();

    const concurrency = 4;

    const worker = new Worker(
      queueName,
      async job => {
        return delay(10000);
      },
      {
        lockDuration: 1000,
        concurrency,
      },
    );

    const allActive = new Promise(resolve => {
      worker.on('active', after(concurrency, resolve));
    });

    await worker.waitUntilReady();

    const jobs = await Promise.all([
      queue.add('test', { bar: 'baz' }),
      queue.add('test', { bar1: 'baz1' }),
      queue.add('test', { bar2: 'baz2' }),
      queue.add('test', { bar3: 'baz3' }),
    ]);

    await allActive;

    const queueScheduler = new QueueScheduler(queueName, {
      stalledInterval: 100,
    });
    await queueScheduler.waitUntilReady();
    await worker.close(true);

    const allStalled = new Promise(resolve => {
      queueScheduler.on('stalled', after(concurrency, resolve));
    });

    const allStalledGlobalEvent = new Promise(resolve => {
      queueEvents.on('stalled', after(concurrency, resolve));
    });

    await allStalled;
    await allStalledGlobalEvent;

    const worker2 = new Worker(queueName, async job => {}, { concurrency });

    const allCompleted = new Promise(resolve => {
      worker2.on('completed', after(concurrency, resolve));
    });

    await allCompleted;

    await queueEvents.close();

    await queueScheduler.close();

    await worker2.close();
  });

  it('fail stalled jobs that stall more than allowable stalled limit', async function() {
    this.timeout(6000);

    const concurrency = 4;

    const worker = new Worker(
      queueName,
      async job => {
        return delay(10000);
      },
      {
        lockDuration: 1000,
        concurrency,
      },
    );

    const allActive = new Promise(resolve => {
      worker.on('active', after(concurrency, resolve));
    });

    await worker.waitUntilReady();

    const jobs = await Promise.all([
      queue.add('test', { bar: 'baz' }),
      queue.add('test', { bar1: 'baz1' }),
      queue.add('test', { bar2: 'baz2' }),
      queue.add('test', { bar3: 'baz3' }),
    ]);

    await allActive;

    const queueScheduler = new QueueScheduler(queueName, {
      stalledInterval: 100,
      maxStalledCount: 0,
    });
    await queueScheduler.waitUntilReady();

    await worker.close(true);

    const allFailed = new Promise(resolve => {
      queueScheduler.on('failed', after(concurrency, resolve));
    });

    await allFailed;

    await queueScheduler.close();
  });
});
