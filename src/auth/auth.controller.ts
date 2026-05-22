import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ResetPasswordDto, SendOtpDto, UserDto, VerifyOtpDto } from './dto/user.dto';
import { UserInterface } from './interfaces/user.interface';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async createUser(@Body() user: UserDto): Promise<UserInterface> {
    return this.authService.createUser(user);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.authService.login(email, password);
  }

  @Post('sendOTP')
  async sendOTP(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOTP(sendOtpDto);
  }

  @Post('verifyOTP')
  async verifyOTP(@Body() verifyOtp: VerifyOtpDto) {
    return this.authService.verifyOTP(verifyOtp);
  }

  @Post('forgotPassword')
  async forgotPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto)
  }


  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req, @Body() body: { email: string }) {
    // LEAVE THIS EMPTY.
    // The Guard automatically redirects the browser to Google.
    // return this.authService.validateSocialUser({ email: body.email });
  }

  // auth.controller.ts
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    const result = await this.authService.validateSocialUser(req.user);

    res.cookie('accessToken', result.access_token, {
      httpOnly: true,
      secure: true, // Set to true only in production (HTTPS)
      sameSite: 'none', // Crucial for redirects between :3003 and :3000
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.redirect(`${process.env.FRONTEND_URL}/${result.role}/dashboard`);
  }
}
