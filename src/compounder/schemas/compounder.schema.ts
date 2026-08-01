import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: true })
class DoctorInvitation {
  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId!: Types.ObjectId;

  @Prop({ enum: ['pending', 'accepted', 'rejected'], default: 'pending' })
  status!: string;

  @Prop({ default: Date.now })
  invitedAt!: Date;
}

const DoctorInvitationSchema = SchemaFactory.createForClass(DoctorInvitation);

@Schema({ timestamps: true })
export class Compounder extends Document {
  @Prop({ type: Types.ObjectId, ref: 'UserAuth', required: true, unique: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Doctor' })
  doctorId?: Types.ObjectId; // Legacy single-doctor link

  @Prop({ type: [Types.ObjectId], ref: 'Doctor', default: [] })
  doctorIds!: Types.ObjectId[];

  @Prop({ type: [DoctorInvitationSchema], default: [] })
  invitations!: DoctorInvitation[];

  @Prop({ required: true })
  fullName!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ required: true })
  phoneNumber!: string;
}

export const CompounderSchema = SchemaFactory.createForClass(Compounder);
