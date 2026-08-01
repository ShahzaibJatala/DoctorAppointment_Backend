import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: true })
class Appointment {
  @Prop({ required: true, type: Types.ObjectId })
  patientId!: Types.ObjectId;

  @Prop({ required: true })
  startTime!: Date;

  @Prop({ required: true })
  endTime!: Date;

  @Prop({ required: true, enum: ['Clinic', 'Video', 'Online'], default: 'Clinic' })
  appointmentType!: string;

  @Prop({ required: true, enum: ['card', 'cash', 'easypaisa', 'jazzcash', 'bank_transfer'], default: 'cash' })
  paymentMethod!: string;

  @Prop({ enum: ['platform', 'whatsapp'], default: 'platform' })
  videoConsultationMethod?: string;

  @Prop({ enum: ['scheduled', 'ringing', 'active', 'paused', 'completed'], default: 'scheduled' })
  videoCallStatus?: string;

  @Prop()
  videoStartedAt?: Date;

  @Prop()
  videoEndedAt?: Date;

  @Prop()
  videoRecordingUrl?: string;

  @Prop()
  videoPausedBy?: string;

  @Prop()
  videoCallEndsAt?: Date;

  @Prop()
  videoRemainingMs?: number;

  @Prop()
  videoRingingAt?: Date;

  @Prop({ required: true })
  patientName!: string;

  @Prop({ required: true })
  patientAge!: number;

  @Prop({ required: true })
  patientPhone!: string;

  @Prop({ required: true })
  patientGender!: string;

  @Prop({ default: 'pending', enum: ['pending', 'confirmed', 'cancelled', 'checked-in', 'in-progress'] })
  status!: string;

  @Prop()
  tokenNumber?: number;

  @Prop()
  mobileWalletNumber?: string;

  @Prop()
  bankTransferReceiptUrl?: string;
}

const AppointmentSchema = SchemaFactory.createForClass(Appointment);

@Schema({ timestamps: true })
export class PatientsOfDoctor extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true, unique: true })
  doctorId!: Types.ObjectId;

  @Prop({ type: [AppointmentSchema], default: [] })
  appointments!: Appointment[];
}

export const PatientsOfDoctorSchema = SchemaFactory.createForClass(PatientsOfDoctor);
