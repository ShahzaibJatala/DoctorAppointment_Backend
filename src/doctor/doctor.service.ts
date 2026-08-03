import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Doctor } from './schemas/doctor.schema/doctor.schema';
import { Model, Types } from 'mongoose';
import { CreateDoctorDto } from './dto/doctor.dto';
import { UserAuth } from 'src/auth/user.schema';
import { CloudinaryService } from './cloudinary.service';
import * as fs from 'fs/promises';
import { PatientSeatDto } from './dto/patientSeat.dto';
import { PatientsOfDoctor } from './schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { PatientService } from 'src/patient/patient.service';
import { Patient } from 'src/patient/schemas/patient.schema';
import { RealtimeService } from '../realtime/realtime.service';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';

@Injectable()
export class DoctorService {
  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(UserAuth.name) private userModel: Model<UserAuth>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly patientService: PatientService,
    @InjectModel(PatientsOfDoctor.name)
    private readonly patientsOfDoctor: Model<PatientsOfDoctor>,
    private readonly realtimeService: RealtimeService,
  ) {}

  async createDoctor(
    userId: string,
    createDoctorDto: CreateDoctorDto,
    file?: Express.Multer.File,
  ): Promise<Doctor> {
    // 1. Verify User Exists AND has the 'doctor' role
    const identifyUser = await this.userModel.findById(userId);

    if (!identifyUser) {
      throw new NotFoundException('User account not found.');
    }

    if (identifyUser.role !== 'doctor') {
      throw new ForbiddenException(
        'Only users with the doctor role can create or update a doctor profile.',
      );
    }

    const existingDoctor = await this.doctorModel.findOne({
      userId: { $in: [userId, new Types.ObjectId(userId)] },
    });

    if (!existingDoctor && !file) {
      throw new BadRequestException(
        'A profile photo is required to create a doctor profile.',
      );
    }

    // 2. Handle Cloudinary Upload
    let profilePictureUrl: string | undefined = undefined;

    try {
      if (file) {
        const result = await this.cloudinaryService.uploadImage(file.path);
        if (!result || !result.secure_url) {
          throw new Error('Invalid Cloudinary response.');
        }
        profilePictureUrl = result.secure_url;
      }
    } catch (error) {
      throw new BadRequestException(`Failed to upload profile picture.`);
    } finally {
      if (file?.path) {
        await fs
          .unlink(file.path)
          .catch((err) => console.error('Error deleting file:', err));
      }
    }

    // 3. Prepare the data to be saved/updated
    const updateData: any = {
      ...createDoctorDto,
      userId: userId, // Force the ID from the token, not the body
    };

    // Only update the profile picture if a new file was actually uploaded.
    // This prevents accidentally overwriting an existing picture with 'undefined'.
    if (profilePictureUrl) {
      updateData.profilePictureUrl = profilePictureUrl;
    }

    // 4. Upsert: Update if it exists, create if it doesn't
    const savedDoctor = await this.doctorModel.findOneAndUpdate(
      { _id: existingDoctor ? existingDoctor._id : new Types.ObjectId() },
      { $set: updateData }, // The new data to apply
      {
        returnDocument: 'after', // Return the updated document
        upsert: true, // Create a new document if one isn't found
        runValidators: true, // Run schema validations on update
      },
    );

    return savedDoctor;
  }

  async getDoctorProfile(userId: string): Promise<Doctor> {
    const doctorProfile = await this.doctorModel.findOne({
      userId: { $in: [userId, new Types.ObjectId(userId)] },
    });

    if (!doctorProfile) {
      throw new NotFoundException('Doctor profile not found for this user.');
    }

    return doctorProfile;
  }

  async assertVideoConsultationMethodAllowed(
    doctorId: string,
    method?: string,
  ) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('allowWhatsAppVideoConsultation');
    if (!doctor) throw new NotFoundException('Doctor not found.');
    if (method === 'whatsapp' && !doctor.allowWhatsAppVideoConsultation) {
      throw new BadRequestException(
        'This doctor only allows video consultation on the platform.',
      );
    }
  }

  async addPatientToDoctor(
    patientId: string,
    patientSeatDto: PatientSeatDto,
  ): Promise<Doctor> {
    const {
      doctorId,
      startTime,
      endTime,
      appointmentType,
      paymentMethod,
      mobileWalletNumber,
      bankTransferReceiptUrl,
      patientName,
      patientAge,
      patientPhone,
      patientGender,
      videoConsultationMethod,
    } = patientSeatDto;

    if (paymentMethod === 'bank_transfer' && !bankTransferReceiptUrl) {
      throw new BadRequestException(
        'A bank transfer receipt screenshot is required.',
      );
    }

    // 1. Validate Doctor and Patient exist
    const doctor = await this.doctorModel.findById(doctorId);
    if (!doctor) throw new NotFoundException('Doctor not found.');

    if (
      (appointmentType === 'Video' || appointmentType === 'Online') &&
      videoConsultationMethod === 'whatsapp' &&
      !doctor.allowWhatsAppVideoConsultation
    ) {
      throw new BadRequestException(
        'This doctor only allows video consultation on the platform.',
      );
    }

    const patient = await this.userModel.findById(patientId);
    if (!patient) throw new NotFoundException('Patient not found.');

    // 2. Validate time logic
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time.');
    }

    // 3. Check if slot is already booked for this doctor
    const isSlotTaken = await this.patientsOfDoctor.findOne({
      doctorId,
      appointments: {
        $elemMatch: { startTime, status: { $ne: 'cancelled' } },
      },
    });

    if (isSlotTaken) {
      throw new BadRequestException('This slot is already booked.');
    }

    // 4. Ensure patient record exists
    const { email, _id } = patient;
    const patientRecord = await this.patientService.createPatient(email, _id);
    let profileAge: number | undefined;
    if ((patientRecord as any).dateOfBirth) {
      const birthDate = new Date((patientRecord as any).dateOfBirth);
      const today = new Date();
      profileAge = today.getFullYear() - birthDate.getFullYear();
      if (
        today <
        new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())
      )
        profileAge -= 1;
    }
    const bookingPatientName =
      patientName ||
      (patientRecord as any).fullName ||
      (patient as any).name ||
      email;
    const bookingPatientAge = patientAge || profileAge || 1;
    const bookingPatientPhone =
      patientPhone || (patientRecord as any).phoneNumber || 'Not provided';
    const bookingPatientGender =
      patientGender || (patientRecord as any).gender || 'Not provided';

    // 5. Push appointment with all fields from frontend
    const updatedDoctorRecord = await this.patientsOfDoctor.findOneAndUpdate(
      { doctorId },
      {
        $push: {
          appointments: {
            patientId: new Types.ObjectId(patientId),
            startTime,
            endTime,
            appointmentType, // ✅ new
            paymentMethod, // ✅ new
            mobileWalletNumber, // ✅ new
            bankTransferReceiptUrl,
            status: 'confirmed',
            patientName: bookingPatientName,
            patientAge: bookingPatientAge,
            patientPhone: bookingPatientPhone,
            patientGender: bookingPatientGender,
            videoConsultationMethod:
              appointmentType === 'Video' || appointmentType === 'Online'
                ? videoConsultationMethod || 'platform'
                : undefined,
          },
        },
      },
      { returnDocument: 'after', upsert: true },
    );

    if (paymentMethod === 'bank_transfer' && bankTransferReceiptUrl) {
      const appointment = updatedDoctorRecord?.appointments
        .filter((item) => item.patientId.toString() === patientId)
        .at(-1) as any;

      if (!appointment?._id) {
        throw new BadRequestException('Could not save the payment receipt.');
      }

      await this.patientModel.findOneAndUpdate(
        { userId: new Types.ObjectId(patientId) },
        {
          $push: {
            paymentReceipts: {
              doctorId: new Types.ObjectId(doctorId),
              appointmentId: appointment._id,
              url: bankTransferReceiptUrl,
              paymentMethod: 'bank_transfer',
            },
          },
        },
      );
    }

    // Emit realtime event
    this.realtimeService.emit('appointment_booked', {
      doctorId,
      startTime,
      endTime,
      status: 'confirmed',
    });

    return doctor;
  }

  //    async getPatientsOfDoctor(doctorId: string): Promise<any[]> {
  //     // 1. Find the doctor's appointment records
  //     const doctorRecord = await this.patientsOfDoctor.findOne({ doctorId: doctorId }).exec();

  //     // 2. Handle empty states gracefully
  //     if (!doctorRecord || !doctorRecord.appointments || doctorRecord.appointments.length === 0) {
  //         return [];
  //     }

  //     // 3. Remove duplicates (This works perfectly because your IDs are already strings!)
  //     const uniquePatientIds = [...new Set(doctorRecord.appointments.map(app => app.patientId))];

  //     // 4. Fetch the patients securely
  //     const patients = await this.userModel.find({
  //         _id: { $in: uniquePatientIds } // Mongoose will automatically cast these strings to ObjectIds for the search
  //     })
  //     .select('-password -resetOtp -otpExpires') // 👈 CRITICAL: Never send these to the frontend!
  //     .exec();

  //     return patients;
  // }

  async getPatientsOfDoctor(userIdFromToken: string): Promise<any[]> {
    // 1. Find the Doctor Profile that belongs to this logged-in User or auto-create it
    let doctorProfile = await this.doctorModel
      .findOne({
        userId: { $in: [userIdFromToken, new Types.ObjectId(userIdFromToken)] },
      })
      .exec();

    if (!doctorProfile) {
      const user = await this.userModel.findById(userIdFromToken);
      if (!user) {
        throw new NotFoundException('Doctor user account not found.');
      }
      doctorProfile = new this.doctorModel({
        userId: new Types.ObjectId(userIdFromToken),
        fullName: user.name || 'Dr. ' + user.email.split('@')[0],
        email: user.email,
        phoneNumber: '03001234567',
        specialization: 'General Practice',
        experienceYears: 1,
        availability: [],
      });
      await doctorProfile.save();
    }

    const actualDoctorId = doctorProfile._id.toString();

    // 2. Search the appointments using the CORRECT Doctor ID
    const doctorRecord = await this.patientsOfDoctor
      .findOne({ doctorId: actualDoctorId })
      .exec();

    if (
      !doctorRecord ||
      !doctorRecord.appointments ||
      doctorRecord.appointments.length === 0
    ) {
      throw new BadRequestException('No patients found for this doctor.');
    }

    // 3. Remove duplicates to avoid fetching the same user multiple times from the DB
    const uniquePatientIds = [
      ...new Set(
        doctorRecord.appointments.map((app) => app.patientId.toString()),
      ),
    ].map((id) => new Types.ObjectId(id));

    // 4. Fetch the patients securely
    const patients = await this.userModel
      .find({
        _id: { $in: uniquePatientIds },
      })
      .select('-password -resetOtp -otpExpires -isOtpVerified')
      .lean() // 👈 CRITICAL UPDATE: .lean() strips Mongoose metadata and returns a plain JavaScript object
      .exec();

    // 4b. Fetch the Patient profiles (medicalRecords with reports) for each unique patient
    const patientProfiles = await this.patientModel
      .find({ userId: { $in: uniquePatientIds } })
      .lean()
      .exec();

    // 5. Merge the appointment times with the patient profiles
    const appointmentsWithPatientDetails = doctorRecord.appointments.map(
      (appointment) => {
        // Find the matching patient profile for this specific appointment
        const patientProfile = patients.find(
          (p) => p._id.toString() === appointment.patientId.toString(),
        );

        // Find the matching Patient document (has medicalRecords/reports)
        const patientDoc = patientProfiles.find(
          (p: any) => p.userId?.toString() === appointment.patientId.toString(),
        );

        // Filter the medical records to only return those belonging to this specific doctor
        const filteredMedicalRecords = patientDoc
          ? (patientDoc as any).medicalRecords.filter(
              (rec: any) =>
                rec.doctorId?.toString() === actualDoctorId ||
                rec.doctorId?.toString() === doctorProfile.userId?.toString(),
            )
          : [];

        // Return a new object containing everything
        return {
          ...patientProfile,
          appointmentId: (appointment as any)._id
            ? (appointment as any)._id.toString()
            : undefined,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          appointmentType: appointment.appointmentType,
          paymentMethod: appointment.paymentMethod,
          status: appointment.status,
          tokenNumber: (appointment as any).tokenNumber,
          mobileWalletNumber: (appointment as any).mobileWalletNumber,
          bankTransferReceiptUrl: (appointment as any).bankTransferReceiptUrl,
          medicalRecords: filteredMedicalRecords,
          patientDocId: patientDoc
            ? (patientDoc as any)._id?.toString()
            : undefined,
          patientName: (appointment as any).patientName,
          patientAge: (appointment as any).patientAge,
          patientPhone: (appointment as any).patientPhone,
          patientGender: (appointment as any).patientGender,
          videoConsultationMethod: (appointment as any).videoConsultationMethod,
          videoCallStatus: (appointment as any).videoCallStatus,
          videoStartedAt: (appointment as any).videoStartedAt,
          videoEndedAt: (appointment as any).videoEndedAt,
          videoCallEndsAt: (appointment as any).videoCallEndsAt,
          videoPausedBy: (appointment as any).videoPausedBy,
          videoRecordingUrl: (appointment as any).videoRecordingUrl,
        };
      },
    );

    return appointmentsWithPatientDetails;
  }

  async updateAppointmentStatus(
    appointmentId: string,
    status: string,
  ): Promise<any> {
    const { Types } = require('mongoose');
    const updated = await this.patientsOfDoctor.findOneAndUpdate(
      { 'appointments._id': new Types.ObjectId(appointmentId) },
      { $set: { 'appointments.$.status': status } },
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
      });
    }
    return updated;
  }

  async updateAvailability(
    userId: string,
    availability: any[],
    isVideoEnabled?: boolean,
    allowWhatsAppVideoConsultation?: boolean,
  ): Promise<Doctor> {
    const existingDoctor = await this.doctorModel.findOne({
      userId: { $in: [userId, new Types.ObjectId(userId)] },
    });
    if (!existingDoctor) {
      throw new NotFoundException('Doctor profile not found.');
    }
    const updatePayload: any = { availability };
    if (isVideoEnabled !== undefined) {
      updatePayload.isVideoEnabled = isVideoEnabled;
    }
    if (allowWhatsAppVideoConsultation !== undefined) {
      updatePayload.allowWhatsAppVideoConsultation =
        allowWhatsAppVideoConsultation;
    }
    const doctor = await this.doctorModel.findOneAndUpdate(
      { _id: existingDoctor._id },
      { $set: updatePayload },
      { new: true, runValidators: true },
    );
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found.');
    }
    this.realtimeService.emit('availability_updated', {
      doctorId: doctor._id,
      availability,
      isVideoEnabled: doctor.isVideoEnabled !== false,
      allowWhatsAppVideoConsultation:
        doctor.allowWhatsAppVideoConsultation === true,
    });
    return doctor;
  }

  private async compressConsultationVideo(inputPath: string): Promise<string> {
    const executablePath = ffmpegPath;
    if (!executablePath) {
      throw new Error('FFmpeg is not available for video compression.');
    }
    const outputPath = `${inputPath}-compressed.mp4`;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executablePath, [
        '-y',
        '-i',
        inputPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-vf',
        'scale=-2:480',
        '-crf',
        '34',
        '-maxrate',
        '400k',
        '-bufsize',
        '800k',
        '-c:a',
        'aac',
        '-b:a',
        '48k',
        '-movflags',
        '+faststart',
        outputPath,
      ]);
      let errorOutput = '';
      child.stderr.on('data', (chunk) => {
        errorOutput = (errorOutput + chunk.toString()).slice(-4000);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `Video compression failed (FFmpeg exit ${code}). ${errorOutput}`,
            ),
          );
      });
    });
    return outputPath;
  }

  async uploadConsultationRecording(
    doctorUserId: string,
    appointmentId: string,
    file: Express.Multer.File,
  ): Promise<{ url: string; originalSize: number; compressedSize: number }> {
    if (!file) throw new BadRequestException('No video recording uploaded.');
    const hasVideoMimeType = file.mimetype?.startsWith('video/');
    const hasVideoExtension = /\.(webm|mp4|mov|m4v)$/i.test(
      file.originalname || '',
    );
    if (!hasVideoMimeType && !hasVideoExtension) {
      throw new BadRequestException(
        'The consultation recording must be a WebM, MP4, MOV, or M4V video.',
      );
    }
    if (file.size > 250 * 1024 * 1024) {
      throw new BadRequestException(
        'The consultation recording must be 250 MB or smaller.',
      );
    }

    const appointmentObjectId = new Types.ObjectId(appointmentId);
    const record = await this.patientsOfDoctor.findOne({
      'appointments._id': appointmentObjectId,
    });
    if (!record) throw new NotFoundException('Appointment not found.');

    const ownsAppointment = await this.doctorModel.exists({
      _id: record.doctorId,
      userId: { $in: [doctorUserId, new Types.ObjectId(doctorUserId)] },
    });
    if (!ownsAppointment) {
      throw new ForbiddenException(
        'This appointment does not belong to the authenticated doctor.',
      );
    }

    let compressedPath: string | undefined;
    try {
      compressedPath = await this.compressConsultationVideo(file.path);
      const compressedStats = await fs.stat(compressedPath);
      const result =
        await this.cloudinaryService.uploadConsultationVideo(compressedPath);
      const updated = await this.patientsOfDoctor.findOneAndUpdate(
        {
          _id: record._id,
          'appointments._id': appointmentObjectId,
        },
        {
          $set: {
            'appointments.$.videoRecordingUrl': result.secure_url,
            'appointments.$.videoCallStatus': 'completed',
            'appointments.$.videoEndedAt': new Date(),
          },
        },
        { new: true },
      );
      if (!updated) throw new NotFoundException('Appointment not found.');
      return {
        url: result.secure_url,
        originalSize: file.size,
        compressedSize: compressedStats.size,
      };
    } finally {
      if (compressedPath)
        await fs.unlink(compressedPath).catch(() => undefined);
      if (file?.path) await fs.unlink(file.path).catch(() => undefined);
    }
  }

  async uploadReceiptImage(
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('The receipt must be an image.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException(
        'The receipt image must be 5 MB or smaller.',
      );
    }
    try {
      const result = await this.cloudinaryService.uploadPaymentReceipt(
        file.path,
      );
      return { url: result.secure_url };
    } finally {
      if (file?.path) {
        await fs
          .unlink(file.path)
          .catch((err) => console.error('Error deleting temp file:', err));
      }
    }
  }
}
