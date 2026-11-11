import { createAPI } from '../../server/api';
import { blobStore } from '../../server/store';
export default async (request: Request, context: { ip?: string }) =>
  createAPI(blobStore(), {
    adminEmail: process.env.ADMIN_EMAIL,
    adminHash: process.env.ADMIN_PASSWORD_HASH,
  })(request, context.ip);
