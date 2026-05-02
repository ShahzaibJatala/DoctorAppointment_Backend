import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsString,
  IsIn,
  IsOptional,
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
  @IsIn(['Clinic', 'Online'])
  @IsNotEmpty()
  appointmentType: 'Clinic' | 'Online';

//   @IsString()
//   @IsNotEmpty()
//   reasonForVisit: string;

  @IsString()
  @IsIn(['card', 'cash'])
  @IsNotEmpty()
  paymentMethod: 'card' | 'cash';
}
