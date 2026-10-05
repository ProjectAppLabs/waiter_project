import { describe, it, expect } from '@jest/globals';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const e2eModules = require('../e2e-modules.cjs');
const e2eModule = require('../e2e-module.cjs');
const e2eModuleReport = require('../e2e-coverage-module.cjs');

const createDefinitionsFile = (data: unknown) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-modules-'));
  const filePath = path.join(tempDir, 'flow-definitions.json');
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');

  return {
    filePath,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
};

const createRawDefinitionsFile = (raw: string) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-modules-'));
  const filePath = path.join(tempDir, 'flow-definitions.json');
  fs.writeFileSync(filePath, raw, 'utf8');

  return {
    filePath,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
};

describe('e2e module list helpers', () => {
  // Falla si la lista de módulos sale desordenada, repetida o con espacios sobrantes en el nombre.
  it('loadModules returns sorted unique module list', () => {
    const { filePath, cleanup } = createDefinitionsFile({
      version: '1.0.0',
      lastUpdated: '2026-02-24',
      flows: {
        'auth-login': { module: 'auth' },
        'docs-create': { module: ' documents ' },
        'auth-logout': { module: 'auth' },
      },
    });

    try {
      expect(e2eModules.loadModules(filePath)).toEqual(['auth', 'documents']);
    } finally {
      cleanup();
    }
  });

  // Falla si un archivo de flujos sin flujos rompe el listado en vez de devolver una lista vacía.
  it('loadModules returns empty list when flows missing', () => {
    const { filePath, cleanup } = createDefinitionsFile({
      version: '1.0.0',
      lastUpdated: '2026-02-24',
      flows: {},
    });

    try {
      expect(e2eModules.loadModules(filePath)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  // Falla si un JSON de flujos dañado se acepta en silencio en vez de lanzar «Invalid JSON».
  it('loadModules throws for invalid JSON', () => {
    const { filePath, cleanup } = createRawDefinitionsFile('{ invalid');

    try {
      expect(() => e2eModules.loadModules(filePath)).toThrow('Invalid JSON');
    } finally {
      cleanup();
    }
  });

  // Falla si el listado no imprime cada módulo, una vez y en orden.
  it('printModules logs each module name', () => {
    const logger = {
      log: jest.fn(),
    };

    e2eModules.printModules(['auth', 'catalog'], logger);

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenNthCalledWith(1, 'auth');
    expect(logger.log).toHaveBeenNthCalledWith(2, 'catalog');
  });
});

describe('e2e module runner helpers', () => {
  // Falla si el nombre del módulo conserva la etiqueta «@module:» y el filtro no encuentra pruebas.
  it('normalizeModuleName strips module tag', () => {
    expect(e2eModule.normalizeModuleName('@module:auth')).toBe('auth');
  });

  // Falla si --module no se lee o si los demás argumentos no pasan intactos a Playwright.
  it('parseArgs reads module from --module flag', () => {
    expect(e2eModule.parseArgs(['--module', 'auth', '--project=Desktop Chrome'])).toEqual({
      moduleName: 'auth',
      extraArgs: ['--project=Desktop Chrome'],
    });
  });

  // Falla si correr sin módulo no avisa y termina corriendo toda la suite.
  it('resolveOptions throws when module missing', () => {
    expect(() => e2eModule.resolveOptions([])).toThrow('Module name is required.');
  });

  // Falla si un módulo conocido se rechaza o no se devuelve la lista de módulos disponibles.
  it('validateModuleName returns modules for known module', () => {
    const { filePath, cleanup } = createDefinitionsFile({
      version: '1.0.0',
      lastUpdated: '2026-02-24',
      flows: {
        'auth-login': { module: 'auth' },
        'docs-create': { module: 'documents' },
      },
    });

    try {
      expect(e2eModule.validateModuleName('auth', filePath)).toEqual(['auth', 'documents']);
    } finally {
      cleanup();
    }
  });

  // Falla si un módulo desconocido se acepta y la corrida no filtra nada.
  it('validateModuleName throws for unknown module', () => {
    const { filePath, cleanup } = createDefinitionsFile({
      version: '1.0.0',
      lastUpdated: '2026-02-24',
      flows: {
        'auth-login': { module: 'auth' },
      },
    });

    try {
      expect(() => e2eModule.validateModuleName('unknown', filePath)).toThrow(
        'Unknown module "unknown".'
      );
    } finally {
      cleanup();
    }
  });

  // Falla si la corrida por módulo no pasa --grep @module:<nombre> a «npm run e2e» con los demás argumentos.
  it('buildModuleArgs includes grep filter', () => {
    expect(e2eModule.buildModuleArgs('auth', ['--project=Desktop Chrome'])).toEqual([
      'run',
      'e2e',
      '--',
      '--grep',
      '@module:auth',
      '--project=Desktop Chrome',
    ]);
  });
});

describe('e2e module report helpers', () => {
  // Falla si el informe por módulo no usa «e2e:coverage» con el filtro --grep del módulo.
  it('buildCoverageArgs targets module report script', () => {
    expect(e2eModuleReport.buildCoverageArgs('auth', ['--project=Desktop Chrome'])).toEqual([
      'run',
      'e2e:coverage',
      '--',
      '--grep',
      '@module:auth',
      '--project=Desktop Chrome',
    ]);
  });

  // Falla si el informe de cobertura acepta un módulo desconocido.
  it('report validateModuleName throws for unknown module', () => {
    const { filePath, cleanup } = createDefinitionsFile({
      version: '1.0.0',
      lastUpdated: '2026-02-24',
      flows: {
        'auth-login': { module: 'auth' },
      },
    });

    try {
      expect(() => e2eModuleReport.validateModuleName('unknown', filePath)).toThrow(
        'Unknown module "unknown".'
      );
    } finally {
      cleanup();
    }
  });
});
