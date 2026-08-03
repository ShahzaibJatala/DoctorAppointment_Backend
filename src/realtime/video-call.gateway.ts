import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { PatientsOfDoctor } from '../doctor/schemas/patients-of-doctor.schema/patients-of-doctor.schema';
import { Doctor } from '../doctor/schemas/doctor.schema/doctor.schema';

type CallSocket = Socket & {
  data: {
    user?: { sub: string; role: string };
    calls?: Record<string, 'doctor' | 'patient'>;
  };
};

const configuredFrontendOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedFrontendOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://doctor-appointment-system-seven-xi.vercel.app',
  ...configuredFrontendOrigins,
]);

function isPrivateDevelopmentOrigin(origin: string) {
  if (process.env.NODE_ENV === 'production') return false;

  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

@WebSocketGateway({
  namespace: '/video-calls',
  cors: {
    origin: (origin, callback) => {
      // Native clients do not send Origin. Browsers must be from the configured
      // frontend, or from a local/private address while developing on the LAN.
      const allowed =
        !origin ||
        allowedFrontendOrigins.has(origin) ||
        isPrivateDevelopmentOrigin(origin);
      callback(allowed ? null : new Error('Origin is not allowed.'), allowed);
    },
    credentials: true,
  },
})
export class VideoCallGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly callTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly ringingTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly ringingTimeoutMs = 45_000;

  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(PatientsOfDoctor.name)
    private readonly patientsOfDoctor: Model<PatientsOfDoctor>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<Doctor>,
  ) {}

  handleConnection(client: CallSocket) {
    try {
      const rawToken =
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!rawToken) throw new Error('Missing token');
      client.data.user = this.jwtService.verify(rawToken);
      client.data.calls = {};
      void client.join(this.userRoom(client.data.user.sub));
    } catch {
      client.emit('call-error', { message: 'Authentication failed.' });
      client.disconnect();
    }
  }

  handleDisconnect(client: CallSocket) {
    Object.entries(client.data.calls || {}).forEach(([appointmentId, role]) => {
      this.server
        .to(this.room(appointmentId))
        .emit('participant-disconnected', { role });
    });
  }

  private room(appointmentId: string) {
    return `appointment:${appointmentId}`;
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private scheduleCompletion(appointmentId: string, remainingMs: number) {
    const currentTimer = this.callTimers.get(appointmentId);
    if (currentTimer) clearTimeout(currentTimer);
    this.callTimers.set(
      appointmentId,
      setTimeout(
        () => this.completeCall(appointmentId, 'time-completed'),
        remainingMs,
      ),
    );
  }

  private clearCompletionTimer(appointmentId: string) {
    const timer = this.callTimers.get(appointmentId);
    if (timer) clearTimeout(timer);
    this.callTimers.delete(appointmentId);
  }

  private clearRingingTimer(appointmentId: string) {
    const timer = this.ringingTimers.get(appointmentId);
    if (timer) clearTimeout(timer);
    this.ringingTimers.delete(appointmentId);
  }

  private scheduleRingingExpiry(
    appointmentId: string,
    timeoutMs = this.ringingTimeoutMs,
  ) {
    this.clearRingingTimer(appointmentId);
    this.ringingTimers.set(
      appointmentId,
      setTimeout(
        () => this.expireRingingCall(appointmentId),
        Math.max(1_000, timeoutMs),
      ),
    );
  }

  private async expireRingingCall(appointmentId: string) {
    this.clearRingingTimer(appointmentId);
    const result = await this.patientsOfDoctor.updateOne(
      {
        appointments: {
          $elemMatch: {
            _id: new Types.ObjectId(appointmentId),
            videoCallStatus: 'ringing',
          },
        },
      },
      {
        $set: {
          'appointments.$.videoCallStatus': 'scheduled',
          'appointments.$.videoRemainingMs': 0,
        },
        $unset: {
          'appointments.$.videoRingingAt': 1,
          'appointments.$.videoCallEndsAt': 1,
          'appointments.$.videoPausedBy': 1,
        },
      },
    );
    if (result.modifiedCount) {
      this.server.to(this.room(appointmentId)).emit('call-missed', {
        message: 'The call invitation expired. The doctor can call again.',
      });
    }
  }

  private async authorize(client: CallSocket, appointmentId: string) {
    if (!Types.ObjectId.isValid(appointmentId) || !client.data.user?.sub) {
      throw new Error('Invalid appointment.');
    }
    const record = await this.patientsOfDoctor.findOne({
      'appointments._id': new Types.ObjectId(appointmentId),
    });
    if (!record) throw new Error('Appointment not found.');
    const appointment = record.appointments.find(
      (item: any) => item._id.toString() === appointmentId,
    ) as any;
    const userId = client.data.user.sub;
    let role: 'doctor' | 'patient';
    if (appointment.patientId.toString() === userId) {
      role = 'patient';
    } else {
      const doctor = await this.doctorModel.findOne({
        _id: record.doctorId,
        userId: { $in: [userId, new Types.ObjectId(userId)] },
      });
      if (!doctor) throw new Error('You cannot access this call.');
      role = 'doctor';
    }
    return { appointment, role, record };
  }

  private async joinAuthorized(client: CallSocket, appointmentId: string) {
    const context = await this.authorize(client, appointmentId);
    await client.join(this.room(appointmentId));
    client.data.calls = {
      ...(client.data.calls || {}),
      [appointmentId]: context.role,
    };
    return context;
  }

  @SubscribeMessage('join-call')
  async joinCall(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string },
  ) {
    try {
      const { appointment, role } = await this.joinAuthorized(
        client,
        body.appointmentId,
      );
      if (appointment.videoCallStatus === 'ringing') {
        const ringingAt = appointment.videoRingingAt
          ? new Date(appointment.videoRingingAt).getTime()
          : 0;
        const remainingRingMs =
          this.ringingTimeoutMs - (Date.now() - ringingAt);
        if (!ringingAt || remainingRingMs <= 0) {
          await this.expireRingingCall(body.appointmentId);
          appointment.videoCallStatus = 'scheduled';
          appointment.videoRemainingMs = 0;
          appointment.videoRingingAt = undefined;
        } else {
          this.scheduleRingingExpiry(body.appointmentId, remainingRingMs);
        }
      }
      if (appointment.videoCallStatus === 'active') {
        const remainingCallMs =
          new Date(appointment.videoCallEndsAt).getTime() - Date.now();
        if (!appointment.videoCallEndsAt || remainingCallMs <= 0) {
          await this.completeCall(body.appointmentId, 'time-completed');
          appointment.videoCallStatus = 'completed';
          appointment.videoRemainingMs = 0;
          appointment.videoCallEndsAt = undefined;
        } else {
          appointment.videoRemainingMs = remainingCallMs;
          this.scheduleCompletion(body.appointmentId, remainingCallMs);
        }
      }
      client.emit('call-state', {
        role,
        status: appointment.videoCallStatus || 'scheduled',
        ringingAt: appointment.videoRingingAt,
        endsAt: appointment.videoCallEndsAt,
        remainingMs: appointment.videoRemainingMs,
        pausedBy: appointment.videoPausedBy,
        method: appointment.videoConsultationMethod || 'platform',
      });
      client
        .to(this.room(body.appointmentId))
        .emit('participant-joined', { role });
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }

  @SubscribeMessage('doctor-start-call')
  async startCall(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string },
  ) {
    try {
      const { appointment, role, record } = await this.joinAuthorized(
        client,
        body.appointmentId,
      );
      if (role !== 'doctor')
        throw new Error('Only the doctor can start this call.');
      if ((appointment.videoConsultationMethod || 'platform') !== 'platform') {
        throw new Error('This patient selected WhatsApp consultation.');
      }

      const durationMs = Math.max(
        60_000,
        new Date(appointment.endTime).getTime() -
          new Date(appointment.startTime).getTime(),
      );
      const ringingAt = new Date();
      this.clearCompletionTimer(body.appointmentId);
      await this.patientsOfDoctor.updateOne(
        { 'appointments._id': new Types.ObjectId(body.appointmentId) },
        {
          $set: {
            'appointments.$.videoCallStatus': 'ringing',
            'appointments.$.videoRemainingMs': durationMs,
            'appointments.$.videoRingingAt': ringingAt,
            'appointments.$.videoPausedBy': null,
          },
          $unset: {
            'appointments.$.videoStartedAt': 1,
            'appointments.$.videoCallEndsAt': 1,
          },
        },
      );
      this.scheduleRingingExpiry(body.appointmentId);
      const callingDoctor = await this.doctorModel
        .findById(record.doctorId)
        .select('fullName')
        .lean();
      this.server
        .to([
          this.room(body.appointmentId),
          this.userRoom(appointment.patientId.toString()),
        ])
        .emit('incoming-call', {
          appointmentId: body.appointmentId,
          durationMs,
          doctorName: (callingDoctor as any)?.fullName || 'Your doctor',
          ringingAt: ringingAt.toISOString(),
        });
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }
  @SubscribeMessage('sync-incoming-calls')
  async syncIncomingCalls(@ConnectedSocket() client: CallSocket) {
    try {
      const patientId = client.data.user?.sub;
      if (!patientId || !Types.ObjectId.isValid(patientId)) return;

      const records = await this.patientsOfDoctor
        .find({
          appointments: {
            $elemMatch: {
              patientId: new Types.ObjectId(patientId),
              videoCallStatus: 'ringing',
            },
          },
        })
        .lean();

      for (const record of records as any[]) {
        const callingDoctor = await this.doctorModel
          .findById(record.doctorId)
          .select('fullName')
          .lean();
        for (const appointment of record.appointments || []) {
          if (
            appointment.patientId?.toString() !== patientId ||
            appointment.videoCallStatus !== 'ringing'
          ) {
            continue;
          }
          const ringingAt = appointment.videoRingingAt
            ? new Date(appointment.videoRingingAt)
            : null;
          const remainingRingMs = ringingAt
            ? this.ringingTimeoutMs - (Date.now() - ringingAt.getTime())
            : 0;
          if (!ringingAt || remainingRingMs <= 0) {
            await this.expireRingingCall(appointment._id.toString());
            continue;
          }
          this.scheduleRingingExpiry(
            appointment._id.toString(),
            remainingRingMs,
          );
          client.emit('incoming-call', {
            appointmentId: appointment._id.toString(),
            durationMs: Number(appointment.videoRemainingMs || 0),
            doctorName: (callingDoctor as any)?.fullName || 'Your doctor',
            ringingAt: ringingAt.toISOString(),
          });
        }
      }
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }
  @SubscribeMessage('patient-accept-call')
  async acceptCall(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string },
  ) {
    try {
      const { appointment, role } = await this.joinAuthorized(
        client,
        body.appointmentId,
      );
      if (role !== 'patient')
        throw new Error('Only the patient can accept the call.');
      if (appointment.videoCallStatus !== 'ringing')
        throw new Error('This call is no longer waiting for acceptance.');

      const fallbackDuration = Math.max(
        60_000,
        new Date(appointment.endTime).getTime() -
          new Date(appointment.startTime).getTime(),
      );
      const remainingMs = Math.max(
        1_000,
        Number(appointment.videoRemainingMs) || fallbackDuration,
      );
      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + remainingMs);
      this.clearRingingTimer(body.appointmentId);
      await this.patientsOfDoctor.updateOne(
        { 'appointments._id': new Types.ObjectId(body.appointmentId) },
        {
          $set: {
            'appointments.$.videoCallStatus': 'active',
            'appointments.$.videoStartedAt': startedAt,
            'appointments.$.videoCallEndsAt': endsAt,
            'appointments.$.videoRemainingMs': remainingMs,
          },
          $unset: { 'appointments.$.videoRingingAt': 1 },
        },
      );
      this.scheduleCompletion(body.appointmentId, remainingMs);
      this.server.to(this.room(body.appointmentId)).emit('call-accepted', {
        appointmentId: body.appointmentId,
        startedAt,
        endsAt,
        remainingMs,
      });
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }
  @SubscribeMessage('webrtc-signal')
  async signal(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string; signal: any },
  ) {
    try {
      await this.joinAuthorized(client, body.appointmentId);
      client
        .to(this.room(body.appointmentId))
        .emit('webrtc-signal', { signal: body.signal });
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }

  @SubscribeMessage('recording-ready')
  async recordingReady(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string; url: string },
  ) {
    try {
      const { appointment, role } = await this.joinAuthorized(
        client,
        body.appointmentId,
      );
      if (role !== 'doctor')
        throw new Error(
          'Only the doctor can publish a consultation recording.',
        );
      if (
        !appointment.videoRecordingUrl ||
        appointment.videoRecordingUrl !== body.url
      ) {
        throw new Error('The consultation recording has not been saved.');
      }
      this.server.to(this.room(body.appointmentId)).emit('recording-ready', {
        appointmentId: body.appointmentId,
        url: appointment.videoRecordingUrl,
      });
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }

  @SubscribeMessage('pause-call')
  async pauseCall(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string },
  ) {
    try {
      const { appointment, role } = await this.joinAuthorized(
        client,
        body.appointmentId,
      );
      if (appointment.videoCallStatus !== 'active')
        throw new Error('Only an active call can be paused.');

      const remainingMs = Math.max(
        1_000,
        new Date(appointment.videoCallEndsAt).getTime() - Date.now(),
      );
      this.clearCompletionTimer(body.appointmentId);
      await this.patientsOfDoctor.updateOne(
        { 'appointments._id': new Types.ObjectId(body.appointmentId) },
        {
          $set: {
            'appointments.$.videoCallStatus': 'paused',
            'appointments.$.videoPausedBy': role,
            'appointments.$.videoRemainingMs': remainingMs,
          },
          $unset: { 'appointments.$.videoCallEndsAt': 1 },
        },
      );
      this.server
        .to(this.room(body.appointmentId))
        .emit('call-paused', { pausedBy: role, remainingMs });
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }
  @SubscribeMessage('resume-request')
  async requestResume(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string },
  ) {
    try {
      const { role } = await this.joinAuthorized(client, body.appointmentId);
      client
        .to(this.room(body.appointmentId))
        .emit('resume-requested', { requestedBy: role });
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }

  @SubscribeMessage('resume-call')
  async resumeCall(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string },
  ) {
    try {
      const { appointment, role } = await this.joinAuthorized(
        client,
        body.appointmentId,
      );
      if (appointment.videoCallStatus !== 'paused')
        throw new Error('This call is not paused.');
      if (appointment.videoPausedBy && appointment.videoPausedBy !== role) {
        throw new Error(
          'Only the participant who paused the video can resume it.',
        );
      }

      const remainingMs = Math.max(
        1_000,
        Number(appointment.videoRemainingMs) || 1_000,
      );
      const endsAt = new Date(Date.now() + remainingMs);
      await this.patientsOfDoctor.updateOne(
        { 'appointments._id': new Types.ObjectId(body.appointmentId) },
        {
          $set: {
            'appointments.$.videoCallStatus': 'active',
            'appointments.$.videoCallEndsAt': endsAt,
            'appointments.$.videoRemainingMs': remainingMs,
          },
          $unset: { 'appointments.$.videoPausedBy': 1 },
        },
      );
      this.scheduleCompletion(body.appointmentId, remainingMs);
      this.server
        .to(this.room(body.appointmentId))
        .emit('call-resumed', { endsAt, remainingMs });
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }
  @SubscribeMessage('call-time-expired')
  async timeExpired(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string },
  ) {
    try {
      const { appointment } = await this.joinAuthorized(
        client,
        body.appointmentId,
      );
      const endsAt = appointment.videoCallEndsAt
        ? new Date(appointment.videoCallEndsAt).getTime()
        : 0;
      if (
        appointment.videoCallStatus === 'active' &&
        endsAt &&
        endsAt <= Date.now() + 1_500
      ) {
        await this.completeCall(body.appointmentId, 'time-completed');
      }
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }

  @SubscribeMessage('doctor-end-call')
  async endCall(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() body: { appointmentId: string },
  ) {
    try {
      const { role } = await this.joinAuthorized(client, body.appointmentId);
      if (role !== 'doctor')
        throw new Error('Only the doctor can end the call.');
      await this.completeCall(body.appointmentId, 'doctor-completed');
    } catch (error: any) {
      client.emit('call-error', { message: error.message });
    }
  }

  private async completeCall(appointmentId: string, reason: string) {
    this.clearCompletionTimer(appointmentId);
    this.clearRingingTimer(appointmentId);
    const result = await this.patientsOfDoctor.updateOne(
      {
        appointments: {
          $elemMatch: {
            _id: new Types.ObjectId(appointmentId),
            videoCallStatus: { $ne: 'completed' },
          },
        },
      },
      {
        $set: {
          'appointments.$.videoCallStatus': 'completed',
          'appointments.$.videoEndedAt': new Date(),
          'appointments.$.videoRemainingMs': 0,
        },
        $unset: {
          'appointments.$.videoPausedBy': 1,
          'appointments.$.videoCallEndsAt': 1,
          'appointments.$.videoRingingAt': 1,
        },
      },
    );
    if (result.modifiedCount) {
      this.server.to(this.room(appointmentId)).emit('call-ended', { reason });
    }
  }
}
