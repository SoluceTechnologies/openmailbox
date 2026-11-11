import * as TaskManager from 'expo-task-manager';

import { main } from '../../package.json';

jest.mock('expo-router/entry', () => ({}));

describe('app entry', () => {
  it('defines the new mail task before any screen loads, for launches without the UI', () => {
    expect(main).toBe('index.ts');
    jest.isolateModules(() => {
      require('../../index');
    });
    expect(TaskManager.defineTask).toHaveBeenCalledWith('openmailbox-new-mail', expect.any(Function));
  });
});
