import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateCompounderDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;
}
