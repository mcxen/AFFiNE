export { nbstoreHandlers } from './handlers';
export {
  emitExternalDocUpdate,
  getDocStoragePool,
  onExternalDocUpdate,
} from './handlers';
export { dbEvents as dbEventsV1, dbHandlers as dbHandlersV1 } from './v1';
export { universalId } from '@affine/nbstore';

import type { MainEventRegister } from '../type';
import { onExternalDocUpdate } from './handlers';

export const nbstoreEvents = {
  onExternalDocUpdate: ((
    cb: (universalId: string, docId: string, update: Uint8Array) => void
  ) => {
    return onExternalDocUpdate((universalId, docId, update) => {
      cb(universalId, docId, update);
    });
  }) as MainEventRegister,
};
