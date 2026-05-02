import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class UserAuth extends Document {
  @Prop()
  name!: string;
  @Prop()
  age!: number;
  @Prop({ required: true, unique: true })
  email!: string;
  @Prop()
  password!: string;
  @Prop({
    required: true,
    type: String,
    enum: ['patient', 'doctor', 'admin'],
    default: 'patient',
  })
  role!: string;

  @Prop()
  resetOtp!: String;
  
  @Prop({type: Date}) 
  otpExpires?: Date;
  
  @Prop({type: Boolean, default: false})
  isOtpVerified!: boolean;
    
}

export const UserSchema = SchemaFactory.createForClass(UserAuth);
