import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Compounder } from './schemas/compounder.schema';
import { UserAuth } from '../auth/user.schema';
import { Doctor } from '../doctor/schemas/doctor.schema/doctor.schema';
import { PatientsOfDoctor } from '../doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { CreateCompounderDto } from './dto/create-compounder.dto';
import * as bcrypt from 'bcrypt';
import { PatientService } from '../patient/patient.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class CompounderService {
  constructor(
    @InjectModel(Compounder.name)
    private readonly compounderModel: Model<Compounder>,
    @InjectModel(UserAuth.name) private readonly userModel: Model<UserAuth>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(PatientsOfDoctor.name)
    private readonly patientsOfDoctor: Model<PatientsOfDoctor>,
    private readonly patientService: PatientService,
    private readonly realtimeService: RealtimeService,
  ) {}
  private linkedDoctorIds(compounder: any): string[] {
    const ids = (compounder.doctorIds || []).map((id: any) => id.toString());
    if (compounder.doctorId && !ids.includes(compounder.doctorId.toString())) {
      ids.push(compounder.doctorId.toString());
    }
    return ids;
  }

  private async resolveDoctorId(compounderUserId: string, requestedDoctorId?: string): Promise<Types.ObjectId> {
    const compounder = await this.compounderModel.findOne({
      userId: { $in: [compounderUserId, new Types.ObjectId(compounderUserId)] },
    });
    if (!compounder) throw new NotFoundException('Compounder profile not found.');

    const linkedIds = this.linkedDoctorIds(compounder);
    const selected = requestedDoctorId || linkedIds[0];
    if (!selected || !linkedIds.includes(selected)) {
      throw new BadRequestException('Select a doctor connected to this compounder.');
    }
    return new Types.ObjectId(selected);
  }

  private async doctorForUser(doctorUserId: string): Promise<Doctor> {
    const doctor = await this.doctorModel.findOne({
      userId: { $in: [doctorUserId, new Types.ObjectId(doctorUserId)] },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found.');
    return doctor;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  }


  async createCompounder(
    doctorUserId: string,
    createCompounderDto: CreateCompounderDto,
  ): Promise<Compounder> {
    // 1. Verify doctor profile exists or auto-create skeleton
    let doctor = await this.doctorModel.findOne({
      userId: { $in: [doctorUserId, new Types.ObjectId(doctorUserId)] },
    });
    if (!doctor) {
      const user = await this.userModel.findById(doctorUserId);
      if (!user) {
        throw new NotFoundException('Doctor user account not found.');
      }
      doctor = new this.doctorModel({
        userId: new Types.ObjectId(doctorUserId),
        fullName: user.name || 'Dr. ' + user.email.split('@')[0],
        email: user.email,
        phoneNumber: '03001234567',
        specialization: 'General Practice',
        experienceYears: 1,
        availability: [],
      });
      await doctor.save();
    }

    // 2. Check if user already exists
    const existingUser = await this.userModel.findOne({
      email: createCompounderDto.email,
    });
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
      doctorIds: [doctor._id],
    });

    return await newCompounder.save();
  }

  async getCompoundersForDoctor(doctorUserId: string): Promise<any[]> {
    let doctor = await this.doctorModel.findOne({
      userId: { $in: [doctorUserId, new Types.ObjectId(doctorUserId)] },
    });
    if (!doctor) {
      const user = await this.userModel.findById(doctorUserId);
      if (!user) {
        throw new NotFoundException('Doctor user account not found.');
      }
      doctor = new this.doctorModel({
        userId: new Types.ObjectId(doctorUserId),
        fullName: user.name || 'Dr. ' + user.email.split('@')[0],
        email: user.email,
        phoneNumber: '03001234567',
        specialization: 'General Practice',
        experienceYears: 1,
        availability: [],
      });
      await doctor.save();
    }
    const list = await this.compounderModel
      .find({ $or: [{ doctorIds: doctor._id }, { doctorId: doctor._id }] })
      .lean()
      .exec();
    const userIds = list.map((c) => c.userId);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .lean()
      .exec();

    return list.map((c) => {
      const u = users.find(
        (user) => user._id.toString() === c.userId.toString(),
      );
      return {
        ...c,
        status: u ? u.status || 'Active' : 'Active',
      };
    });
  }

  async searchCompounders(doctorUserId: string, query: string): Promise<any[]> {
    const doctor = await this.doctorForUser(doctorUserId);
    const term = query.trim();
    if (term.length < 2) return [];
    const regex = new RegExp(this.escapeRegex(term), 'i');
    const compounds = await this.compounderModel.find({
      $or: [{ fullName: regex }, { email: regex }, { phoneNumber: regex }],
    }).limit(10).lean().exec();

    return compounds.map((compounder: any) => {
      const linked = this.linkedDoctorIds(compounder).includes(doctor._id.toString());
      const pending = (compounder.invitations || []).some(
        (invitation: any) => invitation.doctorId.toString() === doctor._id.toString() && invitation.status === 'pending',
      );
      return { ...compounder, linked, pending };
    });
  }

  async inviteCompounder(doctorUserId: string, compounderId: string): Promise<any> {
    const doctor = await this.doctorForUser(doctorUserId);
    const compounder = await this.compounderModel.findById(compounderId);
    if (!compounder) throw new NotFoundException('Compounder not found.');
    if (this.linkedDoctorIds(compounder).includes(doctor._id.toString())) {
      throw new ConflictException('This compounder is already connected to you.');
    }
    const existingPending = (compounder.invitations || []).some(
      (invitation: any) => invitation.doctorId.toString() === doctor._id.toString() && invitation.status === 'pending',
    );
    if (existingPending) throw new ConflictException('Invitation already sent.');
    (compounder.invitations as any).push({ doctorId: doctor._id, status: 'pending', invitedAt: new Date() });
    await compounder.save();
    return { success: true, message: 'Invitation sent.' };
  }

  async getInvitations(compounderUserId: string): Promise<any[]> {
    const compounder = await this.compounderModel.findOne({
      userId: { $in: [compounderUserId, new Types.ObjectId(compounderUserId)] },
    }).lean();
    if (!compounder) throw new NotFoundException('Compounder profile not found.');
    const pending = (compounder.invitations || []).filter((item: any) => item.status === 'pending');
    const doctors = await this.doctorModel.find({
      _id: { $in: pending.map((item: any) => item.doctorId) },
    }).lean();
    return pending.map((invitation: any) => ({
      invitationId: invitation._id.toString(),
      invitedAt: invitation.invitedAt,
      doctor: doctors.find((doctor: any) => doctor._id.toString() === invitation.doctorId.toString()),
    }));
  }

  async respondToInvitation(compounderUserId: string, invitationId: string, accept: boolean): Promise<any> {
    const compounder = await this.compounderModel.findOne({
      userId: { $in: [compounderUserId, new Types.ObjectId(compounderUserId)] },
    });
    if (!compounder) throw new NotFoundException('Compounder profile not found.');
    const invitation = (compounder.invitations as any).id(invitationId);
    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundException('Pending invitation not found.');
    }
    invitation.status = accept ? 'accepted' : 'rejected';
    if (accept && !this.linkedDoctorIds(compounder).includes(invitation.doctorId.toString())) {
      compounder.doctorIds.push(invitation.doctorId);
    }
    await compounder.save();
    return { success: true, accepted: accept };
  }

  async getConnectedDoctors(compounderUserId: string): Promise<Doctor[]> {
    const compounder = await this.compounderModel.findOne({
      userId: { $in: [compounderUserId, new Types.ObjectId(compounderUserId)] },
    });
    if (!compounder) throw new NotFoundException('Compounder profile not found.');
    return this.doctorModel.find({ _id: { $in: this.linkedDoctorIds(compounder) } }).exec();
  }

  async getLinkedDoctor(compounderUserId: string): Promise<Doctor> {
    const compounder = await this.compounderModel.findOne({
      userId: { $in: [compounderUserId, new Types.ObjectId(compounderUserId)] },
    });

    if (!compounder) {
      throw new NotFoundException('Compounder profile not found.');
    }
    const doctorId = await this.resolveDoctorId(compounderUserId);
    const doctor = await this.doctorModel.findById(doctorId).exec();
    if (!doctor) {
      throw new NotFoundException('Linked doctor profile not found.');
    }
    return doctor;
  }

  async getQueueForToday(compounderUserId: string, selectedDoctorId?: string): Promise<any[]> {
    const compounder = await this.compounderModel.findOne({
      userId: { $in: [compounderUserId, new Types.ObjectId(compounderUserId)] },
    });
    if (!compounder) {
      throw new NotFoundException('Compounder profile not found.');
    }
    const doctorId = await this.resolveDoctorId(compounderUserId, selectedDoctorId);

    const doctorRecord = await this.patientsOfDoctor
      .findOne({ doctorId })
      .exec();
    if (
      !doctorRecord ||
      !doctorRecord.appointments ||
      doctorRecord.appointments.length === 0
    ) {
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
          bankTransferReceiptUrl: (appointment as any).bankTransferReceiptUrl,
          patientName: (appointment as any).patientName,
          patientAge: (appointment as any).patientAge,
          patientPhone: (appointment as any).patientPhone,
          patientGender: (appointment as any).patientGender,
        };
      });

    // Sort by startTime
    todayAppointments.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    return todayAppointments;
  }

  async getAllBookings(compounderUserId: string, selectedDoctorId?: string): Promise<any[]> {
    const compounder = await this.compounderModel.findOne({
      userId: { $in: [compounderUserId, new Types.ObjectId(compounderUserId)] },
    });
    if (!compounder) throw new NotFoundException('Compounder profile not found.');

    const doctorId = await this.resolveDoctorId(compounderUserId, selectedDoctorId);
    const doctorRecord = await this.patientsOfDoctor.findOne({ doctorId }).exec();
    if (!doctorRecord?.appointments?.length) return [];

    const patientIds = doctorRecord.appointments.map(app => app.patientId);
    const patients = await this.userModel
      .find({ _id: { $in: patientIds } })
      .select('-password -resetOtp -otpExpires -isOtpVerified')
      .lean()
      .exec();

    return doctorRecord.appointments
      .map(appointment => {
        const patient = patients.find(item => item._id.toString() === appointment.patientId.toString());
        return {
          ...patient,
          appointmentId: (appointment as any)._id.toString(),
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          appointmentType: appointment.appointmentType,
          paymentMethod: appointment.paymentMethod,
          status: appointment.status,
          tokenNumber: (appointment as any).tokenNumber,
          mobileWalletNumber: (appointment as any).mobileWalletNumber,
          bankTransferReceiptUrl: (appointment as any).bankTransferReceiptUrl,
          patientName: (appointment as any).patientName,
          patientAge: (appointment as any).patientAge,
          patientPhone: (appointment as any).patientPhone,
          patientGender: (appointment as any).patientGender,
        };
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  async checkInPatient(
    compounderUserId: string,
    appointmentId: string,
    selectedDoctorId?: string,
  ): Promise<any> {
    const compounder = await this.compounderModel.findOne({
      userId: { $in: [compounderUserId, new Types.ObjectId(compounderUserId)] },
    });
    if (!compounder) {
      throw new NotFoundException('Compounder profile not found.');
    }
    const doctorId = await this.resolveDoctorId(compounderUserId, selectedDoctorId);

    // Find doctor record
    const doctorRecord = await this.patientsOfDoctor
      .findOne({ doctorId })
      .exec();
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
      return (
        appDate >= today && appDate < tomorrow && app.status === 'checked-in'
      );
    });

    const nextToken = checkedInToday.length + 1;

    // Update the specific appointment
    const updated = await this.patientsOfDoctor.findOneAndUpdate(
      {
        doctorId,
        'appointments._id': new Types.ObjectId(appointmentId),
      },
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

    const appObj = updated.appointments.find(
      (a: any) => a._id.toString() === appointmentId,
    );
    if (appObj) {
      this.realtimeService.emit('appointment_updated', {
        doctorId: updated.doctorId,
        startTime: appObj.startTime,
        endTime: appObj.endTime,
        status: appObj.status,
        appointmentId: (appObj as any)._id.toString(),
        tokenNumber: nextToken,
      });
    }

    return { success: true, tokenNumber: nextToken };
  }

  async bookWalkIn(
    compounderUserId: string,
    body: {
      fullName: string;
      age: number;
      phoneNumber: string;
      gender: string;
      startTime: string;
    },
    selectedDoctorId?: string,
  ): Promise<any> {
    const compounder = await this.compounderModel.findOne({
      userId: { $in: [compounderUserId, new Types.ObjectId(compounderUserId)] },
    });
    if (!compounder) {
      throw new NotFoundException('Compounder profile not found.');
    }
    const doctorId = await this.resolveDoctorId(compounderUserId, selectedDoctorId);

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
      doctorId,
      appointments: {
        $elemMatch: { startTime: startDateTime, status: { $ne: 'cancelled' } },
      },
    });

    if (isSlotTaken) {
      throw new BadRequestException('This slot is already booked.');
    }

    // Push appointment
    await this.patientsOfDoctor.findOneAndUpdate(
      { doctorId },
      {
        $push: {
          appointments: {
            patientId: patientUser._id,
            startTime: startDateTime,
            endTime: endDateTime,
            appointmentType: 'Clinic',
            paymentMethod: 'cash',
            status: 'confirmed',
            patientName: body.fullName,
            patientAge: body.age,
            patientPhone: body.phoneNumber,
            patientGender: body.gender,
          },
        },
      },
      { returnDocument: 'after', upsert: true },
    );

    this.realtimeService.emit('appointment_booked', {
      doctorId,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      status: 'confirmed',
    });

    return { success: true, patientName: body.fullName };
  }

  async suspendCompounder(doctorUserId: string, compounderId: string) {
    const doctor = await this.doctorModel.findOne({
      userId: new Types.ObjectId(doctorUserId),
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found.');

    const compounder = await this.compounderModel.findOne({
      _id: new Types.ObjectId(compounderId),
      $or: [{ doctorIds: doctor._id }, { doctorId: doctor._id }],
    });
    if (!compounder)
      throw new NotFoundException('Compounder not found under this doctor.');

    const user = await this.userModel.findById(compounder.userId);
    if (!user)
      throw new NotFoundException('Compounder user account not found.');

    const newStatus = user.status === 'Suspended' ? 'Active' : 'Suspended';
    user.status = newStatus;
    await user.save();

    return { success: true, status: newStatus };
  }

  async deleteCompounder(doctorUserId: string, compounderId: string) {
    const doctor = await this.doctorModel.findOne({
      userId: new Types.ObjectId(doctorUserId),
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found.');

    const compounder = await this.compounderModel.findOne({
      _id: new Types.ObjectId(compounderId),
      $or: [{ doctorIds: doctor._id }, { doctorId: doctor._id }],
    });
    if (!compounder)
      throw new NotFoundException('Compounder not found under this doctor.');

    compounder.doctorIds = (compounder.doctorIds || []).filter(
      id => id.toString() !== doctor._id.toString(),
    );
    (compounder.invitations as any) = (compounder.invitations || []).filter(
      (invitation: any) => invitation.doctorId.toString() !== doctor._id.toString(),
    );
    if (compounder.doctorId?.toString() === doctor._id.toString()) compounder.doctorId = undefined;
    await compounder.save();

    return { success: true };
  }
}
