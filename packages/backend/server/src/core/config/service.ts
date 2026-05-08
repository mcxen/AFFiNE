import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

import { ConfigFactory, EventBus, OnEvent } from '../../base';
import { Models } from '../../models';
import { ServerFeature } from './types';

declare global {
  interface Events {
    'config.init': {
      config: DeepReadonly<AppConfig>;
    };
    'config.changed': {
      updates: DeepPartial<AppConfig>;
    };
    'config.changed.broadcast': {
      updates: DeepPartial<AppConfig>;
    };
  }
}

@Injectable()
export class ServerService implements OnApplicationBootstrap {
  private _initialized: boolean | null = null;
  readonly #features = new Set<ServerFeature>();

  constructor(
    private readonly models: Models,
    private readonly configFactory: ConfigFactory,
    private readonly event: EventBus
  ) {}

  async onApplicationBootstrap() {
    await this.setup();
  }

  get features() {
    return Array.from(this.#features);
  }

  async initialized() {
    if (!this._initialized) {
      const userCount = await this.models.user.count();
      this._initialized = userCount > 0;
    }

    return this._initialized;
  }

  enableFeature(feature: ServerFeature) {
    this.#features.add(feature);
  }

  disableFeature(feature: ServerFeature) {
    this.#features.delete(feature);
  }

  getConfig() {
    return this.configFactory.clone();
  }

  validateConfig(updates: Array<{ module: string; key: string; value: any }>) {
    return this.configFactory.validate(updates);
  }

  async updateConfig(
    user: string,
    updates: Array<{ module: string; key: string; value: any }>
  ): Promise<DeepPartial<AppConfig>> {
    void user;
    void updates;
    return {};
  }

  @OnEvent('config.changed.broadcast')
  onConfigChangedBroadcast(event: Events['config.changed.broadcast']) {
    void event;
  }

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if ('flags' in event.updates) {
      this.onFlagsChanged();
    }
  }

  async revalidateConfig() {
    const overrides = await this.loadDbOverrides();
    this.configFactory.override(overrides);
    this.event.emit('config.changed', { updates: overrides });
  }

  private async setup() {
    const overrides = await this.loadDbOverrides();
    this.configFactory.override(overrides);
    await this.event.emitAsync('config.init', {
      config: this.configFactory.config,
    });
    this.onFlagsChanged();
  }

  private async loadDbOverrides() {
    return {};
  }

  private onFlagsChanged() {
    const flags = this.configFactory.config.flags;
    if (flags.allowGuestDemoWorkspace) {
      this.enableFeature(ServerFeature.LocalWorkspace);
    } else {
      this.disableFeature(ServerFeature.LocalWorkspace);
    }
  }
}
