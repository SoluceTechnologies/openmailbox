import path from 'path';
import * as TaskManager from 'expo-task-manager';

import { main } from '../../package.json';

jest.mock('expo-router/entry', () => ({}));

describe('app entry', () => {
  it('defines the new mail task before any screen loads, for launches without the UI', () => {
    jest.isolateModules(() => {
      require(path.resolve(__dirname, '../..', main));
    });
    expect(TaskManager.defineTask).toHaveBeenCalledWith('openmailbox-new-mail', expect.any(Function));
  });
});
