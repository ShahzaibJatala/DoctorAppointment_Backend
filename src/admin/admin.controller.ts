import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RoleGuard } from '../guards/role/role.guard';
import { Roles } from '../guards/role/role.decorators';
import { Role } from '../guards/role/role.enums';
import { AdminService } from './admin.service';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('admin')
@UseGuards(ThrottlerGuard, AuthGuard('jwt'), RoleGuard)
@Roles(Role.Admin)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('appointments')
  async getAppointments() {
    return this.adminService.getRecentAppointments();
  }

  @Get('doctors')
  async getDoctors() {
    return this.adminService.getDoctorsList();
  }

  @Get('users')
  async getUsers() {
    return this.adminService.getUsersList();
  }

  // ── Doctor Management ──────────────────────────────────────

  @Post('doctors/create')
  async createDoctor(
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      specialization?: string;
      phoneNumber?: string;
    },
  ) {
    return this.adminService.createDoctor(body);
  }

  @Post('doctors/:userId/verify')
  async verifyDoctor(@Param('userId') userId: string) {
    return this.adminService.verifyDoctor(userId);
  }

  @Post('doctors/:userId/suspend')
  async suspendDoctor(@Param('userId') userId: string) {
    return this.adminService.suspendDoctor(userId);
  }

  @Delete('doctors/:userId')
  async deleteDoctor(@Param('userId') userId: string) {
    return this.adminService.deleteDoctor(userId);
  }
}
