import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { DashboarduserModule } from './dashboarduser/dashboarduser.module';
import { MailModule } from './mail/mail.module';
// import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { PatientModule } from './patient/patient.module';
import { DoctorModule } from './doctor/doctor.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGO_URI!),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // Time to Live (1 minute in milliseconds)
        limit: 5, // Max 5 requests per minute per IP
      },
    ]),
    AuthModule,
    DashboarduserModule,
    MailModule,
    // CloudinaryModule,
    PatientModule,
    DoctorModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    AppService,
  ],
})
export class AppModule {}
