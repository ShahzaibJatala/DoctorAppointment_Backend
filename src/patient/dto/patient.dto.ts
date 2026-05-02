// create-patient.dto.ts
import {
  IsString,
  IsDateString,
  IsEnum,
  IsOptional,
  IsArray,
} from 'class-validator';

export class CreatePatientDto {
  @IsString()
  fullName!: string;

  @IsDateString()
  dateOfBirth!: string; // From frontend

  @IsEnum(['Male', 'Female', 'Other'])
  gender!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsArray()
  allergies?: string[];
}

export class AddMedicalRecordDto {
  @IsDateString()
  appointmentDate!: string;

  @IsString()
  prescription!: string; // The text from the doctor's textarea

  @IsOptional()
  @IsString()
  reasonForVisit?: string;

  @IsOptional()
  @IsEnum(['Upcomming', 'Completed', 'Cancelled'])
  appointmentStatus?: string;
}
