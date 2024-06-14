import { NextApiRequest, NextApiResponse } from 'next';
import { v1 } from '@google-cloud/documentai';
import formidable, { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';

const uploadDir = path.join(process.cwd(), '/uploads');
fs.mkdirSync(uploadDir, { recursive: true });

export const config = {
    api: {
        bodyParser: false,
    },
};

interface BoundingBox {
    x: number;
    y: number;
}

interface Metadata {
    pageNumber: number;
    text: string;
    fieldType: string;
    length?: string;
    values?: string;
    boundingBox: BoundingBox[];
    [key: string]: any; 
}

const uploadHandler = async (req: NextApiRequest, res: NextApiResponse) => {
    const form = new IncomingForm({
        uploadDir,
        keepExtensions: true,
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.status(500).send(err);
            return;
        }

        const file = Array.isArray(files.file) ? files.file[0] : files.file;
        if (!file) {
            res.status(400).send('No file uploaded.');
            return;
        }

        const filePath = file.filepath;
        const fileName = file.newFilename;

        const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || '';
        const location = process.env.NEXT_PUBLIC_LOCATION || '';
        const ocrProcessorId = process.env.NEXT_PUBLIC_OCR_PROCESSOR_ID || '';

        if (!projectId || !location || !ocrProcessorId) {
            res.status(500).send('Missing required environment variables.');
            return;
        }

        const client = new v1.DocumentProcessorServiceClient();

        const ocrProcessorPath = client.processorPath(projectId, location, ocrProcessorId);

        const readFile = fs.readFileSync(filePath);
        const encodedFile = Buffer.from(readFile).toString('base64');

        try {
            const [ocrResult] = await client.processDocument({
                name: ocrProcessorPath,
                rawDocument: {
                    content: encodedFile,
                    mimeType: 'application/pdf',
                },
            });

            const text = ocrResult.document?.text || '';
            const pages = ocrResult.document?.pages || [];

            const metadata = pages.flatMap((page) => {
                return page.blocks?.map((block) => {
                    const textSegments = block.layout?.textAnchor?.textSegments || [];
                    const boundingBox = (block.layout?.boundingPoly?.vertices || []).map(vertex => ({
                        x: vertex.x ?? 0, // Default to 0 if undefined or null
                        y: vertex.y ?? 0, // Default to 0 if undefined or null
                    }));

                    // Process text segments to extract text
                    const fieldText = textSegments.map((segment) => {
                        const startIndex = typeof segment.startIndex === 'number'
                            ? segment.startIndex
                            : typeof segment.startIndex === 'string'
                                ? parseInt(segment.startIndex, 10)
                                : segment.startIndex?.toNumber() ?? 0;

                        const endIndex = typeof segment.endIndex === 'number'
                            ? segment.endIndex
                            : typeof segment.endIndex === 'string'
                                ? parseInt(segment.endIndex, 10)
                                : segment.endIndex?.toNumber() ?? 0;

                        return text.substring(startIndex, endIndex);
                    }).join('');

                    return {
                        pageNumber: page.pageNumber ?? 0, // Default to 0 if undefined or null
                        text: fieldText,
                        boundingBox,
                        fieldType: 'text', // Default type, will determine based on text later
                    };
                }) || [];
            });

            // Segment the metadata into fields and values
            const segmentedMetadata = segmentMetadata(metadata);

            res.status(200).json({ metadata: segmentedMetadata, fileUrl: `/uploads/${fileName}` });
        } catch (error) {
            res.status(500).send(`Error processing document: ${error}`);
        }
    });
};

const segmentMetadata = (metadata: Metadata[]): Metadata[] => {
    const segmentedMetadata: Metadata[] = [];
    metadata.forEach((field) => {
        segmentedMetadata.push({
            ...field,
            text: field.text.trim(),
            fieldType: 'text'
        });
    });
    return segmentedMetadata;
};

export default uploadHandler;
