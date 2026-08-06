import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UserAuth } from '../auth/user.schema';
import { Doctor } from '../doctor/schemas/doctor.schema/doctor.schema';
import { Patient } from '../patient/schemas/patient.schema';
import { PatientsOfDoctor } from '../doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(UserAuth.name) private readonly userModel: Model<UserAuth>,
    @InjectModel(Doctor.name) private readonly doctorModel: Model<Doctor>,
    @InjectModel(Patient.name) private readonly patientModel: Model<Patient>,
    @InjectModel(PatientsOfDoctor.name)
    private readonly patientsOfDoctorModel: Model<PatientsOfDoctor>,
  ) {}

  async getDashboardStats() {
    const totalDoctors = await this.userModel.countDocuments({
      role: 'doctor',
    });
    const totalPatients = await this.userModel.countDocuments({
      role: 'patient',
    });

    // Sum length of appointments arrays across all doctors
    const docRecords = await this.patientsOfDoctorModel.find().lean().exec();
    let totalAppointments = 0;
    for (const record of docRecords) {
      if (record.appointments) {
        totalAppointments += record.appointments.length;
      }
    }

    return {
      totalDoctors,
      totalPatients,
      totalAppointments,
      avgRating: 4.9,
    };
  }

  async getRecentAppointments() {
    const docRecords = await this.patientsOfDoctorModel.find().lean().exec();
    const list: any[] = [];
    for (const record of docRecords) {
      if (record.appointments) {
        for (const app of record.appointments) {
          list.push({
            id: (app as any)._id?.toString() || Math.random().toString(),
            patientId: app.patientId?.toString(),
            doctorId: record.doctorId?.toString(),
            startTime: app.startTime,
            endTime: app.endTime,
            status: app.status,
            appointmentType: app.appointmentType,
          });
        }
      }
    }

    // Fetch patient Auth details
    const patients = await this.userModel
      .find({ role: 'patient' })
      .select('name email')
      .lean()
      .exec();
    // Fetch patient profiles for profilePictureUrl
    const patientProfiles = await this.patientModel
      .find()
      .select('userId profilePictureUrl')
      .lean()
      .exec();
    // Fetch doctor profile details
    const doctors = await this.doctorModel
      .find()
      .select('fullName specialization profilePictureUrl userId')
      .lean()
      .exec();

    const mapped = list.map((item) => {
      const patient = patients.find((p) => p._id.toString() === item.patientId);
      const patientProfile = patientProfiles.find(
        (p) => p.userId?.toString() === item.patientId,
      );
      const doctor = doctors.find(
        (d) =>
          d._id.toString() === item.doctorId ||
          d.userId?.toString() === item.doctorId,
      );

      return {
        id: item.id,
        patient: patient
          ? patient.name || patient.email.split('@')[0]
          : 'Patient',
        avatar:
          (patientProfile as any)?.profilePictureUrl ||
          `https://ui-avatars.com/api/?name=${patient ? patient.name || 'P' : 'P'}&background=0D8ABC&color=fff`,
        doctor: doctor ? doctor.fullName : 'Doctor',
        specialty: doctor ? doctor.specialization : 'General Practice',
        date: item.startTime
          ? new Date(item.startTime).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'TBD',
        time: item.startTime
          ? new Date(item.startTime).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'TBD',
        status: this.normalizeStatus(item.status),
      };
    });

    // Sort by startTime descending
    return mapped
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 15);
  }

  async getDoctorsList() {
    const userDoctors = await this.userModel
      .find({ role: 'doctor' })
      .lean()
      .exec();
    const doctors = await this.doctorModel.find().lean().exec();
    const docRecords = await this.patientsOfDoctorModel.find().lean().exec();

    return userDoctors.map((userDoc) => {
      const profile = doctors.find(
        (d) => d.userId?.toString() === userDoc._id.toString(),
      );
      // Map status: Active/Suspended from UserAuth; Pending = has no verified profile
      let status: string = (userDoc as any).status || 'Active';
      if (!profile || !(profile as any).isVerified) {
        if (status === 'Active') status = 'Pending';
      }
      const reviewsArr: any[] = (profile as any)?.reviews || [];
      const realRating =
        reviewsArr.length > 0
          ? parseFloat(
              (
                reviewsArr.reduce((s: number, r: any) => s + r.rating, 0) /
                reviewsArr.length
              ).toFixed(1),
            )
          : null;

      // Calculate total patients and income
      const docRecord = docRecords.find(
        (r) => profile && r.doctorId?.toString() === profile._id.toString(),
      );
      const appointments = docRecord?.appointments || [];
      const nonCancelledAppointments = appointments.filter((a: any) => a.status !== 'cancelled');
      const uniquePatientsCount = new Set(nonCancelledAppointments.map((a: any) => a.patientId?.toString())).size;
      
      const clinicFee = profile?.consultationFee || 0;
      const videoFee = profile?.videoConsultationFee || clinicFee || 0;
      const totalIncome = nonCancelledAppointments.reduce((sum, app) => {
        const fee = app.appointmentType === 'Video' ? videoFee : clinicFee;
        return sum + fee;
      }, 0);

      return {
        id: userDoc._id.toString(), // Use userId so admin actions work
        name: profile
          ? profile.fullName
          : userDoc.name || userDoc.email.split('@')[0],
        email: userDoc.email,
        phone: profile ? profile.phoneNumber : 'No phone',
        specialty: profile ? profile.specialization : 'General Practitioner',
        hospital: profile ? (profile as any).clinicName : 'Clinic',
        experience: profile ? `${profile.experienceYears} Years` : '0 Years',
        rating: realRating,
        reviews: reviewsArr.length,
        status,
        joinedDate:
          profile && (profile as any).createdAt
            ? new Date((profile as any).createdAt).toLocaleDateString()
            : 'N/A',
        avatar:
          profile?.profilePictureUrl ||
          `https://ui-avatars.com/api/?name=${userDoc.name || 'D'}&background=16BCC8&color=fff`,
        documents: profile?.documentFileUrl ? [profile.documentFileUrl] : [],
        totalPatients: uniquePatientsCount,
        totalIncome: totalIncome,
      };
    });
  }

  async getUsersList() {
    const userPatients = await this.userModel
      .find({ role: 'patient' })
      .lean()
      .exec();
    const patientProfiles = await this.patientModel.find().lean().exec();

    // Sum appointments from all doctor records
    const docRecords = await this.patientsOfDoctorModel.find().lean().exec();
    const allAppointments: any[] = [];
    for (const record of docRecords) {
      if (record.appointments) {
        allAppointments.push(...record.appointments);
      }
    }

    return userPatients.map((userPat) => {
      const profile = patientProfiles.find(
        (p) => p.userId?.toString() === userPat._id.toString(),
      );
      const totalAppointments = allAppointments.filter(
        (app) => app.patientId?.toString() === userPat._id.toString(),
      ).length;

      return {
        id: userPat._id.toString(),
        name: profile
          ? profile.fullName
          : userPat.name || userPat.email.split('@')[0],
        email: userPat.email,
        phone: profile ? profile.phoneNumber : 'No phone',
        role: totalAppointments > 10 ? 'VIP Patient' : 'Patient',
        joinedDate:
          profile && (profile as any).createdAt
            ? new Date((profile as any).createdAt).toLocaleDateString()
            : 'N/A',
        status: (userPat as any).status || 'Active',
        totalAppointments,
        lastActive: 'Active',
        avatar:
          (profile as any)?.profilePictureUrl ||
          `https://ui-avatars.com/api/?name=${userPat.name || 'P'}&background=3b82f6&color=fff`,
      };
    });
  }

  private normalizeStatus(status: string): string {
    const s = status?.toLowerCase();
    if (s === 'confirmed' || s === 'upcoming') return 'Confirmed';
    if (s === 'completed') return 'Completed';
    if (s === 'cancelled') return 'Cancelled';
    return 'Pending';
  }

  // ── Doctor Management ──────────────────────────────────────

  async createDoctor(body: {
    name: string;
    email: string;
    password: string;
    specialization?: string;
    phoneNumber?: string;
  }) {
    const existing = await this.userModel.findOne({ email: body.email });
    if (existing) throw new ConflictException('Email already in use.');

    const hashed = await bcrypt.hash(body.password, 10);
    const user = await this.userModel.create({
      name: body.name,
      email: body.email,
      password: hashed,
      role: 'doctor',
      status: 'Active',
    });

    // Bootstrap a minimal doctor profile
    await this.doctorModel.create({
      userId: user._id,
      email: body.email,
      fullName: body.name,
      specialization: body.specialization || 'General Practitioner',
      phoneNumber: body.phoneNumber || 'Not provided',
      experienceYears: 0,
      isVerified: false,
    });

    return { success: true, userId: user._id };
  }

  async verifyDoctor(userId: string) {
    // Use findOneAndUpdate to avoid validation errors on partial/admin-created profiles
    // Use $in to handle userId stored as string or ObjectId
    const result = await this.doctorModel.findOneAndUpdate(
      { userId: { $in: [userId, new Types.ObjectId(userId)] } },
      { $set: { isVerified: true } },
      { new: true, runValidators: false },
    );
    if (!result) throw new NotFoundException('Doctor profile not found.');
    return { success: true };
  }

  async suspendDoctor(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.role !== 'doctor')
      throw new NotFoundException('Doctor user not found.');
    user.status = user.status === 'Suspended' ? 'Active' : 'Suspended';
    await user.save();
    return { success: true, status: user.status };
  }

  async deleteDoctor(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.role !== 'doctor')
      throw new NotFoundException('Doctor user not found.');
    await this.doctorModel.deleteOne({ userId: new Types.ObjectId(userId) });
    await this.userModel.deleteOne({ _id: new Types.ObjectId(userId) });
    return { success: true };
  }

  async suspendUser(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.role !== 'patient')
      throw new NotFoundException('Patient user not found.');
    user.status = user.status === 'Suspended' ? 'Active' : 'Suspended';
    await user.save();
    return { success: true, status: user.status };
  }
}
