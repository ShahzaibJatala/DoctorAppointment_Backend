import { Test, TestingModule } from '@nestjs/testing';
import { DashboarduserController } from './dashboarduser.controller';

describe('DashboarduserController', () => {
  let controller: DashboarduserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboarduserController],
    }).compile();

    controller = module.get<DashboarduserController>(DashboarduserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
