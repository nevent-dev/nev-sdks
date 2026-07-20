import { useSyncExternalStore } from 'preact/compat'
import type { MessageStore, StoreState } from '../store/message-store'

export function useStoreState(store: MessageStore): StoreState {
  return useSyncExternalStore(store.subscribe, store.getState)
}
