import { Controller, Post, Body, Res, Req, Get, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { AuthGuard } from '@nestjs/passport';
import { RoleGuard } from '../guards/role/role.guard';
import { Roles } from '../guards/role/role.decorators';
import { Role } from '../guards/role/role.enums';
import { DoctorService } from '../doctor/doctor.service';
import { PatientService } from '../patient/patient.service';
import * as crypto from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookingDraft, BookingDraftDocument } from './schemas/booking-draft.schema';

@Controller('payment')
export class StripeController {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
    apiVersion: '2026-04-22.dahlia' as any,
  });

  constructor(
    private readonly doctorService: DoctorService,
    private readonly patientService: PatientService,
    @InjectModel(BookingDraft.name)
    private readonly bookingDraftModel: Model<BookingDraftDocument>,
  ) {}

  private async createBookingDraft(patientUserId: string, body: any) {
    const patientName = String(body.patientName || '').trim();
    const patientAge = Number(body.patientAge);
    const patientPhone = String(body.patientPhone || '').trim();
    const patientGender = String(body.patientGender || '').trim();

    if (!patientName || !Number.isInteger(patientAge) || patientAge < 1 || patientAge > 120 || !/^\d{11}$/.test(patientPhone) || !patientGender) {
      throw new BadRequestException('Complete patient name, age, gender, and 11-digit phone number are required.');
    }

    if ((body.appointmentType === 'Video' || body.appointmentType === 'Online') && body.videoConsultationMethod === 'whatsapp') {
      await this.doctorService.assertVideoConsultationMethodAllowed(body.doctorId, body.videoConsultationMethod);
    }

    return this.bookingDraftModel.create({
      patientUserId,
      doctorId: body.doctorId,
      startTime: body.startTime,
      endTime: body.endTime,
      appointmentType: body.appointmentType,
      videoConsultationMethod: body.videoConsultationMethod || 'platform',
      patientName,
      patientAge,
      patientPhone,
      patientGender,
    });
  }

  private async bookFromDraft(draftId: string, paymentMethod: string, expectedPatientId?: string) {
    const draft = await this.bookingDraftModel.findById(draftId);
    if (!draft || (expectedPatientId && String(draft.patientUserId) !== String(expectedPatientId))) {
      throw new BadRequestException('Booking details are missing or expired. Please book the slot again.');
    }

    await this.doctorService.addPatientToDoctor(String(draft.patientUserId), {
      doctorId: String(draft.doctorId),
      startTime: draft.startTime,
      endTime: draft.endTime,
      appointmentType: draft.appointmentType,
      videoConsultationMethod: draft.videoConsultationMethod,
      patientName: draft.patientName,
      patientAge: draft.patientAge,
      patientPhone: draft.patientPhone,
      patientGender: draft.patientGender,
      paymentMethod,
    } as any);

    await this.bookingDraftModel.deleteOne({ _id: draft._id });
  }

  // -------------------------------------------------------------------------
  // 1. STRIPE CARD PAYMENT INTEGRATION
  // -------------------------------------------------------------------------
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Post('create-checkout-session')
  async createCheckoutSession(@Request() req, @Body() body, @Res() res) {
    try {
      const patientUserId = req.user.userId;
      const { doctorId, startTime, endTime, appointmentType, consultationFee, videoConsultationMethod } = body;

      const origin = req.headers.origin || 'http://localhost:3000';
      const draft = await this.createBookingDraft(patientUserId, body);

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'pkr',
              product_data: {
                name: 'Doctor Appointment Booking Fee',
              },
              unit_amount: Math.round(Number(consultationFee) * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          bookingDraftId: String(draft._id),
        },
        mode: 'payment',
        success_url: `${origin}/patient/appointments?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/patient/appointments?status=cancelled`,
      });

      return res.json({ url: session.url });
    } catch (error: any) {
      console.error('Stripe init error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Get('verify-checkout-session/:sessionId')
  async verifyCheckoutSession(@Param('sessionId') sessionId: string, @Res() res) {
    try {
      // 1. Retrieve session from Stripe
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') {
        return res.status(400).json({ error: 'Transaction is not paid.' });
      }

      // 2. Extract metadata
      const { bookingDraftId } = session.metadata || {};
      if (!bookingDraftId) {
        return res.status(400).json({ error: 'Invalid checkout session metadata.' });
      }

      // 3. Register booking on DB
      await this.bookFromDraft(bookingDraftId, 'card');

      return res.json({
        success: true,
        message: 'Payment verified and appointment booked!',
      });
    } catch (error: any) {
      console.error('Stripe verification error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // -------------------------------------------------------------------------
  // 2. JAZZCASH INTEGRATION (WITH SANDBOX & MOCK FALLBACK)
  // -------------------------------------------------------------------------
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Post('jazzcash/initiate')
  async initiateJazzCash(@Request() req, @Body() body, @Res() res) {
    try {
      const patientUserId = req.user.userId;
      const { doctorId, startTime, endTime, appointmentType, consultationFee, videoConsultationMethod } = body;
      const origin = req.headers.origin || 'http://localhost:3000';
      const draft = await this.createBookingDraft(patientUserId, body);

      const merchantId = process.env.JAZZCASH_MERCHANT_ID;
      const password = process.env.JAZZCASH_PASSWORD;
      const integritySalt = process.env.JAZZCASH_SALT;

      const billDescription = `JC|${String(draft._id)}`;
      const txnRefNo = `TXN${Date.now()}`;

      // Mock Mode Fallback
      if (!merchantId || !password || !integritySalt) {
        console.warn('JazzCash keys missing, running in MOCK mode.');
        const mockRedirectUrl = `${origin}/patient/appointments?status=success&mock_jc=${encodeURIComponent(billDescription)}`;
        return res.json({ url: mockRedirectUrl, mock: true });
      }

      // Secure payload parameters
      const date = new Date();
      const expiryDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      const pp_TxnDateTime = this.formatDateJC(date);
      const pp_TxnExpiryDateTime = this.formatDateJC(expiryDate);

      const params: Record<string, string> = {
        pp_Version: '1.1',
        pp_TxnType: 'MWALLET',
        pp_Language: 'EN',
        pp_MerchantID: merchantId,
        pp_SubMerchantID: '',
        pp_Password: password,
        pp_TxnRefNo: txnRefNo,
        pp_Amount: Math.round(Number(consultationFee) * 100).toString(), // in Paisas
        pp_TxnCurrency: 'PKR',
        pp_TxnDateTime,
        pp_BillReference: txnRefNo,
        pp_Description: billDescription,
        pp_TxnExpiryDateTime,
        pp_ReturnURL: `${origin}/api/payment/jazzcash/callback`,
      };

      // Compute secure HMAC hash
      const sortedKeys = Object.keys(params).sort();
      let valueString = integritySalt;
      for (const key of sortedKeys) {
        if (params[key] !== '') {
          valueString += '&' + params[key];
        }
      }
      const secureHash = crypto.createHmac('sha256', integritySalt).update(valueString).digest('hex').toUpperCase();
      params['pp_SecureHash'] = secureHash;

      // Returns the redirect payload
      return res.json({
        url: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform',
        fields: params,
        mock: false,
      });
    } catch (error: any) {
      console.error('JazzCash initiate error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Verification helper for Mock / Direct Redirect
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Post('jazzcash/verify-mock')
  async verifyMockJazzCash(@Request() req, @Body('description') description: string, @Res() res) {
    try {
      const parts = description.split('|');
      if (parts[0] !== 'JC') {
        return res.status(400).json({ error: 'Invalid description prefix.' });
      }
      await this.bookFromDraft(parts[1], 'jazzcash', req.user.userId);

      return res.json({
        success: true,
        message: 'Mock JazzCash booking created successfully!',
      });
    } catch (error: any) {
      console.error('JazzCash mock verify error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // -------------------------------------------------------------------------
  // 3. EASYPAISA INTEGRATION (WITH SANDBOX & MOCK FALLBACK)
  // -------------------------------------------------------------------------
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Post('easypaisa/initiate')
  async initiateEasyPaisa(@Request() req, @Body() body, @Res() res) {
    try {
      const patientUserId = req.user.userId;
      const { doctorId, startTime, endTime, appointmentType, consultationFee, videoConsultationMethod } = body;
      const origin = req.headers.origin || 'http://localhost:3000';
      const draft = await this.createBookingDraft(patientUserId, body);

      const storeId = process.env.EASYPAISA_STORE_ID;
      const hashKey = process.env.EASYPAISA_HASH_KEY;

      const billDescription = `EP|${String(draft._id)}`;

      // Mock Mode Fallback
      if (!storeId || !hashKey) {
        console.warn('EasyPaisa keys missing, running in MOCK mode.');
        const mockRedirectUrl = `${origin}/patient/appointments?status=success&mock_ep=${encodeURIComponent(billDescription)}`;
        return res.json({ url: mockRedirectUrl, mock: true });
      }

      // Generate actual redirect request to EasyPaisa Hosted Checkout Sandbox
      const orderId = `EP${Date.now()}`;
      const params: Record<string, string> = {
        storeId,
        amount: Number(consultationFee).toFixed(2),
        postBackURL: `${origin}/api/payment/easypaisa/callback`,
        orderRefNum: orderId,
        expiryDate: this.formatDateEP(new Date(Date.now() + 24 * 60 * 60 * 1000)),
        merchantConfirmPageUrl: `${origin}/patient/appointments?status=success`,
      };

      // EasyPaisa AES / HMAC cryptography
      const sortedKeys = Object.keys(params).sort();
      let valueString = '';
      for (const key of sortedKeys) {
        valueString += `${key}=${params[key]}&`;
      }
      valueString = valueString.slice(0, -1);

      const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(hashKey.slice(0, 16)), null);
      let encrypted = cipher.update(valueString, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return res.json({
        url: 'https://easypay.easypaisa.com.pk/easypay/index.jsf',
        fields: {
          ...params,
          transactionRefNumber: orderId,
          hash: encrypted.toUpperCase(),
        },
        mock: false,
      });
    } catch (error: any) {
      console.error('EasyPaisa initiate error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Verification helper for Mock / Direct Redirect
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles(Role.Patient)
  @Post('easypaisa/verify-mock')
  async verifyMockEasyPaisa(@Request() req, @Body('description') description: string, @Res() res) {
    try {
      const parts = description.split('|');
      if (parts[0] !== 'EP') {
        return res.status(400).json({ error: 'Invalid description prefix.' });
      }
      await this.bookFromDraft(parts[1], 'easypaisa', req.user.userId);

      return res.json({
        success: true,
        message: 'Mock EasyPaisa booking created successfully!',
      });
    } catch (error: any) {
      console.error('EasyPaisa mock verify error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // --- Utility Date Formatters ---
  private formatDateJC(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
  }

  private formatDateEP(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd} ${hh}${min}${ss}`;
  }
}
