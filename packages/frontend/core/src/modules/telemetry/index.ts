import { type Framework } from '@toeverything/infra';

import { TelemetryService } from './services/telemetry';

export function configureTelemetryModule(framework: Framework) {
  framework.service(TelemetryService);
}
