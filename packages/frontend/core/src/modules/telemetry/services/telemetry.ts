import { Service } from '@toeverything/infra';

// Telemetry disabled
export class TelemetryService extends Service {
  onApplicationStart() {}
  override dispose(): void {
    super.dispose();
  }
}
