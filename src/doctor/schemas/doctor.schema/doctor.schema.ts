import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: true, timestamps: true })
class DoctorReview {
  @Prop({ type: Types.ObjectId, required: true })
  patientId!: Types.ObjectId;

  @Prop({ required: true })
  userName!: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating!: number;

  @Prop({ required: true })
  comment!: string;

  createdAt?: Date;
}

const DoctorReviewSchema = SchemaFactory.createForClass(DoctorReview);

// 🗓️ Sub-schema for Availability (Nested Object)
@Schema({ _id: false }) // No need for separate IDs for slots
class AvailabilitySlot {
  @Prop({ required: true, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] })
  day!: string;

  @Prop({ required: true }) // e.g., "09:00"
  startTime!: string;

  @Prop({ required: true }) // e.g., "17:00"
  endTime!: string;

  @Prop({ default: true })
  isAvailable!: boolean;
}
const AvailabilitySchema = SchemaFactory.createForClass(AvailabilitySlot);

// 🎓 Main Doctor Schema
@Schema({ timestamps: true })
export class Doctor extends Document {
  // 🔗 Link to UserAuth (Login Creds)
  @Prop({ type: Types.ObjectId, ref: 'UserAuth', required: true, unique: true })
  userId!: Types.ObjectId;

  // 👨‍⚕️ Professional Info
  @Prop({ required: true })
  fullName!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ required: true })
  phoneNumber!: string;

  @Prop()
  language!: string[];

  @Prop({ required: true }) // e.g. "Cardiologist", "General Physician"
  specialization!: string;

  @Prop({ type: [String], default: [] })
  services!: string[];

  @Prop({ required: true })
  experienceYears!: number;

  @Prop()
  LicenseNumber!: number;

  @Prop()
  medicalBoard!: string;

  @Prop()
  Bio!: string;

  // @Prop([String]) // e.g. ["MBBS", "MD - Cardiology"]
  // qualifications!: string[];

  // @Prop()
  // about!: string; // Short bio

  // 🏥 Clinic / Hospital Info
  @Prop()
  @Prop()
  @Prop()
  clinicLatitude!: number;

  @Prop()
  clinicLongitude!: number;

  videoConsultationFee!: number;

  clinicName!: string;

  @Prop()
  clinicAddress!: string;

  @Prop()
  city!: string;

  @Prop()
  province!: string;

  @Prop()
  consultationFee!: number;

  @Prop({ default: true })
  isVideoEnabled?: boolean;

  @Prop({ default: false })
  allowWhatsAppVideoConsultation?: boolean;

  // 📅 Availability (Array of Slots)
  @Prop({ type: [AvailabilitySchema], default: [] })
  availability!: AvailabilitySlot[];

  // // ⭐ Ratings & Reviews
  // @Prop({ default: 0 })
  // rating!: number;

  // @Prop({ default: 0 })
  // reviewCount!: number;
  @Prop({ type: [DoctorReviewSchema], default: [] })
  reviews!: DoctorReview[];

  // 🖼️ Profile Image
  @Prop()
  profilePictureUrl!: string;

  @Prop()
  documentFileUrl!: string; // For Cloudinary

  @Prop()
  bankName?: string;

  @Prop()
  accountHolderName?: string;

  @Prop()
  accountNumber?: string;

  @Prop({ default: false })
  isVerified?: boolean;
}

export const DoctorSchema = SchemaFactory.createForClass(Doctor);
