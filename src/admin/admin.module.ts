import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UserAuth, UserSchema } from '../auth/user.schema';
import {
  Doctor,
  DoctorSchema,
} from '../doctor/schemas/doctor.schema/doctor.schema';
import { Patient, PatientSchema } from '../patient/schemas/patient.schema';
import {
  PatientsOfDoctor,
  PatientsOfDoctorSchema,
} from '../doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { ThrottlerModule } from '@nestjs/throttler';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserAuth.name, schema: UserSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: PatientsOfDoctor.name, schema: PatientsOfDoctorSchema },
    ]),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 5,
      },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
