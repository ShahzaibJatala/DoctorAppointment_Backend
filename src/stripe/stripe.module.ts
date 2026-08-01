import { Module } from '@nestjs/common';
import { StripeController } from './stripe.controller';
import { PatientModule } from '../patient/patient.module';
import { DoctorModule } from '../doctor/doctor.module';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingDraft, BookingDraftSchema } from './schemas/booking-draft.schema';

@Module({
  imports: [
    PatientModule,
    DoctorModule,
    MongooseModule.forFeature([
      { name: BookingDraft.name, schema: BookingDraftSchema },
    ]),
  ],
  controllers: [StripeController]
})
export class StripeModule {}
