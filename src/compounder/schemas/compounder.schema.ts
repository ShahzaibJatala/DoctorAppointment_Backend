import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Compounder extends Document {
  @Prop({ type: Types.ObjectId, ref: 'UserAuth', required: true, unique: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId!: Types.ObjectId; // The doctor this compounder works for

  @Prop({ required: true })
  fullName!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ required: true })
  phoneNumber!: string;
}

export const CompounderSchema = SchemaFactory.createForClass(Compounder);
