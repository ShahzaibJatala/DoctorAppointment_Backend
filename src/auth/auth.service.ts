import {
  BadRequestException,
  Get,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { UserAuth } from './user.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import {
  ResetPasswordDto,
  SendOtpDto,
  UserDto,
  VerifyOtpDto,
} from './dto/user.dto';
import { UserInterface } from './interfaces/user.interface';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(UserAuth.name) private userModel: Model<UserAuth>,
    private JwtService: JwtService, private mailService:MailService
  ) {}

  async createUser(user: UserDto): Promise<UserInterface> {
    const hash = await bcrypt.hash(user.password, 10);
    user.password = hash;
    const newUser = new this.userModel(user);
    await newUser.save();
    const userObject = newUser.toObject();

    // Remove password, separate _id, and keep the rest
    const { password, _id, ...result } = userObject;

    // Return the clean object mapped to your interface
    return {
      id: _id.toString(), // Convert ObjectId to string
      ...result,
    } as unknown as UserInterface;
    // return newUser as UserInterface;
  }

  async login(email: string, password: string) {
    // const { email, password } = UserDto;
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { email: user.email, sub: user._id, role: user.role };
    return {
      access_token: this.JwtService.sign(payload),
      role: user.role,
    };
  }

  async validateSocialUser(details: any) {
  // 1. Check if the user already exists in the database
  let user = await this.userModel.findOne({ email: details.email });

  // 2. If the user does NOT exist, create a new one
  if (!user) {
    // console.log('User not found. Creating new social user...');
    
    // Generate a random password if your Mongoose schema requires the password field
    // const randomPassword = Math.random().toString(36).slice(-8);
    // const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const newUser = new this.userModel({
      email: details.email,
      role: details.role, 
      // password: hashedPassword, // Kept this in case your schema strictly requires it
    });
    
    // Assign the newly saved user to the 'user' variable
    user = await newUser.save();
  }

  // 3. Generate the JWT payload
  // IMPORTANT: Added 'role' here so your Next.js frontend can decode it!
  const payload = { 
    email: user.email, 
    sub: user._id,
    role: user.role 
  };

  // 4. Return the generated token and role to be sent to the client
  return {
    access_token: this.JwtService.sign(payload),
    role: user.role,
  };
}

  async generateJwt(user: any) {
    const payload = {
      // Use optional chaining '?' or assertions '!'
      email: user?.email,
      sub: user?._id,
      role: user?.role,
    };

    return {
      access_token: this.JwtService.sign(payload),
    };
  }

  // 1. Send OTP
  async sendOTP(dto: SendOtpDto) {
    
    const { email } = dto;
    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate 4 digit OTP (1000 - 8999 range roughly based on your logic)
    // Your original: Math.floor(1000 + Math.random() * 8000)
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    user.resetOtp = otp;
    user.otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    user.isOtpVerified = false;

    await user.save();

    await this.mailService.sendOtpMail(email, otp);
    // Mocking email send for now:
    // console.log(`Sending OTP ${otp} to ${email}`);

    return { message: 'OTP sent successfully' };
  }

  // 2. Verify OTP
  async verifyOTP(dto: VerifyOtpDto) {
    const { email, otp } = dto;
    const user = await this.userModel.findOne({ email });

    if (
      !user ||
      user.resetOtp !== otp ||
      !user.otpExpires || // Check if it's null/undefined first
      user.otpExpires < new Date()
    ) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    user.isOtpVerified = true;
    user.resetOtp = '';
    user.otpExpires = undefined;

    await user.save();

    return { message: 'OTP verified successfully' };
  }

  // 3. Reset Password
  async resetPassword(dto: ResetPasswordDto) {
    const { email, password } = dto;
    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isOtpVerified) {
      throw new BadRequestException('OTP verification required');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user.password = hashedPassword;
    user.isOtpVerified = false; // Reset the flag after successful change

    await user.save();

    return { message: 'Password reset successfully' };
  }

}
