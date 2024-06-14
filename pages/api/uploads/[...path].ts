import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';

const handler = (req: NextApiRequest, res: NextApiResponse) => {
    const { path: filePath } = req.query;
    const fileFullPath = path.join(process.cwd(), 'uploads', ...(filePath as string[]));

    if (fs.existsSync(fileFullPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        fs.createReadStream(fileFullPath).pipe(res);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
};

export default handler;
