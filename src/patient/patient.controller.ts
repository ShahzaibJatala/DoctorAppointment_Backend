import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Patient } from './schemas/patient.schema';
import { Doctor } from 'src/doctor/schemas/doctor.schema/doctor.schema';
import { PatientService } from './patient.service';
import { AddMedicalRecordDto } from './dto/patient.dto';
import { RoleGuard } from '../guards/role/role.guard';
import { AuthGuard } from '@nestjs/passport';
import { Role } from 'src/guards/role/role.enums';
import { Roles } from 'src/guards/role/role.decorators';

@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Get()
  async getAllPatients(): Promise<Patient[]> {
    return this.patientService.getAllPatients();
  }

  @Get('allDoctors')
  async getAllDoctors(): Promise<Doctor[]> {
    return this.patientService.getAllDoctors();
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
