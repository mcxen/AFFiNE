import { makeTracker } from './auto';
import { type EventArgs, type Events } from './events';

// Telemetry disabled - all tracking functions are no-ops

export const track = makeTracker(() => {});

export function enableAutoTrack() {}
export function flushTelemetry() {}
export function setTelemetryContext() {}
export function setTelemetryTransport() {}

export const sentry = {
  captureException: () => {},
  captureMessage: () => {},
  setUser: () => {},
  setTag: () => {},
  setExtra: () => {},
  withScope: (fn: (scope: any) => void) => fn({ setTag() {}, setExtra() {} }),
};

export const tracker = {
  track: () => {},
  track_pageview: () => {},
  page: () => {},
  identify: () => {},
  reset: () => {},
};

export { type EventArgs, type Events };
export default track;
