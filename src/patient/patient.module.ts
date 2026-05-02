import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Patient, PatientSchema } from './schemas/patient.schema';
import { Doctor, DoctorSchema } from 'src/doctor/schemas/doctor.schema/doctor.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Patient.name , schema: PatientSchema },{ name: Doctor.name , schema: DoctorSchema }]),
],
  providers: [PatientService],
  controllers: [PatientController],
  exports: [PatientService]
})
export class PatientModule {}
