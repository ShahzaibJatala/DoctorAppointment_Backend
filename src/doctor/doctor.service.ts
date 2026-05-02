import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Doctor } from './schemas/doctor.schema/doctor.schema';
import { Model } from 'mongoose';
import { CreateDoctorDto } from './dto/doctor.dto';
import { UserAuth } from 'src/auth/user.schema';
import { CloudinaryService } from './cloudinary.service';
import * as fs from 'fs/promises';
import { PatientSeatDto } from './dto/patientSeat.dto';
import { PatientsOfDoctor } from './schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { PatientService } from 'src/patient/patient.service';

@Injectable()
export class DoctorService {
  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(UserAuth.name) private userModel: Model<UserAuth>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly patientService: PatientService,
    @InjectModel(PatientsOfDoctor.name)
    private readonly patientsOfDoctor: Model<PatientsOfDoctor>,
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
      { userId: userId }, // The search query (find by userId)
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
    const doctorProfile = await this.doctorModel.findOne({ userId: userId });

    if (!doctorProfile) {
      throw new NotFoundException('Doctor profile not found for this user.');
    }

    return doctorProfile;
  }

  async addPatientToDoctor(
    patientId: string,
    patientSeatDto: PatientSeatDto,
  ): Promise<Doctor> {
    const { doctorId, startTime, endTime, appointmentType, paymentMethod } =
      patientSeatDto;

    // 1. Validate Doctor and Patient exist
    const doctor = await this.doctorModel.findById(doctorId);
    if (!doctor) throw new NotFoundException('Doctor not found.');

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
    await this.patientService.createPatient(email, _id);

    // 5. Push appointment with all fields from frontend
    await this.patientsOfDoctor.findOneAndUpdate(
      { doctorId },
      {
        $push: {
          appointments: {
            patientId,
            startTime,
            endTime,
            appointmentType, // ✅ new
            paymentMethod, // ✅ new
            status: 'confirmed',
          },
        },
      },
      { returnDocument: 'after', upsert: true },
    );

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
    // 1. Find the Doctor Profile that belongs to this logged-in User
    const doctorProfile = await this.doctorModel
      .findOne({ userId: userIdFromToken })
      .exec();

    if (!doctorProfile) {
      throw new BadRequestException('Doctor is not found.');
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
      ...new Set(doctorRecord.appointments.map((app) => app.patientId)),
    ];

    // 4. Fetch the patients securely
    const patients = await this.userModel
      .find({
        _id: { $in: uniquePatientIds },
      })
      .select('-password -resetOtp -otpExpires -isOtpVerified')
      .lean() // 👈 CRITICAL UPDATE: .lean() strips Mongoose metadata and returns a plain JavaScript object
      .exec();

    // 5. Merge the appointment times with the patient profiles
    const appointmentsWithPatientDetails = doctorRecord.appointments.map(
      (appointment) => {
        // Find the matching patient profile for this specific appointment
        const patientProfile = patients.find(
          (p) => p._id.toString() === appointment.patientId.toString(),
        );

        // Return a new object containing everything
        return {
          ...patientProfile,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
        };
      },
    );

    return appointmentsWithPatientDetails;
  }
}
