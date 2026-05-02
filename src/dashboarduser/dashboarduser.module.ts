import { Module } from '@nestjs/common';
import { DashboarduserService } from './dashboarduser.service';
import { DashboarduserController } from './dashboarduser.controller';
import { UserAuth, UserSchema } from 'src/auth/user.schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports:[MongooseModule.forFeature([{ name: UserAuth.name, schema: UserSchema }])],
  providers: [DashboarduserService],
  controllers: [DashboarduserController]
})
export class DashboarduserModule {}
