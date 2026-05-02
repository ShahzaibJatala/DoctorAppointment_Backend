import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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

  @Prop({required:true})
  email!:string;
  
  @Prop({required:true})
  phoneNumber!:string;

  @Prop()
  language!:string[];


  @Prop({ required: true }) // e.g. "Cardiologist", "General Physician"
  specialization!: string;

  @Prop({ required: true })
  experienceYears!: number;

  @Prop()
  LicenseNumber!:number;

  @Prop()
  medicalBoard!:string;

  @Prop()
  Bio!:string;

  // @Prop([String]) // e.g. ["MBBS", "MD - Cardiology"]
  // qualifications!: string[];


  // @Prop()
  // about!: string; // Short bio

  // 🏥 Clinic / Hospital Info
  @Prop()
  clinicName!: string;

  @Prop()
  clinicAddress!: string;

  @Prop()
  city!:string;

  @Prop()
  province!:string;

  @Prop()
  consultationFee!: number;

  // 📅 Availability (Array of Slots)
  @Prop({ type: [AvailabilitySchema], default: [] })
  availability!: AvailabilitySlot[];

  // // ⭐ Ratings & Reviews
  // @Prop({ default: 0 })
  // rating!: number;

  // @Prop({ default: 0 })
  // reviewCount!: number;

  // 🖼️ Profile Image
  @Prop()
  profilePictureUrl!: string;

  @Prop()
  documentFileUrl!: string; // For Cloudinary
}

export const DoctorSchema = SchemaFactory.createForClass(Doctor);