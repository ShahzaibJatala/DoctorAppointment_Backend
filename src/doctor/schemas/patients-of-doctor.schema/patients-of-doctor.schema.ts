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

  @Prop({ required: true, enum: ['Clinic', 'Online'], default: 'Clinic' })
  appointmentType!: string;

  @Prop({ required: true, enum: ['card', 'cash'], default: 'cash' })
  paymentMethod!: string;

  @Prop({ default: 'pending', enum: ['pending', 'confirmed', 'cancelled'] })
  status!: string;
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