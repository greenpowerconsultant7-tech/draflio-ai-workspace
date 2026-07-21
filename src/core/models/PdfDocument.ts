export interface PdfDocument {
  /** Unique ID for drag & drop */
  id: string;

  /** Original uploaded file */
  file: File;

  /** Display name */
  name: string;

  /** File size */
  size: number;

  /** Total pages (loaded later) */
  pages?: number;

  /** Thumbnail image */
  thumbnail?: string;

  /** Rotation angle */
  rotation: 0 | 90 | 180 | 270;

  /** Optional password */
  password?: string;
}