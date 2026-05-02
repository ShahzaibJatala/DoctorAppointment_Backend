import { describe, it } from 'node:test';
import { RoleGuard } from './role.guard';

describe('RoleGuard', () => {
  it('should be defined', () => {
    expect(new RoleGuard()).toBeDefined();
  });
});
