import { ActivationService } from './activation.service.js';

export function startActivationDispatcher(service = new ActivationService()) {
  let pending: Promise<void> | undefined;
  const tick = () => {
    if (pending) return;
    pending = service.dispatchPending()
      .catch(() => { console.error('Tenant activation delivery queue is temporarily unavailable.'); })
      .finally(() => { pending = undefined; });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => { clearInterval(timer); await pending; };
}
