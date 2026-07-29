import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompounderController } from './compounder.controller';
import { CompounderService } from './compounder.service';
import { Compounder, CompounderSchema } from './schemas/compounder.schema';
import { UserAuth, UserSchema } from '../auth/user.schema';
import { Doctor, DoctorSchema } from '../doctor/schemas/doctor.schema/doctor.schema';
import { PatientsOfDoctor, PatientsOfDoctorSchema } from '../doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { PatientModule } from '../patient/patient.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Compounder.name, schema: CompounderSchema },
      { name: UserAuth.name, schema: UserSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: PatientsOfDoctor.name, schema: PatientsOfDoctorSchema },
    ]),
    PatientModule,
  ],
  controllers: [CompounderController],
  providers: [CompounderService],
  exports: [CompounderService],
})
export class CompounderModule {}
