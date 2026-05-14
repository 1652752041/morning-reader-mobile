if (!Promise.withResolvers) {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  };
}

if (!Map.prototype.getOrInsertComputed) {
  Object.defineProperty(Map.prototype, "getOrInsertComputed", {
    value(key, callback) {
      if (this.has(key)) return this.get(key);
      const value = callback(key);
      this.set(key, value);
      return value;
    },
    configurable: true,
    writable: true
  });
}

if (!Math.sumPrecise) {
  Math.sumPrecise = function sumPrecise(values) {
    let sum = 0;
    for (const value of values) sum += Number(value) || 0;
    return sum;
  };
}

if (typeof ReadableStream !== "undefined") {
  const readableStreamProto = ReadableStream.prototype;
  if (!readableStreamProto.values) {
    Object.defineProperty(readableStreamProto, "values", {
      async *value(options = {}) {
        const reader = this.getReader();
        let completed = false;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              completed = true;
              return;
            }
            yield value;
          }
        } finally {
          if (!completed && !options.preventCancel) {
            await reader.cancel().catch(() => {});
          }
          reader.releaseLock?.();
        }
      },
      configurable: true,
      writable: true
    });
  }
  if (!readableStreamProto[Symbol.asyncIterator]) {
    Object.defineProperty(readableStreamProto, Symbol.asyncIterator, {
      value: readableStreamProto.values,
      configurable: true,
      writable: true
    });
  }
}

const mapIteratorProto = Object.getPrototypeOf(Object.getPrototypeOf(new Map().values()));
if (!mapIteratorProto.some) {
  Object.defineProperty(mapIteratorProto, "some", {
    value(callback) {
      let index = 0;
      for (const item of this) {
        if (callback(item, index++)) return true;
      }
      return false;
    },
    configurable: true,
    writable: true
  });
}
if (!mapIteratorProto.find) {
  Object.defineProperty(mapIteratorProto, "find", {
    value(callback) {
      let index = 0;
      for (const item of this) {
        if (callback(item, index++)) return item;
      }
      return undefined;
    },
    configurable: true,
    writable: true
  });
}

await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/legacy/build/pdf.worker.mjs");
