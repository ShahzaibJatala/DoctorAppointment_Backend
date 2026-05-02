import { BadRequestException, Controller, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from './cloudinary.service'; // Adjust path if needed
import * as fs from 'fs/promises';

@Controller('images')
export class ImageController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('Image'))
  async uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Make sure the field name is "Image".');
    }

    try {
      const result = await this.cloudinaryService.uploadImage(file.path);
      return result;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      throw new BadRequestException(`Failed to upload image. ${error?.message ?? ''}`);
    } finally {
      if (file?.path) {
        await fs.unlink(file.path).catch(err => console.error('Error deleting file:', err));
      }
    }
  }
}
