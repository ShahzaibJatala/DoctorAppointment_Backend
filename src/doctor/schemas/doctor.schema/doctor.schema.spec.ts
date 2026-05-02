import { DoctorSchema } from './doctor.schema';

describe('DoctorSchema', () => {
  it('should be defined', () => {
    expect(new DoctorSchema()).toBeDefined();
  });
});
