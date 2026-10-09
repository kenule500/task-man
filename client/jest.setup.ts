import '@testing-library/jest-dom';

// jsdom does not implement PointerEvent, which Base UI primitives dispatch.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

// react-router needs TextEncoder/TextDecoder, which jsdom does not provide.
import { TextDecoder, TextEncoder } from 'node:util';

if (typeof globalThis.TextEncoder === 'undefined') {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}
