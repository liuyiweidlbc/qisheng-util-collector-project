/**
 * Heartbeat 命名任务列表：按优先级执行，首个返回 true 则停止本轮。
 * tasks: Array<{ name: string, run: () => Promise<boolean>|boolean }>
 */
export function createHeartbeatRunner(getTasks) {
  let inFlight = false;
  let tick = 0;

  async function runHeartbeatTask() {
    if (inFlight) return;
    inFlight = true;
    tick += 1;
    try {
      const tasks = typeof getTasks === 'function' ? getTasks(tick) : getTasks;
      for (let i = 0; i < tasks.length; i++) {
        try {
          if (await tasks[i].run()) return;
        } catch (e) {
          console.warn('[hty-inplay] heartbeat task', tasks[i].name, e);
        }
      }
    } finally {
      inFlight = false;
    }
  }

  return {
    runHeartbeatTask,
    getTick: function () {
      return tick;
    },
  };
}
