import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ------------------------------------------------------
// 1. Sub-Schema: The Medical Report / Prescription File
// ------------------------------------------------------
@Schema({ timestamps: true })
export class MedicalRecord {
  @Prop({ required: true })
  doctorName!: string; // Name of the doctor who wrote this

  @Prop({ type: Types.ObjectId, ref: 'Doctor' })
  doctorId!: Types.ObjectId; // Link to the doctor's account

  @Prop({ required: true })
  appointmentDate!: Date;

  @Prop({ required: true })
  prescription!: string; // The text from your frontend text area

  @Prop()
  reasonForVisit!: string;

  @Prop({ enum: ['Upcomming', 'Completed', 'Cancelled'], default: 'Upcomming' })
  appointmentStatus?: string;
}
export const MedicalRecordSchema = SchemaFactory.createForClass(MedicalRecord);

// ------------------------------------------------------
// 2. Main Schema: The Patient Profile
// ------------------------------------------------------
@Schema({ timestamps: true })
export class Patient extends Document {
  // 🔗 Link to the UserAuth collection (email, password, role)
  @Prop({ type: Types.ObjectId, ref: 'UserAuth' })
  userId?: Types.ObjectId;

  // 👤 Basic Details
  @Prop()
  fullName?: string;

  @Prop()
  email?: string;

  @Prop()
  dateOfBirth?: Date; // (Frontend calculates 'age' from this)

  @Prop({ enum: ['Male', 'Female', 'Other'] })
  gender?: string;

  @Prop()
  phoneNumber?: string;

  @Prop()
  address?: string;

  // 🩸 Stable Medical Details
  @Prop()
  bloodGroup?: string;

  @Prop({ type: [String], default: [] })
  allergies?: string[];

  // 📁 The "File": Array of all reports written by doctors
  @Prop({ type: [MedicalRecordSchema], default: [] })
  medicalRecords?: MedicalRecord[];
}

export const PatientSchema = SchemaFactory.createForClass(Patient);
