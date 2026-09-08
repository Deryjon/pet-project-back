import { Router, static as serveStatic } from 'express';
import { join } from 'path';

// Only explicitly public assets are served anonymously. Invoice originals
// (including legacy uploads/invoices files) require the invoice API.
export function publicUploads(root = join(process.cwd(), 'uploads')) {
  const router = Router();
  for (const directory of ['products', 'avatars']) {
    router.use(`/${directory}`, serveStatic(join(root, directory)));
  }
  return router;
}
