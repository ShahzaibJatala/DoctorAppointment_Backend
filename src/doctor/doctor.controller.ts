import { Body, Controller, Get, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
  constructor(private readonly doctorService: DoctorService) { }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Post('createProfile')
  @UseInterceptors(FileInterceptor('Image'))
  async createDoctor(@Request() req, @Body() createDoctorDto: CreateDoctorDto, @UploadedFile() file: Express.Multer.File) {
    // Passes the validated DTO straight to the service
    // console.log("user request", req.user);
    // console.log("user request role", req.user.role);
    // console.log("request hy :",req.ip);


    // const user_id = "6996d61efaf1408292f7446f";
    const user_id = req.user.userId;
    return this.doctorService.createDoctor(user_id, createDoctorDto, file);
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Get('getProfile')
  async getDoctorProfile(@Request() req) {
    // console.log("getdoctor profile called", req.user.userId);

    const user_id = req.user.userId;
    return this.doctorService.getDoctorProfile(user_id);
  }


  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Post('addPatient')
  async addPatientToDoctor(@Request() req, @Body() patientSeatDto: PatientSeatDto) {
    // console.log("addPatientToDoctor called with userId:", req.user.userId, "and patientSeatDto:", patientSeatDto);
    const user_id = req.user.userId;
    return this.doctorService.addPatientToDoctor(user_id, patientSeatDto);
  }

  // @UseGuards(AuthGuard('jwt'))
  // @Post('addPatient')
  // async addPatientToDoctor(@Request() req, @Body() body: any) {

  //   // 1. Log exactly what the JWT Guard extracted from the token
  //   console.log("=== DEBUGGING: req.user ===");
  //   console.log(req.user);

  //   // 2. Log exactly what the frontend sent in the Axios payload
  //   console.log("=== DEBUGGING: req.body ===");
  //   console.log(body);

  //   // 3. Send it ALL back to the frontend so you can easily read it in your browser's console!
  //   return {
  //     message: "Debugging values received!",
  //     userFromToken: req.user,
  //     bodyFromFrontend: body
  //   };
  // }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Doctor)
  @Get('getPatients')
  async getPatientsOfDoctor(@Request() req) {
    const user_id = req?.user.userId;
    return this.doctorService.getPatientsOfDoctor(user_id);
  }



}
