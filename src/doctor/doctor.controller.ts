import { Body, Controller, Get, Param, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { CreateDoctorDto } from './dto/doctor.dto';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleGuard } from '../guards/role/role.guard';
import { Roles } from '../guards/role/role.decorators';
import { Role } from '../guards/role/role.enums';
import { PatientSeatDto } from './dto/patientSeat.dto';

@Controller('doctor')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Post('createProfile')
  @UseInterceptors(FileInterceptor('Image'))
  async createDoctor(@Request() req, @Body() createDoctorDto: CreateDoctorDto, @UploadedFile() file: Express.Multer.File) {
    const user_id = req.user.userId;
    return this.doctorService.createDoctor(user_id, createDoctorDto, file);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Get('getProfile')
  async getDoctorProfile(@Request() req) {
    const user_id = req.user.userId;
    return this.doctorService.getDoctorProfile(user_id);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Post('addPatient')
  async addPatientToDoctor(@Request() req, @Body() patientSeatDto: PatientSeatDto) {
    const user_id = req.user.userId;
    return this.doctorService.addPatientToDoctor(user_id, patientSeatDto);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Get('getPatients')
  async getPatientsOfDoctor(@Request() req) {
    const user_id = req?.user.userId;
    return this.doctorService.getPatientsOfDoctor(user_id);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor, Role.Compounder)
  @Post('updateStatus/:appointmentId')
  async updateStatus(@Param('appointmentId') appointmentId: string, @Body('status') status: string) {
    return this.doctorService.updateAppointmentStatus(appointmentId, status);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Post('updateAvailability')
  async updateAvailability(
    @Request() req,
    @Body('availability') availability: any[],
    @Body('isVideoEnabled') isVideoEnabled?: boolean,
    @Body('allowWhatsAppVideoConsultation') allowWhatsAppVideoConsultation?: boolean,
  ) {
    const user_id = req.user.userId;
    return this.doctorService.updateAvailability(user_id, availability, isVideoEnabled, allowWhatsAppVideoConsultation);
  }

  // Allow any authenticated user (patient) to upload a bank transfer receipt screenshot
  @UseGuards(AuthGuard('jwt'))
  @Post('uploadReceipt')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReceipt(@UploadedFile() file: Express.Multer.File) {
    return this.doctorService.uploadReceiptImage(file);
  }
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Post('video-recording/:appointmentId')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 250 * 1024 * 1024 },
    }),
  )
  async uploadVideoRecording(@Request() req, @Param('appointmentId') appointmentId: string, @UploadedFile() file: Express.Multer.File) {
    return this.doctorService.uploadConsultationRecording(req.user.userId, appointmentId, file);
  }
}
