import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

/** Najveća strana fotografije poslije smanjivanja; dovoljno za galeriju i veliki ekran. */
const PHOTO_MAX = 1600;
const LOGO_MAX = 512;

/**
 * Upload slika salona (galerija i logo). Slika se prvo smanji u pregledniku (brži upload, manje prostora
 * na serveru, poštuje EXIF rotaciju sa telefona), pa ide na POST /api/uploads/vendors/{id}, koji vraća adresu.
 */
@Injectable({ providedIn: 'root' })
export class UploadApi {
  private readonly http = inject(HttpClient);

  vendorImage(vendorId: number, file: File, kind: 'photo' | 'logo' = 'photo'): Observable<string> {
    return from(shrink(file, kind)).pipe(
      switchMap((blob) => {
        const body = new FormData();
        body.append('file', blob, blob.type === 'image/png' ? 'slika.png' : 'slika.jpg');
        return this.http.post<{ url: string }>(
          `${environment.apiUrl}/uploads/vendors/${vendorId}`,
          body,
        );
      }),
      map((r) => r.url),
    );
  }
}

/** Fotografije u JPEG (max 1600 px), logo u PNG (max 512 px, zadržava prozirnost). */
export async function shrink(file: File, kind: 'photo' | 'logo'): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error('Dozvoljene su slike JPG, PNG i WebP.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const max = kind === 'logo' ? LOGO_MAX : PHOTO_MAX;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Slika se ne može obraditi.');
  if (kind === 'photo') {
    // JPEG nema prozirnost: bijela podloga umjesto crne
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = kind === 'logo' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  if (!blob) throw new Error('Slika se ne može obraditi.');
  return blob;
}
