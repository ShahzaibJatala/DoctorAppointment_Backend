import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { CompounderService } from './compounder.service';
import { CreateCompounderDto } from './dto/create-compounder.dto';
import { AuthGuard } from '@nestjs/passport';
import { RoleGuard } from '../guards/role/role.guard';
import { Roles } from '../guards/role/role.decorators';
import { Role } from '../guards/role/role.enums';

@Controller('compounder')
export class CompounderController {
  constructor(private readonly compounderService: CompounderService) {}

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Post('register')
  async registerCompounder(@Request() req, @Body() createCompounderDto: CreateCompounderDto) {
    const doctorUserId = req.user.userId;
    return this.compounderService.createCompounder(doctorUserId, createCompounderDto);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Get('list')
  async listCompounders(@Request() req) {
    const doctorUserId = req.user.userId;
    return this.compounderService.getCompoundersForDoctor(doctorUserId);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Compounder)
  @Get('my-doctor')
  async getLinkedDoctor(@Request() req) {
    const compounderUserId = req.user.userId;
    return this.compounderService.getLinkedDoctor(compounderUserId);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Compounder)
  @Get('queue')
  async getQueue(@Request() req) {
    const compounderUserId = req.user.userId;
    return this.compounderService.getQueueForToday(compounderUserId);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Compounder)
  @Post('check-in/:appointmentId')
  async checkIn(@Request() req, @Param('appointmentId') appointmentId: string) {
    const compounderUserId = req.user.userId;
    return this.compounderService.checkInPatient(compounderUserId, appointmentId);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Compounder)
  @Post('book-walk-in')
  async bookWalkIn(
    @Request() req,
    @Body()
    body: {
      fullName: string;
      age: number;
      phoneNumber: string;
      gender: string;
      startTime: string;
    },
  ) {
    const compounderUserId = req.user.userId;
    return this.compounderService.bookWalkIn(compounderUserId, body);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Post('suspend/:id')
  async suspendCompounder(@Request() req, @Param('id') compounderId: string) {
    const doctorUserId = req.user.userId;
    return this.compounderService.suspendCompounder(doctorUserId, compounderId);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Delete(':id')
  async deleteCompounder(@Request() req, @Param('id') compounderId: string) {
    const doctorUserId = req.user.userId;
    return this.compounderService.deleteCompounder(doctorUserId, compounderId);
  }
}
