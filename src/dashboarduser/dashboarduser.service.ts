import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserAuth } from 'src/auth/user.schema';

@Injectable()
export class DashboarduserService {
    constructor(@InjectModel(UserAuth.name) private userModel: Model<UserAuth>) {}

    async findUser(details: any) : Promise<UserAuth | null> {
        if(!details.email) console.log('No email provided');
        return this.userModel.findOne({ email: details.email });
    }
}
