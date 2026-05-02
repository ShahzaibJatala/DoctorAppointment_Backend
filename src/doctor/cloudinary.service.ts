import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
    constructor(private readonly configService: ConfigService) {
        const cloudName = configService.get<string>('CLOUDINARY_NAME');
        const apiKey = configService.get<string>('CLOUDINARY_API_KEY');
        const apiSecret = configService.get<string>('CLOUDINARY_API_SECRET');
        if (!cloudName || !apiKey || !apiSecret) {
            throw new Error('Cloudinary configuration is missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
            secure: true,
        });
    }

    async uploadImage(
        filePath: string,
    ): Promise<UploadApiResponse> {
        return new Promise((resolve, reject) => {
            cloudinary.uploader.upload(
                filePath,
                { folder: 'doctorProfile' },
                (error, result) => {
                    if (error) {
                        return reject(error);
                    }
                    resolve(result as UploadApiResponse);
                },
            );
        });
    }
}



