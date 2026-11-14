import { Service, inject } from '@angular/core';
import { Attachment } from '../models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

@Service()
export class UploadService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  validate(files: FileList | File[]): File[] {
    const list = Array.from(files);
    const tooLarge = list.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      throw new Error(`"${tooLarge.name}" is larger than the 25 MB limit.`);
    }
    if (list.length > 10) {
      throw new Error('You can attach up to 10 files at a time.');
    }
    return list;
  }

  async upload(file: File, channelId: string): Promise<Attachment> {
    const dimensions = await this.imageDimensions(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${channelId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    if (!this.supabase.client || this.auth.isDemo()) {
      return {
        id: crypto.randomUUID(),
        name: file.name,
        url: URL.createObjectURL(file),
        size: file.size,
        type: file.type || 'application/octet-stream',
        width: dimensions.width,
        height: dimensions.height,
      };
    }

    const { error } = await this.supabase.client.storage
      .from('chat-attachments')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });

    if (error) throw new Error(error.message);

    const { data } = this.supabase.client.storage.from('chat-attachments').getPublicUrl(path);

    return {
      id: crypto.randomUUID(),
      name: file.name,
      url: data.publicUrl,
      size: file.size,
      type: file.type || 'application/octet-stream',
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  async uploadVoiceNote(blob: Blob, duration: number, channelId: string): Promise<Attachment> {
    const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = `voice-message-${Date.now()}.${extension}`;
    const file = new File([blob], filename, { type: blob.type || 'audio/webm' });

    try {
      const attachment = await this.upload(file, channelId);
      return { ...attachment, type: 'audio', duration };
    } catch {
      // Fallback to base64 Data URL so voice notes ALWAYS work seamlessly
      const dataUrl = await this.blobToDataUrl(blob);
      return {
        id: crypto.randomUUID(),
        name: filename,
        url: dataUrl,
        size: blob.size,
        type: 'audio',
        duration,
      };
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  private imageDimensions(file: File): Promise<{ width?: number; height?: number }> {
    if (!file.type.startsWith('image/')) return Promise.resolve({});

    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };
      image.src = url;
    });
  }
}
