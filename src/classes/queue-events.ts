import { delay } from 'bluebird';
import { QueueEventsOptions } from '../interfaces';
import { array2obj } from '../utils';
import { QueueBase } from './queue-base';

export class QueueEvents extends QueueBase {
  consuming: Promise<void>;

  constructor(name: string, opts?: QueueEventsOptions) {
    super(name, opts);

    this.opts = Object.assign(
      {
        blockingTimeout: 10000,
      },
      this.opts,
    );

    // tslint:disable: no-floating-promises
    this.consumeEvents().catch(err => this.emit('error'));
  }

  private async consumeEvents() {
    const client = await this.client;

    const opts: QueueEventsOptions = this.opts;

    const key = this.keys.events;
    let id = opts.lastEventId || '0-0';

    while (!this.closing) {
      try {
        const data = await client.xread(
          'BLOCK',
          opts.blockingTimeout,
          'STREAMS',
          key,
          id,
        );

        if (data) {
          const stream = data[0];
          const events = stream[1];

          for (let i = 0; i < events.length; i++) {
            id = events[i][0];
            const args = array2obj(events[i][1]);

            //
            // TODO: we may need to have a separate xtream for progress data
            // to avoid this hack.
            switch (args.event) {
              case 'progress':
                args.data = JSON.parse(args.data);
                break;
              case 'completed':
                args.returnvalue = JSON.parse(args.returnvalue);
                break;
            }

            this.emit(args.event, args, id);
            this.emit(`${args.event}:${args.jobId}`, args, id);
          }
        }
      } catch (err) {
        if (err.message !== 'Connection is closed.') {
          throw err;
        }
        await delay(5000);
      }
    }
  }

  async close() {
    return (this.closing = this.disconnect());
  }
}
