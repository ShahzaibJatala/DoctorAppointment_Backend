import { Module } from '@nestjs/common';
import { StripeController } from './stripe.controller';
import { PatientModule } from '../patient/patient.module';
import { DoctorModule } from '../doctor/doctor.module';

@Module({
  imports: [PatientModule, DoctorModule],
  controllers: [StripeController]
})
export class StripeModule {}
