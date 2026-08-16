export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type PollWaker = {
  wait: (ms: number) => Promise<void>;
  wake: () => void;
};

export const createPollWaker = (): PollWaker => {
  let pendingWake: (() => void) | null = null;
  let queuedWake = false;

  return {
    wait: (ms) => {
      if (queuedWake) {
        queuedWake = false;
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          pendingWake = null;
          resolve();
        };
        const timer = setTimeout(finish, ms);
        pendingWake = () => {
          clearTimeout(timer);
          finish();
        };
      });
    },
    wake: () => {
      if (pendingWake) {
        pendingWake();
        return;
      }
      queuedWake = true;
    },
  };
};
