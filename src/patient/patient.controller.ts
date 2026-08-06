import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Patient } from './schemas/patient.schema';
import { Doctor } from 'src/doctor/schemas/doctor.schema/doctor.schema';
import { PatientService } from './patient.service';
import { AddMedicalRecordDto } from './dto/patient.dto';
import { RoleGuard } from '../guards/role/role.guard';
import { AuthGuard } from '@nestjs/passport';
import { Role } from 'src/guards/role/role.enums';
import { Roles } from 'src/guards/role/role.decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from 'src/doctor/cloudinary.service';
import * as fs from 'fs/promises';

function validatePdf(file: Express.Multer.File) {
  const isPdf = file.mimetype === 'application/pdf' && file.originalname.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    throw new BadRequestException('Only PDF report files are allowed.');
  }
}

@Controller('patient')
export class PatientController {
  constructor(
    private readonly patientService: PatientService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Get('my-appointments')
  async getMyAppointments(@Req() req) {
    const userId = req.user.userId;
    return this.patientService.getMyAppointments(userId);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Post('upload-report/:recordId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReport(
    @Req() req,
    @Param('recordId') recordId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new Error('No file uploaded.');
    }
    validatePdf(file);
    try {
      const result = await this.cloudinaryService.uploadFile(file.path);
      const patientUserId = req.user.userId;
      await this.patientService.addReportToRecord(patientUserId, recordId, result.secure_url);
      return { url: result.secure_url };
    } finally {
      await fs.unlink(file.path).catch((err) => console.error(err));
    }
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Post('doctor-upload-report/:patientId/:recordId')
  @UseInterceptors(FileInterceptor('file'))
  async doctorUploadReport(
    @Param('patientId') patientId: string,
    @Param('recordId') recordId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new Error('No file uploaded.');
    }
    validatePdf(file);
    try {
      const result = await this.cloudinaryService.uploadFile(file.path);
      await this.patientService.addReportToRecordAsDoctor(patientId, recordId, result.secure_url);
      return { url: result.secure_url };
    } finally {
      await fs.unlink(file.path).catch((err) => console.error(err));
    }
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient, Role.Doctor)
  @Post('upload-report-file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReportFile(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new Error('No file uploaded.');
    }
    validatePdf(file);
    try {
      const result = await this.cloudinaryService.uploadFile(file.path);
      return { url: result.secure_url };
    } finally {
      await fs.unlink(file.path).catch((err) => console.error(err));
    }
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Get('my-profile')
  async getMyProfile(@Req() req) {
    const userId = req.user.userId;
    return this.patientService.getProfileByUserId(userId);
  }

  @Get()
  async getAllPatients(): Promise<Patient[]> {
    return this.patientService.getAllPatients();
  }

  @Get('allDoctors')
  async getAllDoctors(): Promise<Doctor[]> {
    return this.patientService.getAllDoctors();
  }

  @Get('doctor/:doctorId')
  async getDoctorById(@Param('doctorId') doctorId: string): Promise<Doctor | null> {
    return this.patientService.getDoctorById(doctorId);
  }

  @Get('search-doctors')
  async searchDoctors(
    @Query('q') query = '',
    @Query('location') location = '',
    @Query('specialty') specialty = 'All',
  ) {
    return this.patientService.searchDoctors(query, location, specialty);
  }

  @Get('doctor-search-suggestions')
  async getDoctorSearchSuggestions(@Query('q') query = '') {
    return this.patientService.getDoctorSearchSuggestions(query);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('doctor-appointments/:doctorId')
  async getDoctorAppointments(@Param('doctorId') doctorId: string) {
    return this.patientService.getDoctorAppointments(doctorId);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Post('doctor-reviews/:doctorId')
  async addDoctorReview(
    @Req() req,
    @Param('doctorId') doctorId: string,
    @Body() body: { rating: number; comment: string },
  ) {
    return this.patientService.addDoctorReview(
      doctorId,
      req.user.userId,
      Number(body.rating),
      body.comment,
    );
  }

  @Get(':id')
  async getPatientById(@Param('id') id: string): Promise<Patient | null> {
    return this.patientService.getPatientById(id);
  }

  // @Post()
  // async createPatient(@Body() patient: Patient): Promise<Patient> {
  //     return this.patientService.createPatient(patient);
  // }

  @Put(':id')
  async updatePatient(
    @Param('id') id: string,
    @Body() patient: Patient,
  ): Promise<Patient | null> {
    return this.patientService.updatePatient(id, patient);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard) // Protect this route!
  @Roles(Role.Doctor) // Only allow doctors to access this route
  @Put('savePrescription/:patientId')
  async savePrescription(
    @Param('patientId') patientId: string,
    @Body() recordDto: AddMedicalRecordDto,
    @Req() req, // Assuming your JWT guard attaches the logged-in doctor to req.user
  ) {
    const doctorId = req.user.userId; // Or fetch doctor name from DB if not in JWT

    return this.patientService.addMedicalRecord(patientId, doctorId, recordDto);
  }
}
