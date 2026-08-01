import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { VideoCallGateway } from './video-call.gateway';
import { PatientsOfDoctor, PatientsOfDoctorSchema } from '../doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { Doctor, DoctorSchema } from '../doctor/schemas/doctor.schema/doctor.schema';

import { RealtimeService } from './realtime.service';
import { RealtimeController } from './realtime.controller';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('MY_JWT_SECRET'),
      }),
    }),
    MongooseModule.forFeature([
      { name: PatientsOfDoctor.name, schema: PatientsOfDoctorSchema },
      { name: Doctor.name, schema: DoctorSchema },
    ]),
  ],
  providers: [RealtimeService, VideoCallGateway],
  controllers: [RealtimeController],
  exports: [RealtimeService, VideoCallGateway],
})
export class RealtimeModule {}
