import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Compounder } from './schemas/compounder.schema';
import { UserAuth } from '../auth/user.schema';
import { Doctor } from '../doctor/schemas/doctor.schema/doctor.schema';
import { PatientsOfDoctor } from '../doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { CreateCompounderDto } from './dto/create-compounder.dto';
import * as bcrypt from 'bcrypt';
import { PatientService } from '../patient/patient.service';

@Injectable()
export class CompounderService {
  constructor(
    @InjectModel(Compounder.name) private readonly compounderModel: Model<Compounder>,
    @InjectModel(UserAuth.name) private readonly userModel: Model<UserAuth>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(PatientsOfDoctor.name) private readonly patientsOfDoctor: Model<PatientsOfDoctor>,
    private readonly patientService: PatientService,
  ) {}

  async createCompounder(doctorUserId: string, createCompounderDto: CreateCompounderDto): Promise<Compounder> {
    // 1. Verify doctor profile exists
    const doctor = await this.doctorModel.findOne({ userId: new Types.ObjectId(doctorUserId) });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found.');
    }

    // 2. Check if user already exists
    const existingUser = await this.userModel.findOne({ email: createCompounderDto.email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists.');
    }

    // 3. Create UserAuth entry
    const hashedPassword = await bcrypt.hash(createCompounderDto.password, 10);
    const newUser = new this.userModel({
      name: createCompounderDto.fullName,
      email: createCompounderDto.email,
      password: hashedPassword,
      role: 'compounder',
      isOtpVerified: true,
      age: 30, // Default age placeholder
    });
    const savedUser = await newUser.save();

    // 4. Create Compounder profile
    const newCompounder = new this.compounderModel({
      userId: savedUser._id,
      doctorId: doctor._id,
      fullName: createCompounderDto.fullName,
      email: createCompounderDto.email,
      phoneNumber: createCompounderDto.phoneNumber,
    });

    return await newCompounder.save();
  }

  async getCompoundersForDoctor(doctorUserId: string): Promise<Compounder[]> {
    const doctor = await this.doctorModel.findOne({ userId: new Types.ObjectId(doctorUserId) });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found.');
    }
    return this.compounderModel.find({ doctorId: doctor._id }).exec();
  }

  async getLinkedDoctor(compounderUserId: string): Promise<Doctor> {
    const compounder = await this.compounderModel.findOne({ userId: new Types.ObjectId(compounderUserId) });
    if (!compounder) {
      throw new NotFoundException('Compounder profile not found.');
    }
    const doctor = await this.doctorModel.findById(compounder.doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Linked doctor profile not found.');
    }
    return doctor;
  }

  async getQueueForToday(compounderUserId: string): Promise<any[]> {
    const compounder = await this.compounderModel.findOne({ userId: new Types.ObjectId(compounderUserId) });
    if (!compounder) {
      throw new NotFoundException('Compounder profile not found.');
    }

    const doctorRecord = await this.patientsOfDoctor.findOne({ doctorId: compounder.doctorId }).exec();
    if (!doctorRecord || !doctorRecord.appointments || doctorRecord.appointments.length === 0) {
      return [];
    }

    // Fetch details of all patients in the list
    const patientIds = doctorRecord.appointments.map((app) => app.patientId);
    const patients = await this.userModel
      .find({ _id: { $in: patientIds } })
      .select('-password -resetOtp -otpExpires -isOtpVerified')
      .lean()
      .exec();

    // Filter appointments for today and map details
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayAppointments = doctorRecord.appointments
      .filter((app) => {
        const appDate = new Date(app.startTime);
        return appDate >= today && appDate < tomorrow;
      })
      .map((appointment) => {
        const patientProfile = patients.find(
          (p) => p._id.toString() === appointment.patientId.toString(),
        );

        return {
          ...patientProfile,
          appointmentId: (appointment as any)._id.toString(),
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          appointmentType: appointment.appointmentType,
          paymentMethod: appointment.paymentMethod,
          status: appointment.status,
          tokenNumber: (appointment as any).tokenNumber,
          mobileWalletNumber: (appointment as any).mobileWalletNumber,
        };
      });

    // Sort by startTime
    todayAppointments.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return todayAppointments;
  }

  async checkInPatient(compounderUserId: string, appointmentId: string): Promise<any> {
    const compounder = await this.compounderModel.findOne({ userId: new Types.ObjectId(compounderUserId) });
    if (!compounder) {
      throw new NotFoundException('Compounder profile not found.');
    }

    // Find doctor record
    const doctorRecord = await this.patientsOfDoctor.findOne({ doctorId: compounder.doctorId }).exec();
    if (!doctorRecord) {
      throw new NotFoundException('No appointments found for this doctor.');
    }

    // Count how many patients checked-in today to issue the next token number
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const checkedInToday = doctorRecord.appointments.filter((app) => {
      const appDate = new Date(app.startTime);
      return appDate >= today && appDate < tomorrow && app.status === 'checked-in';
    });

    const nextToken = checkedInToday.length + 1;

    // Update the specific appointment
    const updated = await this.patientsOfDoctor.findOneAndUpdate(
      { doctorId: compounder.doctorId, 'appointments._id': new Types.ObjectId(appointmentId) },
      {
        $set: {
          'appointments.$.status': 'checked-in',
          'appointments.$.tokenNumber': nextToken,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Appointment not found.');
    }

    return { success: true, tokenNumber: nextToken };
  }

  async bookWalkIn(
    compounderUserId: string,
    body: { fullName: string; age: number; phoneNumber: string; gender: string; startTime: string },
  ): Promise<any> {
    const compounder = await this.compounderModel.findOne({ userId: new Types.ObjectId(compounderUserId) });
    if (!compounder) {
      throw new NotFoundException('Compounder profile not found.');
    }

    // 1. Create or find a walk-in patient user
    const mockEmail = `walkin_${body.phoneNumber}@medibook.com`;
    let patientUser = await this.userModel.findOne({ email: mockEmail });
    if (!patientUser) {
      patientUser = new this.userModel({
        name: body.fullName,
        email: mockEmail,
        password: await bcrypt.hash('walkin123', 10),
        role: 'patient',
        isOtpVerified: true,
        age: body.age,
      });
      await patientUser.save();
    }

    // Ensure Patient profile document exists
    await this.patientService.createPatient(mockEmail, patientUser._id);

    // 2. Book appointment
    const startDateTime = new Date(body.startTime);
    const endDateTime = new Date(startDateTime.getTime() + 30 * 60000); // 30 minutes duration

    // Check if slot is already booked for this doctor
    const isSlotTaken = await this.patientsOfDoctor.findOne({
      doctorId: compounder.doctorId,
      appointments: {
        $elemMatch: { startTime: startDateTime, status: { $ne: 'cancelled' } },
      },
    });

    if (isSlotTaken) {
      throw new BadRequestException('This slot is already booked.');
    }

    // Push appointment
    await this.patientsOfDoctor.findOneAndUpdate(
      { doctorId: compounder.doctorId },
      {
        $push: {
          appointments: {
            patientId: patientUser._id,
            startTime: startDateTime,
            endTime: endDateTime,
            appointmentType: 'Clinic',
            paymentMethod: 'cash',
            status: 'confirmed',
          },
        },
      },
      { returnDocument: 'after', upsert: true },
    );

    return { success: true, patientName: body.fullName };
  }
}
