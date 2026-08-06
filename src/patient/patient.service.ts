import { Doctor } from 'src/doctor/schemas/doctor.schema/doctor.schema';
import { PatientsOfDoctor } from 'src/doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Patient } from './schemas/patient.schema'; // Update with your actual path
import { AddMedicalRecordDto, CreatePatientDto } from './dto/patient.dto';
import { UserAuth } from 'src/auth/user.schema';


const SYMPTOM_SPECIALTIES: Record<string, string[]> = {
  cardiology: ['heart', 'chest pain', 'blood pressure', 'palpitation'],
  dermatology: ['skin', 'rash', 'acne', 'hair loss', 'allergy'],
  neurology: ['headache', 'migraine', 'seizure', 'dizziness'],
  pediatrics: ['child', 'children', 'baby', 'infant'],
  orthopedics: ['bone', 'joint', 'back pain', 'knee pain', 'fracture'],
  psychiatry: ['anxiety', 'depression', 'stress', 'mental health'],
  'general practice': ['fever', 'cold', 'cough', 'flu', 'general'],
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const levenshtein = (left: string, right: string) => {
  const matrix = Array.from({ length: right.length + 1 }, (_, row) => [row]);
  for (let column = 0; column <= left.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= right.length; row += 1) {
    for (let column = 1; column <= left.length; column += 1) {
      matrix[row][column] = right[row - 1] === left[column - 1]
        ? matrix[row - 1][column - 1]
        : Math.min(matrix[row - 1][column - 1], matrix[row][column - 1], matrix[row - 1][column]) + 1;
    }
  }
  return matrix[right.length][left.length];
};

const relatedSearchTerms = (query: string) => {
  const normalized = query.toLowerCase().trim();
  const terms = new Set([normalized]);
  Object.entries(SYMPTOM_SPECIALTIES).forEach(([specialty, symptoms]) => {
    if (specialty.includes(normalized) || symptoms.some(symptom => symptom.includes(normalized) || normalized.includes(symptom))) {
      terms.add(specialty);
      symptoms.forEach(symptom => terms.add(symptom));
    }
  });
  return [...terms].filter(Boolean);
};
@Injectable()
export class PatientService {
  constructor(
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(PatientsOfDoctor.name) private patientsOfDoctor: Model<PatientsOfDoctor>,
    @InjectModel(UserAuth.name) private userModel: Model<UserAuth>,
  ) {}

  async createPatient(
    email: string,
    userId: string | Types.ObjectId,
  ): Promise<Patient> {
    // Types.ObjectId handles both strings and existing ObjectIds perfectly
    const patient = await this.patientModel.findOneAndUpdate(
      { userId: userId }, // 1. Look for this patient
      { $setOnInsert: { userId: userId } }, // 2. If not found, set these fields
      {
        upsert: true, // 3. Create a new doc if none is found
        returnDocument: 'after', // 4. Return the new/existing document
      },
    );

    return patient;
  }

  async getPatientById(id: string): Promise<Patient | null> {
    return this.patientModel.findById(id).exec();
  }

  async getAllPatients(): Promise<Patient[]> {
    return this.patientModel.find().exec();
  }

  async updatePatient(id: string, patient: Patient): Promise<Patient | null> {
    return this.patientModel
      .findByIdAndUpdate(id, patient, { new: true })
      .exec();
  }

  async getAllDoctors(): Promise<any[]> {
    // Fetch only verified doctor profiles
    const doctors = await this.doctorModel.find({ isVerified: true }).lean().exec();
    // Get suspended user IDs to exclude
    const suspendedUsers = await this.userModel
      .find({ role: 'doctor', status: 'Suspended' })
      .select('_id')
      .lean()
      .exec();
    const suspendedIds = new Set(suspendedUsers.map((u) => u._id.toString()));
    const activeDoctors = doctors.filter(
      (d: any) => !suspendedIds.has(d.userId?.toString()),
    );
    return this.formatDoctors(activeDoctors);
  }

  async getDoctorById(doctorId: string): Promise<Doctor | null> {
    const doctor = await this.doctorModel.findById(doctorId).lean().exec();
    if (!doctor) return null;
    
    // Check if doctor is verified and not suspended
    if (!doctor.isVerified) return null;
    
    const suspendedUsers = await this.userModel
      .find({ role: 'doctor', status: 'Suspended' })
      .select('_id')
      .lean()
      .exec();
    const suspendedIds = new Set(suspendedUsers.map((u) => u._id.toString()));
    
    if (suspendedIds.has(doctor.userId?.toString())) return null;
    
    const formattedDoctors = this.formatDoctors([doctor]);
    return formattedDoctors[0];
  }

  private formatDoctors(doctors: any[]): any[] {
    return doctors.map((doctor: any) => {
      const reviews = doctor.reviews || [];
      const rating = reviews.length
        ? Number((reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / reviews.length).toFixed(1))
        : 0;
      return { ...doctor, rating, reviewCount: reviews.length, reviewsCount: reviews.length };
    });
  }

  async searchDoctors(query = '', location = '', specialty = ''): Promise<any[]> {
    const terms = relatedSearchTerms(query);
    const filter: any = {};

    if (terms.length) {
      filter.$or = terms.flatMap(term => {
        const regex = new RegExp(escapeRegex(term), 'i');
        return [
          { fullName: regex },
          { specialization: regex },
          { services: regex },
          { city: regex },
          { province: regex },
          { clinicAddress: regex },
        ];
      });
    }
    if (location.trim()) {
      const locationRegex = new RegExp(escapeRegex(location.trim()), 'i');
      filter.$and = [{ $or: [{ city: locationRegex }, { province: locationRegex }, { clinicAddress: locationRegex }] }];
    }
    if (specialty && specialty !== 'All') {
      filter.specialization = new RegExp(`^${escapeRegex(specialty)}$`, 'i');
    }

    // Only show verified doctors on the public listing
    filter.isVerified = true;
    let doctors = await this.doctorModel.find(filter).lean().exec();

    if (doctors.length === 0 && query.trim()) {
      const fallbackFilter = { ...filter };
      delete fallbackFilter.$or;
      const candidates = await this.doctorModel.find(fallbackFilter).lean().exec();
      const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
      doctors = candidates.filter((doctor: any) => {
        const words = [doctor.fullName, doctor.specialization, ...(doctor.services || []), doctor.city, doctor.province]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean);
        return queryWords.some(queryWord => words.some(word =>
          word.includes(queryWord) || queryWord.includes(word) || levenshtein(queryWord, word) <= Math.max(1, Math.floor(queryWord.length / 4)),
        ));
      });
    }

    // Get suspended user IDs to exclude from search results
    const suspendedUsers = await this.userModel
      .find({ role: 'doctor', status: 'Suspended' })
      .select('_id')
      .lean()
      .exec();
    const suspendedIds = new Set(suspendedUsers.map((u) => u._id.toString()));
    doctors = doctors.filter((d: any) => !suspendedIds.has(d.userId?.toString()));

    return this.formatDoctors(doctors);
  }

  async getDoctorSearchSuggestions(query: string): Promise<Array<{ label: string; type: string; value: string }>> {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    const terms = relatedSearchTerms(normalized);
    const regexes = terms.map(term => new RegExp(escapeRegex(term), 'i'));
    const doctors = await this.doctorModel.find({
      $or: regexes.flatMap(regex => [
        { fullName: regex }, { specialization: regex }, { services: regex },
        { city: regex }, { province: regex },
      ]),
    }).select('fullName specialization services city province').limit(8).lean().exec();

    const suggestions = new Map<string, { label: string; type: string; value: string }>();
    const add = (label: string | undefined, type: string) => {
      if (label && !suggestions.has(`${type}:${label}`)) suggestions.set(`${type}:${label}`, { label, type, value: label });
    };
    doctors.forEach((doctor: any) => {
      add(doctor.fullName, 'Doctor');
      add(doctor.specialization, 'Specialization');
      (doctor.services || []).forEach((service: string) => add(service, 'Service'));
      add(doctor.city, 'City');
      add(doctor.province, 'Province');
    });
    terms.forEach(term => Object.keys(SYMPTOM_SPECIALTIES).includes(term) && add(term, 'Specialization'));
    return [...suggestions.values()].slice(0, 8);
  }

  async addDoctorReview(
    doctorId: string,
    patientUserId: string,
    rating: number,
    comment: string,
  ): Promise<Doctor> {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment?.trim()) {
      throw new BadRequestException('A rating from 1 to 5 and a review comment are required.');
    }

    const doctor = await this.doctorModel.findById(doctorId);
    if (!doctor) throw new NotFoundException('Doctor not found.');

    const patient = await this.patientModel.findOne({ userId: new Types.ObjectId(patientUserId) });
    const userName = patient?.fullName || patient?.email?.split('@')[0] || 'Patient';
    const reviews = doctor.reviews as any[];
    const existingReview = reviews.find(review => review.patientId.toString() === patientUserId);

    if (existingReview) {
      existingReview.rating = rating;
      existingReview.comment = comment.trim();
    } else {
      reviews.push({ patientId: new Types.ObjectId(patientUserId), userName, rating, comment: comment.trim() });
    }

    return doctor.save();
  }

  async createProfile(
    userId: string,
    createPatientDto: CreatePatientDto,
  ): Promise<Patient> {
    // Check if profile already exists for this user
    const existingProfile = await this.patientModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (existingProfile) {
      throw new ConflictException(
        'Patient profile already exists for this user.',
      );
    }

    const newPatient = new this.patientModel({
      userId: new Types.ObjectId(userId),
      ...createPatientDto,
    });

    return await newPatient.save();
  }

  /**
   * Get a patient profile by their Auth User ID
   */
  async getProfileByUserId(userId: string): Promise<Patient> {
    const patient = await this.patientModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!patient) {
      throw new NotFoundException('Patient profile not found.');
    }
    return patient;
  }

  /**
   * Get a patient profile by their actual Patient Document _id
   */
  async getProfileById(patientId: string): Promise<Patient> {
    const patient = await this.patientModel.findById(patientId);
    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }
    return patient;
  }

  // ------------------------------------------------------
  // 👨‍⚕️ DOCTOR ACTIONS
  // ------------------------------------------------------

  /**
   * Add a new medical record (Prescription) to the patient's file.
   * Called when the doctor clicks "Save File" in the modal.
   */
  async addMedicalRecord(
    patientId: string,
    doctorId: string,
    recordDto: AddMedicalRecordDto,
  ): Promise<Patient> {
    const doctor = await this.doctorModel.findOne({ userId: doctorId });
    if (!doctor) {
      throw new NotFoundException('Doctor not found to add medical record.');
    }
    // Create the record object matching our Sub-Schema
    const newRecord = {
      doctorId: new Types.ObjectId(doctorId),
      doctorName: doctor.fullName,
      appointmentDate: new Date(recordDto.appointmentDate),
      prescription: recordDto.prescription,
      reasonForVisit: recordDto.reasonForVisit,
      appointmentStatus: recordDto.appointmentStatus || 'Upcomming',
      reports: recordDto.reports || [],
    };

    // Find the patient and $push the new record into their medicalRecords array
    const updatedPatient = await this.patientModel.findOneAndUpdate(
      { userId: new Types.ObjectId(patientId) },
      {
        $push: { medicalRecords: newRecord },
      },
      { returnDocument: 'after' }, // Returns the updated document
    );

    if (!updatedPatient) {
      throw new NotFoundException('Patient not found to add medical record.');
    }

    // Also update the status of the corresponding appointment to 'completed'
    await this.patientsOfDoctor.findOneAndUpdate(
      { 
        doctorId: doctor._id,
        'appointments.patientId': new Types.ObjectId(patientId),
        'appointments.status': { $ne: 'completed' }
      },
      {
        $set: { 'appointments.$.status': 'completed' }
      }
    ).exec();

    return updatedPatient;
  }

  async getMyAppointments(patientUserId: string): Promise<any[]> {
    const records = await this.patientsOfDoctor.find({
      $expr: {
        $in: [
          patientUserId,
          {
            $map: {
              input: '$appointments',
              as: 'appointment',
              in: { $toString: '$$appointment.patientId' },
            },
          },
        ],
      },
    }).exec();

    const appointmentsList: any[] = [];

    for (const record of records) {
      const doctor = await this.doctorModel.findById(record.doctorId).exec();
      const doctorAppointments = record.appointments.filter(
        (app) => app.patientId.toString() === patientUserId
      );

      for (const app of doctorAppointments) {
        appointmentsList.push({
          id: (app as any)._id ? (app as any)._id.toString() : undefined,
          doctorName: doctor?.fullName || 'Doctor',
          specialty: doctor?.specialization || 'Specialist',
          avatar: doctor?.profilePictureUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(doctor?.fullName || 'D')}&background=0D9488&color=fff`,
          date: app.startTime,
          time: app.startTime,
          endTime: app.endTime,
          type: app.appointmentType,
          status: app.status === 'confirmed' ? 'Confirmed' : app.status === 'pending' ? 'Pending' : app.status === 'cancelled' ? 'Cancelled' : app.status,
          tokenNumber: (app as any).tokenNumber,
          doctorId: doctor?._id?.toString(),
          paymentMethod: app.paymentMethod,
          mobileWalletNumber: (app as any).mobileWalletNumber,
          bankTransferReceiptUrl: (app as any).bankTransferReceiptUrl,
          patientName: (app as any).patientName,
          patientAge: (app as any).patientAge,
          patientPhone: (app as any).patientPhone,
          patientGender: (app as any).patientGender,
          videoConsultationMethod: (app as any).videoConsultationMethod,
          videoCallStatus: (app as any).videoCallStatus,
          videoStartedAt: (app as any).videoStartedAt,
          videoEndedAt: (app as any).videoEndedAt,
          videoCallEndsAt: (app as any).videoCallEndsAt,
          videoPausedBy: (app as any).videoPausedBy,
          videoRecordingUrl: (app as any).videoRecordingUrl,
          location: [doctor?.clinicName, doctor?.clinicAddress, doctor?.city, doctor?.province].filter(Boolean).join(', '),
          clinicName: doctor?.clinicName,
          clinicAddress: doctor?.clinicAddress,
          consultationFee: doctor?.consultationFee,
          videoConsultationFee: doctor?.videoConsultationFee,
          doctorPhone: doctor?.phoneNumber,
        });
      }
    }

    appointmentsList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return appointmentsList;
  }

  async addReportToRecord(patientUserId: string, recordId: string, fileUrl: string): Promise<Patient> {
    const updated = await this.patientModel.findOneAndUpdate(
      { 
        userId: new Types.ObjectId(patientUserId),
        'medicalRecords._id': new Types.ObjectId(recordId)
      },
      {
        $push: { 'medicalRecords.$.reports': fileUrl }
      },
      { new: true }
    ).exec();
    if (!updated) {
      throw new NotFoundException('Patient medical record not found.');
    }
    return updated;
  }

  async addReportToRecordAsDoctor(patientId: string, recordId: string, fileUrl: string): Promise<Patient> {
    const updated = await this.patientModel.findOneAndUpdate(
      { 
        _id: new Types.ObjectId(patientId),
        'medicalRecords._id': new Types.ObjectId(recordId)
      },
      {
        $push: { 'medicalRecords.$.reports': fileUrl }
      },
      { new: true }
    ).exec();
    if (!updated) {
      const updatedByUserId = await this.patientModel.findOneAndUpdate(
        { 
          userId: new Types.ObjectId(patientId),
          'medicalRecords._id': new Types.ObjectId(recordId)
        },
        {
          $push: { 'medicalRecords.$.reports': fileUrl }
        },
        { new: true }
      ).exec();
      if (!updatedByUserId) {
        throw new NotFoundException('Patient medical record not found.');
      }
      return updatedByUserId;
    }
    return updated;
  }

  async getDoctorAppointments(doctorId: string): Promise<any[]> {
    const record = await this.patientsOfDoctor.findOne({ doctorId }).exec();
    if (!record || !record.appointments) {
      return [];
    }
    // Return only necessary non-cancelled slot times for security/privacy
    return record.appointments
      .filter(app => app.status !== 'cancelled')
      .map(app => ({
        startTime: app.startTime,
        endTime: app.endTime,
        status: app.status,
      }));
  }
}
