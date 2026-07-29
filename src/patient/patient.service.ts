import { Doctor } from 'src/doctor/schemas/doctor.schema/doctor.schema';
import { PatientsOfDoctor } from 'src/doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Patient } from './schemas/patient.schema'; // Update with your actual path
import { AddMedicalRecordDto, CreatePatientDto } from './dto/patient.dto';

@Injectable()
export class PatientService {
  constructor(
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(PatientsOfDoctor.name) private patientsOfDoctor: Model<PatientsOfDoctor>,
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

  async getAllDoctors(): Promise<Doctor[]> {
    return this.doctorModel.find().exec();
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
      'appointments.patientId': new Types.ObjectId(patientUserId)
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
}
