import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
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

  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true }) // Ensures every item in the array is a string
  @IsNotEmpty()
  language!: string[];

  @IsString()
  @IsNotEmpty()
  specialization!: string;


  @IsArray()
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  @IsString({ each: true })
  @IsNotEmpty()
  services!: string[];
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  experienceYears!: number;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  LicenseNumber!: number;

  @IsString()
  @IsNotEmpty()
  medicalBoard!: string;

  @IsString()
  @IsNotEmpty()
  Bio!: string;

  @IsString()
  @IsNotEmpty()
  clinicName!: string;

  @IsString()
  @IsNotEmpty()
  clinicAddress!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  province!: string;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  consultationFee!: number;

  // Bank Account Details
  @IsNumber()
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  clinicLatitude!: number;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  clinicLongitude!: number;

  @IsNotEmpty()
  @Type(() => Number)
  videoConsultationFee!: number;

  @IsString()
  @IsNotEmpty()
  bankName!: string;

  @IsString()
  @IsNotEmpty()
  accountHolderName!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  // Note: Profile Picture and Document URLs are usually handled directly in the service
  // during the file upload process, so they are often excluded from the creation DTO.
}
