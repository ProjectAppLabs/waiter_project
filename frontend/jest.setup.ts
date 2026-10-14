import React from 'react';
import { jest } from '@jest/globals';
import '@testing-library/jest-dom';
import '@testing-library/jest-dom/jest-globals';

// jsdom no trae ResizeObserver y la barra superior lo usa para deslizar su píldora.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

type NextImageProps = React.ComponentPropsWithoutRef<'img'> & { fill?: boolean };
type NextLinkProps = React.ComponentPropsWithoutRef<'a'>;

jest.mock('next/image', () => ({
  __esModule: true,
  default: function NextImage({ fill: _fill, ...rest }: NextImageProps) {
    return React.createElement('img', rest);
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: NextLinkProps) => React.createElement('a', { href, ...rest }, children),
}));

// Las pruebas de rutas del servidor (`@jest-environment node`) no tienen window.
if (typeof window !== 'undefined') Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// jsdom no implementa el diálogo nativo y los menús de las consolas lo abren y cierran al montar. Estos dobles solo
// despachan su contrato de apertura y cierre, como las pruebas de r2; el foco atrapado se comprueba en Chromium.
if (typeof window !== 'undefined' && typeof HTMLDialogElement !== 'undefined') {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      if (!this.open) return
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  }
}

// Espera de waitFor/findBy: 1 s por omisión fallaba con la máquina cargada; 3 s sigue detectando lo que nunca llega.
import { configure } from '@testing-library/react'
configure({ asyncUtilTimeout: 3000 })
