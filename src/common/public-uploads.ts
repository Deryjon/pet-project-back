import { Router, static as serveStatic } from 'express';
import { extname, join } from 'path';
import { PUBLIC_IMAGE_EXTENSIONS } from './image-upload';

// Only explicitly public assets are served anonymously. Invoice originals
// (including legacy uploads/invoices files) require the invoice API.
export function publicUploads(root = join(process.cwd(), 'uploads')) {
  const router = Router();
  // Only images are public, and never sniffed or run as a page: a stored
  // file with any other extension (e.g. an old .html upload) is not served.
  router.use((req, res, next) => {
    if (!PUBLIC_IMAGE_EXTENSIONS.includes(extname(req.path).toLowerCase())) {
      res.status(404).end();
      return;
    }
    next();
  });
  const headers = {
    setHeaders: (res: { setHeader(name: string, value: string): void }) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
    },
  };
  for (const directory of ['products', 'avatars']) {
    router.use(`/${directory}`, serveStatic(join(root, directory), headers));
  }
  return router;
}
