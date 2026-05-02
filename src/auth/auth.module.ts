import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { UserAuth, UserSchema } from './user.schema';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './strategies/google.strategy';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports:[MongooseModule.forFeature([{ name: UserAuth.name, schema: UserSchema }]),
  JwtModule.registerAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      secret: config.get<string>('MY_JWT_SECRET'),
      signOptions: {expiresIn: '7d'}
    })
  }),
  MailModule,
],
  providers: [AuthService,GoogleStrategy],
  controllers: [AuthController],
  
})
export class AuthModule {}
