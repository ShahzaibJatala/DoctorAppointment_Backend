import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  IsOptional,
  IsEmail,
} from 'class-validator';

export class CreateDoctorDto {
  // @IsString()
  // @IsNotEmpty()
  // userId!: string; // From UserAuth

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail() // 👈 Built-in email validation
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsArray()
  @IsString({ each: true }) // Ensures every item in the array is a string
  @IsOptional()
  language?: string[];

  @IsString()
  @IsNotEmpty()
  specialization!: string;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  experienceYears!: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  LicenseNumber?: number;

  @IsString()
  @IsOptional()
  medicalBoard?: string;

  @IsString()
  @IsOptional()
  Bio?: string;

  @IsString()
  @IsOptional()
  clinicName?: string;

  @IsString()
  @IsOptional()
  clinicAddress?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  province?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  consultationFee?: number;

  // Note: Profile Picture and Document URLs are usually handled directly in the service
  // during the file upload process, so they are often excluded from the creation DTO.
}
