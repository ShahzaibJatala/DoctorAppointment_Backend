import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Patient, PatientSchema } from './schemas/patient.schema';
import {
  Doctor,
  DoctorSchema,
} from 'src/doctor/schemas/doctor.schema/doctor.schema';
import {
  PatientsOfDoctor,
  PatientsOfDoctorSchema,
} from 'src/doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { CloudinaryService } from 'src/doctor/cloudinary.service';
import { MulterModule } from '@nestjs/platform-express';
import { UserAuth, UserSchema } from 'src/auth/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: PatientsOfDoctor.name, schema: PatientsOfDoctorSchema },
      { name: UserAuth.name, schema: UserSchema },
    ]),
    MulterModule.register({
      dest: './uploads',
    }),
  ],
  providers: [PatientService, CloudinaryService],
  controllers: [PatientController],
  exports: [PatientService],
})
export class PatientModule {}
