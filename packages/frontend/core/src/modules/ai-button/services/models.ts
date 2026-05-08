import { getPromptModelsQuery } from '@affine/graphql';
import {
  createSignalFromObservable,
  type Signal,
} from '@blocksuite/affine/shared/utils';
import { signal } from '@preact/signals-core';
import { LiveData, Service } from '@toeverything/infra';

import type { GraphQLService } from '../../cloud';
import type { GlobalStateService } from '../../storage';

const AI_MODEL_ID_KEY = 'AIModelId';
export const AI_CUSTOM_MODEL_ID_KEY = 'AICustomModelId';

export interface AIModel {
  name: string;
  id: string;
  version: string;
  category: string;
  isPro: boolean;
  isDefault: boolean;
}

export class AIModelService extends Service {
  modelId: Signal<string | undefined>;

  models: Signal<AIModel[]> = signal([]);

  private readonly modelId$ = LiveData.from(
    this.globalStateService.globalState.watch<string>(AI_MODEL_ID_KEY),
    undefined
  );

  private readonly customModelId$ = LiveData.from(
    this.globalStateService.globalState.watch<string>(AI_CUSTOM_MODEL_ID_KEY),
    undefined
  );

  constructor(
    private readonly globalStateService: GlobalStateService,
    private readonly gqlService: GraphQLService
  ) {
    super();

    const { signal: modelId, cleanup } = createSignalFromObservable<
      string | undefined
    >(this.modelId$, undefined);
    this.modelId = modelId;
    this.disposables.push(cleanup);

    const customModelSub = this.customModelId$.subscribe(customModelId => {
      this.applyCustomModel(customModelId);
    });
    this.disposables.push(() => customModelSub.unsubscribe());

    this.init().catch(err => {
      console.error(err);
    });
  }

  resetModel = () => {
    this.globalStateService.globalState.set(AI_MODEL_ID_KEY, '');
  };

  setModel = (modelId: string) => {
    const model = this.models.value.find(model => model.id === modelId);
    if (!model && modelId === this.getCustomModelId()) {
      this.globalStateService.globalState.set(AI_MODEL_ID_KEY, modelId);
      return;
    }
    this.globalStateService.globalState.set(AI_MODEL_ID_KEY, modelId);
  };

  setCustomModel = (modelId: string | undefined) => {
    const previous = this.getCustomModelId();
    const normalized = modelId?.trim() || undefined;
    if (normalized) {
      this.globalStateService.globalState.set(
        AI_CUSTOM_MODEL_ID_KEY,
        normalized
      );
      this.globalStateService.globalState.set(AI_MODEL_ID_KEY, normalized);
    } else {
      this.globalStateService.globalState.del(AI_CUSTOM_MODEL_ID_KEY);
      this.applyCustomModel(undefined);
      if (this.modelId.value === previous) {
        this.resetModel();
      }
    }
  };

  private getCustomModelId() {
    return this.globalStateService.globalState.get<string>(
      AI_CUSTOM_MODEL_ID_KEY
    );
  }

  private readonly applyCustomModel = (modelId?: string) => {
    const normalized = modelId?.trim();
    const withoutPreviousCustom = this.models.value.filter(
      model => model.category !== 'Custom'
    );
    if (!normalized) {
      this.models.value = withoutPreviousCustom;
      return;
    }
    if (withoutPreviousCustom.some(model => model.id === normalized)) {
      this.models.value = withoutPreviousCustom;
      return;
    }
    this.models.value = [
      {
        name: normalized,
        id: normalized,
        version: normalized,
        category: 'Custom',
        isPro: false,
        isDefault: false,
      },
      ...withoutPreviousCustom,
    ];
  };

  private readonly init = async () => {
    await this.initModels();
  };

  private readonly initModels = async (prompt?: string) => {
    const promptName = prompt || 'Chat With AFFiNE AI';
    const models = await this.getModelsByPrompt(promptName);
    if (models) {
      const { defaultModel, optionalModels, proModels } = models;
      this.models.value = optionalModels.map(model => {
        const [category] = model.name.split(' ');
        const version = model.name.slice(category.length + 1);
        return {
          name: model.name,
          id: model.id,
          version,
          category,
          isPro: proModels.some(proModel => proModel.id === model.id),
          isDefault: model.id === defaultModel,
        };
      });
      this.applyCustomModel(this.getCustomModelId());
    }
  };

  private readonly getModelsByPrompt = async (promptName: string) => {
    return this.gqlService
      .gql({
        query: getPromptModelsQuery,
        variables: { promptName },
      })
      .then(res => res.currentUser?.copilot?.models);
  };
}
