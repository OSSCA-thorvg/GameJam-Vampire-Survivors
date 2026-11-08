import type { ClientMessage, ServerMessage } from '@vs/shared';
import type { NetState } from '../net/client';
import type { VersusNet } from './versusController';

/** A fake `NetClient` for the versus tests (#20): records sends, emits server messages and state changes by hand. */
export function fakeNet(state: NetState = 'open') {
  const sent: ClientMessage[] = [];
  const handlers = new Map<string, Set<(m: ServerMessage) => void>>();
  const stateHandlers = new Set<(s: NetState) => void>();
  const net = {
    state,
    send(message: ClientMessage) {
      if (net.state !== 'open') return false;
      sent.push(message);
      return true;
    },
    on(type: string, handler: (m: ServerMessage) => void) {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
    onState(handler: (s: NetState) => void) {
      stateHandlers.add(handler);
      return () => {
        stateHandlers.delete(handler);
      };
    },
  };
  return {
    net: net as unknown as VersusNet & { state: NetState },
    sent,
    emit(message: ServerMessage) {
      for (const h of [...(handlers.get(message.type) ?? [])]) h(message);
    },
    setState(next: NetState) {
      net.state = next;
      for (const h of [...stateHandlers]) h(next);
    },
    listeners: () => [...handlers.values()].reduce((n, s) => n + s.size, 0) + stateHandlers.size,
  };
}
