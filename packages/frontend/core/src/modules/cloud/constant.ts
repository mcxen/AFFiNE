import { ServerDeploymentType, ServerFeature } from '@affine/graphql';

import type { ServerConfig, ServerMetadata } from './types';

export const BUILD_IN_SERVERS: (ServerMetadata & { config: ServerConfig })[] = [
  {
    id: 'affine-cloud',
    baseUrl: BUILD_CONFIG.isNative ? 'http://localhost:3010' : location.origin,
    config: {
      serverName: 'AFFiNE Selfhost',
      features: [
        ServerFeature.Indexer,
        ServerFeature.Copilot,
        ServerFeature.CopilotEmbedding,
        ServerFeature.LocalWorkspace,
      ],
      oauthProviders: [],
      type: ServerDeploymentType.Selfhosted,
      credentialsRequirement: {
        password: {
          minLength: 8,
          maxLength: 32,
        },
      },
    },
  },
];

export type TelemetryChannel =
  | 'stable'
  | 'beta'
  | 'internal'
  | 'canary'
  | 'local';

const OFFICIAL_TELEMETRY_ENDPOINTS: Record<TelemetryChannel, string> = {
  stable: '',
  beta: '',
  internal: '',
  canary: '',
  local: '',
};

export function getOfficialTelemetryEndpoint(
  channel = BUILD_CONFIG.appBuildType
): string {
  if (['beta', 'internal', 'canary', 'stable'].includes(channel)) {
    return OFFICIAL_TELEMETRY_ENDPOINTS[channel];
  }

  return OFFICIAL_TELEMETRY_ENDPOINTS.stable;
}
