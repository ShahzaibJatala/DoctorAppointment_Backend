import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BookingDraftDocument = HydratedDocument<BookingDraft>;

@Schema()
export class BookingDraft {
  @Prop({ type: Types.ObjectId, required: true })
  patientUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  doctorId: Types.ObjectId;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: true })
  endTime: Date;

  @Prop({ required: true })
  appointmentType: string;

  @Prop({ default: 'platform' })
  videoConsultationMethod: string;

  @Prop({ required: true, trim: true })
  patientName: string;

  @Prop({ required: true, min: 1, max: 120 })
  patientAge: number;

  @Prop({ required: true, match: /^\d{11}$/ })
  patientPhone: string;

  @Prop({ required: true, trim: true })
  patientGender: string;

  @Prop({ type: Date, default: Date.now, expires: 86400 })
  createdAt: Date;
}

export const BookingDraftSchema = SchemaFactory.createForClass(BookingDraft);
