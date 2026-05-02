import { Module } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { DoctorController } from './doctor.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Doctor, DoctorSchema } from './schemas/doctor.schema/doctor.schema';
import { Patient, PatientSchema } from 'src/patient/schemas/patient.schema';
import { UserAuth, UserSchema } from 'src/auth/user.schema';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { ImageController } from './image.controller';
import { CloudinaryService } from './cloudinary.service';
import { MulterModule } from '@nestjs/platform-express';
import { PatientsOfDoctor, PatientsOfDoctorSchema } from './schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { PatientModule } from 'src/patient/patient.module';

@Module({
  imports: [PatientModule, MongooseModule.forFeature([{ name: Doctor.name, schema: DoctorSchema }, { name: Patient.name, schema: PatientSchema }, { name: UserAuth.name, schema: UserSchema }, {name:PatientsOfDoctor.name,schema:PatientsOfDoctorSchema}]),
  MulterModule.register({
    dest: './uploads'
  })],
  providers: [DoctorService, JwtStrategy, CloudinaryService],
  controllers: [DoctorController, ImageController],

})
export class DoctorModule { }
