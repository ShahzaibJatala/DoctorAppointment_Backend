import { PatientsOfDoctorSchema } from './patients-of-doctor.schema';

describe('PatientsOfDoctorSchema', () => {
  it('should be defined', () => {
    expect(new PatientsOfDoctorSchema()).toBeDefined();
  });
});
