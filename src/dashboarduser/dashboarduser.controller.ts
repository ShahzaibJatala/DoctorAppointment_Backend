import { Controller, Post } from '@nestjs/common';
import { DashboarduserService } from './dashboarduser.service';

@Controller('dashboarduser')
export class DashboarduserController {
    constructor(private readonly dashboarduserService: DashboarduserService) {}

    @Post()
    async findUser(details: any) {
        console.log(details);
        return this.dashboarduserService.findUser(details);
    }
}
