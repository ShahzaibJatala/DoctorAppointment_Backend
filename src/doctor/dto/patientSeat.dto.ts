import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsString,
  IsIn,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class PatientSeatDto {
  @IsString()
  @IsNotEmpty()
  doctorId!: string;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  startTime: Date;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  endTime: Date;

  @IsString()
  @IsIn(['Clinic', 'Video', 'Online'])
  @IsNotEmpty()
  appointmentType: 'Clinic' | 'Video' | 'Online';

  @IsString()
  @IsOptional()
  @IsString()
  @IsIn(['platform', 'whatsapp'])
  @IsOptional()
  videoConsultationMethod?: 'platform' | 'whatsapp';

  patientName?: string;

  @Type(() => Number)
  @IsNumber()
  patientAge?: number;

  @IsString()
  @IsOptional()
  patientPhone?: string;

  @IsString()
  @IsOptional()
  patientGender?: string;

//   @IsString()
//   @IsNotEmpty()
//   reasonForVisit: string;

  @IsString()
  @IsIn(['card', 'cash', 'easypaisa', 'jazzcash', 'bank_transfer'])
  @IsNotEmpty()
  paymentMethod: 'card' | 'cash' | 'easypaisa' | 'jazzcash' | 'bank_transfer';

  @IsString()
  @IsOptional()
  mobileWalletNumber?: string;

  @IsString()
  @IsOptional()
  bankTransferReceiptUrl?: string;
}
