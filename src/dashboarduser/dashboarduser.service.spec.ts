import { Test, TestingModule } from '@nestjs/testing';
import { DashboarduserService } from './dashboarduser.service';

describe('DashboarduserService', () => {
  let service: DashboarduserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboarduserService],
    }).compile();

    service = module.get<DashboarduserService>(DashboarduserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
