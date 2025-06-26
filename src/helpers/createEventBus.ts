type EventMap = Record<string, any[]>;

export function createEventBus<T extends EventMap = {}>() {
  const listeners = new Map<keyof T, ((...args: any[]) => void)[]>();

  return {
    add<K extends keyof T>(event: K, callback: (...args: T[K]) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)?.push(callback);
    },

    call<K extends keyof T>(event: K, ...args: T[K]) {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach((listener) => listener(...args));
      }
    },

    remove<K extends keyof T>(event: K, callback: (...args: T[K]) => void) {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        const index = eventListeners.indexOf(callback);
        if (index !== -1) {
          eventListeners.splice(index, 1);
        }
      }
    },
  };
}
